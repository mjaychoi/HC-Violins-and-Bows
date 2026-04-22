import type { SupabaseClient } from '@supabase/supabase-js';
import type { PostgrestError } from '@supabase/supabase-js';
import type { Json, TablesInsert } from '@/types/database';
import { logInfo, logWarn } from '@/utils/logger';
import { CLIENT_TABLE_SELECT, type ClientsTableRow } from '@/utils/clientDbMap';

const MAX_ALLOCATION_ATTEMPTS = 8;
const CLIENT_CONNECTIONS_SELECT =
  'id, client_id, instrument_id, relationship_type, notes, display_order, created_at';

const ALLOCATION_EXHAUSTED_FLAG = 'client_number_allocation_exhausted';

/**
 * `PostgrestError.details` when the RPC completed without transport error but the
 * JSONB payload could not be parsed and DB recovery did not find a row (write may
 * still have succeeded). Routes should map this to HTTP 503 + `create_response_malformed`.
 */
export const CREATE_CLIENT_RPC_RESPONSE_ASSEMBLY_FAILED =
  'rpc_response_assembly' as const;

export function isCreateClientRpcResponseAssemblyFailure(
  err: PostgrestError | null | undefined
): boolean {
  return err?.details === CREATE_CLIENT_RPC_RESPONSE_ASSEMBLY_FAILED;
}

/** Formats a positive integer suffix as CL### (used for DB + API output). */
export function formatClClientNumberFromSuffix(n: number): string {
  return `CL${String(n).padStart(3, '0')}`;
}

function isPostgresUniqueViolation(
  err: PostgrestError | null | undefined
): boolean {
  return err?.code === '23505';
}

export function isClientNumberAllocationExhausted(
  err: PostgrestError | null | undefined
): boolean {
  if (!err) return false;
  const blob =
    `${err.details ?? ''} ${err.hint ?? ''} ${err.message ?? ''}`.toLowerCase();
  return (
    blob.includes(ALLOCATION_EXHAUSTED_FLAG) ||
    blob.includes('allocation_exhausted')
  );
}

/**
 * Next numeric suffix (1 = CL001) for standard CL* numbers, from DB state.
 * Ignores malformed legacy values (see `max_cl_suffix_for_org` migration).
 */
export async function getNextClSuffixFromDb(
  supabase: SupabaseClient,
  orgId: string
): Promise<number> {
  const { data, error } = await supabase.rpc('max_cl_suffix_for_org', {
    p_org_id: orgId,
  });
  if (error) {
    throw error;
  }
  const max =
    typeof data === 'number' && !Number.isNaN(data)
      ? data
      : parseInt(String(data ?? '0'), 10) || 0;
  return max + 1;
}

type ClientInsertBody = Pick<
  TablesInsert<'clients'>,
  'name' | 'email' | 'phone' | 'client_number' | 'tags' | 'interest' | 'note'
>;

type RpcClientWithLinksArgs = {
  p_name: string;
  p_email: string | null;
  p_phone: string | null;
  p_client_number: string | null;
  p_links: Json;
  p_tags: string[] | null;
  p_interest: string | null;
  p_note: string | null;
};

export type CreateClientWithConnectionsPayload = {
  client: ClientsTableRow;
  connections: unknown[];
};

/**
 * JSONB payload from `create_client_with_connections_atomic` (migration 00000000000060).
 */
export function parseCreateClientWithConnectionsPayload(
  raw: unknown
): CreateClientWithConnectionsPayload | null {
  if (raw == null) return null;
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null) return null;
  const o = value as Record<string, unknown>;
  const client = o.client;
  const connections = o.connections;
  if (typeof client !== 'object' || client === null) return null;
  if (!Array.isArray(connections)) return null;
  return { client: client as ClientsTableRow, connections };
}

async function recoverClientWithConnectionsPayload(
  supabase: SupabaseClient,
  orgId: string,
  clientNumber: string
): Promise<CreateClientWithConnectionsPayload | null> {
  const { data: clientData, error: clientError } = await supabase
    .from('clients')
    .select(CLIENT_TABLE_SELECT)
    .eq('org_id', orgId)
    .eq('client_number', clientNumber)
    .maybeSingle();

  if (clientError || !clientData) {
    logWarn(
      'create_client_with_connections recovery could not find created client row',
      'rpcCreateClientWithConnectionsAtomic',
      {
        orgId,
        clientNumber,
        error: clientError?.message ?? null,
      }
    );
    return null;
  }

  const { data: connectionsData, error: connectionsError } = await supabase
    .from('client_instruments')
    .select(CLIENT_CONNECTIONS_SELECT)
    .eq('org_id', orgId)
    .eq('client_id', clientData.id)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (connectionsError) {
    logWarn(
      'create_client_with_connections recovered client row but could not re-read connections',
      'rpcCreateClientWithConnectionsAtomic',
      {
        orgId,
        clientId: clientData.id,
        clientNumber,
        error: connectionsError.message,
      }
    );
    return {
      client: clientData as ClientsTableRow,
      connections: [],
    };
  }

  return {
    client: clientData as ClientsTableRow,
    connections: Array.isArray(connectionsData) ? connectionsData : [],
  };
}

/**
 * Inserts a client row. Always server-allocates the next `CL###` for the org
 * (no caller-controlled client_number) with bounded retries on unique races.
 */
