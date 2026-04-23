import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiHandlerResult } from '@/app/api/_utils/apiHandler';
import { logWarn } from '@/utils/logger';

export const INSTRUMENT_SCHEMA_CONTRACT_ERROR_CODE =
  'INSTRUMENT_SCHEMA_CONTRACT_MISSING';
export const INSTRUMENT_PATCH_UPDATED_AT_REQUIRED_CODE =
  'INSTRUMENT_PATCH_UPDATED_AT_REQUIRED';

const CONTRACT_PROBE_TTL_MS = 60_000;
const PROBE_INSTRUMENT_ID = '00000000-0000-4000-8000-0000000000a1';

type ContractCacheEntry = { ok: boolean; at: number };

let idempotencyTableCache: ContractCacheEntry | null = null;
let saleRpcCache: ContractCacheEntry | null = null;

/** Test helper: clears cached probe results. */
export function resetInstrumentApiContractCacheForTests(): void {
  idempotencyTableCache = null;
  saleRpcCache = null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isInstrumentIdempotencyTableMissingError(
  error: unknown
): boolean {
  if (!isRecord(error)) return false;
  const code = typeof error.code === 'string' ? error.code : '';
  const msg =
    typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const details =
    typeof error.details === 'string' ? error.details.toLowerCase() : '';

  if (code === '42P01' || code === 'PGRST205') return true;
  if (
    msg.includes('instrument_create_idempotency') &&
    msg.includes('does not exist')
  )
    return true;
  if (
    msg.includes('could not find the table') &&
    msg.includes('instrument_create')
  )
    return true;
  if (details.includes('instrument_create_idempotency')) return true;
  return false;
}

export function isInstrumentSaleRpcMissingOrArityError(
  error: unknown
): boolean {
  if (!isRecord(error)) return false;
  const code = typeof error.code === 'string' ? error.code : '';
  const msg =
    typeof error.message === 'string' ? error.message.toLowerCase() : '';
  if (code === '42883') return true;
  if (msg.includes('could not find the function')) return true;
  if (
    msg.includes('update_instrument_sale_transition_atomic') &&
    (msg.includes('does not exist') || msg.includes('unknown function'))
  ) {
    return true;
  }
  if (msg.includes('function') && msg.includes('not found in the schema cache'))
    return true;
  return false;
}

export function instrumentSchemaContractMissingResult(
  missing: string[]
): ApiHandlerResult {
  return {
    status: 503,
    payload: {
      success: false,
      error:
        'Instrument API database contract is missing. Apply pending migrations: public.instrument_create_idempotency and public.update_instrument_sale_transition_atomic (7-argument form, including p_expected_updated_at).',
      error_code: INSTRUMENT_SCHEMA_CONTRACT_ERROR_CODE,
      details: { missing },
    },
  };
}

export function instrumentPatchUpdatedAtRequiredResult(
  apiPath: string
): ApiHandlerResult {
  logWarn('instrument_patch_missing_updated_at', 'instrumentApiContract', {
    apiPath,
    outdated_caller: true,
    grep_hint: 'INSTRUMENT_PATCH_UPDATED_AT_REQUIRED',
  });

  return {
    status: 400,
    payload: {
      success: false,
      error:
        'updated_at is required for optimistic concurrency. Send the instrument row’s current updated_at from the server. Outdated API clients must be upgraded.',
      error_code: INSTRUMENT_PATCH_UPDATED_AT_REQUIRED_CODE,
      details: {
        caller_hint: 'include_updated_at_from_instrument_row',
        apiPath,
      },
    },
  };
}

export function requireInstrumentPatchUpdatedAt(
  body: Record<string, unknown>,
  apiPath: string
):
  | { ok: true; expectedUpdatedAt: string }
  | { ok: false; result: ApiHandlerResult } {
  const expectedRaw = body.updated_at;
  if (typeof expectedRaw !== 'string' || !expectedRaw.trim()) {
    return {
      ok: false,
      result: instrumentPatchUpdatedAtRequiredResult(apiPath),
    };
  }
  return { ok: true, expectedUpdatedAt: expectedRaw.trim() };
}

async function probeIdempotencyTable(
  client: SupabaseClient
): Promise<'ok' | 'missing' | 'unknown_error'> {
  const { error } = await client
    .from('instrument_create_idempotency')
    .select('org_id')
    .limit(0);

  if (!error) return 'ok';
  if (isInstrumentIdempotencyTableMissingError(error)) return 'missing';
  return 'unknown_error';
}

async function probeSaleRpcContract(
  client: SupabaseClient
): Promise<'ok' | 'missing' | 'unknown_error'> {
  const { error } = await client.rpc(
    'update_instrument_sale_transition_atomic',
    {
      p_instrument_id: PROBE_INSTRUMENT_ID,
      p_patch: {},
      p_sale_price: null,
      p_sale_date: null,
      p_client_id: null,
      p_sales_note: null,
      p_expected_updated_at: null,
    }
  );

  if (!error) return 'ok';
  if (isInstrumentSaleRpcMissingOrArityError(error)) return 'missing';
  return 'unknown_error';
}

/**
 * Fail closed when idempotency table is absent (cached per process).
 */
export async function ensureInstrumentIdempotencyTableContract(
  client: SupabaseClient
): Promise<ApiHandlerResult | null> {
  const now = Date.now();
  if (
    idempotencyTableCache &&
    now - idempotencyTableCache.at < CONTRACT_PROBE_TTL_MS
  ) {
    return idempotencyTableCache.ok
      ? null
      : instrumentSchemaContractMissingResult([
          'instrument_create_idempotency',
        ]);
  }

  const outcome = await probeIdempotencyTable(client);
  if (outcome === 'ok') {
    idempotencyTableCache = { ok: true, at: now };
    return null;
  }
  if (outcome === 'missing') {
    idempotencyTableCache = { ok: false, at: now };
    logWarn('instrument_schema_contract_missing', 'instrumentApiContract', {
      surface: 'instrument_create_idempotency',
    });
    return instrumentSchemaContractMissingResult([
      'instrument_create_idempotency',
    ]);
  }

  logWarn(
    'instrument_idempotency_table_probe_inconclusive',
    'instrumentApiContract',
    {}
  );
  return null;
}

/**
 * Fail closed when sale RPC is missing or wrong arity (cached per process).
 */
export async function ensureInstrumentSaleRpcContract(
  client: SupabaseClient
): Promise<ApiHandlerResult | null> {
  const now = Date.now();
  if (saleRpcCache && now - saleRpcCache.at < CONTRACT_PROBE_TTL_MS) {
    return saleRpcCache.ok
      ? null
      : instrumentSchemaContractMissingResult([
          'update_instrument_sale_transition_atomic',
        ]);
  }

  const outcome = await probeSaleRpcContract(client);
  if (outcome === 'ok') {
    saleRpcCache = { ok: true, at: now };
    return null;
  }
  if (outcome === 'missing') {
    saleRpcCache = { ok: false, at: now };
    logWarn('instrument_schema_contract_missing', 'instrumentApiContract', {
      surface: 'update_instrument_sale_transition_atomic',
    });
    return instrumentSchemaContractMissingResult([
      'update_instrument_sale_transition_atomic',
    ]);
  }

  logWarn(
    'instrument_sale_rpc_probe_inconclusive',
    'instrumentApiContract',
    {}
  );
  return null;
}

/**
 * Admin readiness: both table and RPC must be callable (service role).
 */
export async function checkInstrumentApiContractAdmin(): Promise<{
  ok: boolean;
  missing: string[];
}> {
  try {
    const { getAdminSupabase } = await import('@/lib/supabase-server');
    const admin = getAdminSupabase();
    const missing: string[] = [];

    const tableOutcome = await probeIdempotencyTable(admin);
    if (tableOutcome === 'missing') {
      missing.push('instrument_create_idempotency');
    }

    const rpcOutcome = await probeSaleRpcContract(admin);
    if (rpcOutcome === 'missing') {
      missing.push('update_instrument_sale_transition_atomic');
    }

    if (tableOutcome === 'unknown_error' || rpcOutcome === 'unknown_error') {
      logWarn(
        'instrument_api_contract_admin_probe_inconclusive',
        'instrumentApiContract',
        {
          tableOutcome,
          rpcOutcome,
        }
      );
    }

    return { ok: missing.length === 0, missing };
  } catch {
    return {
      ok: false,
      missing: ['instrument_api_contract_admin_probe_exception'],
    };
  }
}