export async function insertClientWithClientNumber(
  supabase: SupabaseClient,
  orgId: string,
  body: ClientInsertBody,
  select: string
): Promise<
  { data: unknown; error: null } | { data: null; error: PostgrestError }
> {
  for (let i = 0; i < MAX_ALLOCATION_ATTEMPTS; i++) {
    const attempt = i + 1;
    const nextSuffix = await getNextClSuffixFromDb(supabase, orgId);
    const candidate = formatClClientNumberFromSuffix(nextSuffix);
    const result = (await supabase
      .from('clients')
      .insert({
        name: body.name,
        email: body.email,
        phone: body.phone,
        org_id: orgId,
        client_number: candidate,
        tags: body.tags ?? [],
        interest: body.interest ?? null,
        note: body.note ?? null,
      } as never)
      .select(select)
      .single()) as { data: unknown; error: PostgrestError | null };
    if (!result.error) {
      if (i > 0) {
        logInfo(
          'client_number insert succeeded after 23505 retry',
          'insertClientWithClientNumber',
          { orgId, attempt, lastCandidate: candidate }
        );
      }
      return { data: result.data, error: null };
    }
    if (isPostgresUniqueViolation(result.error)) {
      logWarn(
        'client_number allocation conflict (23505), retrying',
        'insertClientWithClientNumber',
        { orgId, attempt, lastCandidate: candidate }
      );
      continue;
    }
    return { data: null, error: result.error };
  }

  logWarn(
    'client_number allocation exhausted after bounded retries',
    'insertClientWithClientNumber',
    { orgId, attempts: MAX_ALLOCATION_ATTEMPTS }
  );

  return {
    data: null,
    error: {
      name: 'PostgresError',
      code: '23505',
      message:
        'Could not assign a client number after several attempts. Please try again in a moment.',
      details: ALLOCATION_EXHAUSTED_FLAG,
      hint: 'retry_suggested',
    } as unknown as PostgrestError,
  };
}

/**
 * `create_client_with_connections_atomic` with server-side `p_client_number` only
 * (bounded retries; JSONB payload in migration 00000000000060).
 */
export async function rpcCreateClientWithConnectionsAtomic(
  supabase: SupabaseClient,
  orgId: string,
  body: {
    name: string;
    email: string | null;
    phone: string | null;
    tags: string[];
    interest: string | null;
    note: string | null;
  },
  pLinks: Json
): Promise<
  | { data: CreateClientWithConnectionsPayload; error: null }
  | { data: null; error: PostgrestError }
> {
  const tagArray = body.tags;
  for (let i = 0; i < MAX_ALLOCATION_ATTEMPTS; i++) {
    const attempt = i + 1;
    const nextSuffix = await getNextClSuffixFromDb(supabase, orgId);
    const candidate = formatClClientNumberFromSuffix(nextSuffix);
    const result = await supabase.rpc('create_client_with_connections_atomic', {
      p_name: body.name,
      p_email: body.email,
      p_phone: body.phone,
      p_client_number: candidate,
      p_links: pLinks,
      p_tags: tagArray.length > 0 ? tagArray : null,
      p_interest: body.interest,
      p_note: body.note,
    } satisfies RpcClientWithLinksArgs);
    if (!result.error) {
      const parsed = parseCreateClientWithConnectionsPayload(result.data);
      if (parsed) {
        if (i > 0) {
          logInfo(
            'create_client_with_connections succeeded after 23505 retry',
            'rpcCreateClientWithConnectionsAtomic',
            { orgId, attempt, lastCandidate: candidate }
          );
        }
        return { data: parsed, error: null };
      }
      logWarn(
        'create_client_with_connections RPC ok but payload was not valid JSONB shape',
        'rpcCreateClientWithConnectionsAtomic',
        { orgId, attempt, lastCandidate: candidate }
      );
      const recovered = await recoverClientWithConnectionsPayload(
        supabase,
        orgId,
        candidate
      );
      if (recovered) {
        logWarn(
          'create_client_with_connections response recovered from DB after malformed RPC payload',
          'rpcCreateClientWithConnectionsAtomic',
          { orgId, attempt, lastCandidate: candidate }
        );
        return { data: recovered, error: null };
      }
      return {
        data: null,
        error: {
          name: 'PostgresError',
          code: 'XX000',
          message: 'create_client_with_connections response payload malformed',
          details: CREATE_CLIENT_RPC_RESPONSE_ASSEMBLY_FAILED,
          hint: null,
        } as unknown as PostgrestError,
      };
    }
    if (isPostgresUniqueViolation(result.error)) {
      logWarn(
        'client_number allocation conflict on RPC (23505), retrying',
        'rpcCreateClientWithConnectionsAtomic',
        { orgId, attempt, lastCandidate: candidate }
      );
      continue;
    }
    return { data: null, error: result.error };
  }

  logWarn(
    'client_number RPC allocation exhausted after bounded retries',
    'rpcCreateClientWithConnectionsAtomic',
    { orgId, attempts: MAX_ALLOCATION_ATTEMPTS }
  );

  return {
    data: null,
    error: {
      name: 'PostgresError',
      code: '23505',
      message:
        'Could not assign a client number after several attempts. Please try again in a moment.',
      details: ALLOCATION_EXHAUSTED_FLAG,
      hint: 'retry_suggested',
    } as unknown as PostgrestError,
  };
}
