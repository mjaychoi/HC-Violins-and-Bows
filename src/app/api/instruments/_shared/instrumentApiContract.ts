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
type ContractProbeOutcome = 'ok' | 'missing' | 'unknown_error';

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

function getErrorCode(error: unknown): string {
  if (!isRecord(error)) return '';
  return typeof error.code === 'string' ? error.code : '';
}

function getErrorMessage(error: unknown): string {
  if (!isRecord(error)) return '';
  return typeof error.message === 'string' ? error.message.toLowerCase() : '';
}

function getErrorDetails(error: unknown): string {
  if (!isRecord(error)) return '';
  return typeof error.details === 'string' ? error.details.toLowerCase() : '';
}

function getErrorText(error: unknown): string {
  return `${getErrorMessage(error)} ${getErrorDetails(error)}`.trim();
}

function isPermissionOrAuthError(error: unknown): boolean {
  const code = getErrorCode(error);
  const text = getErrorText(error);

  return (
    code === '42501' ||
    text.includes('permission denied') ||
    text.includes('insufficient privilege') ||
    text.includes('not authorized')
  );
}

export function isInstrumentIdempotencyTableMissingError(
  error: unknown
): boolean {
  const code = getErrorCode(error);
  const msg = getErrorMessage(error);
  const details = getErrorDetails(error);

  if (code === '42P01' || code === 'PGRST205') return true;

  if (
    msg.includes('instrument_create_idempotency') &&
    msg.includes('does not exist')
  ) {
    return true;
  }

  if (
    msg.includes('could not find the table') &&
    msg.includes('instrument_create')
  ) {
    return true;
  }

  if (details.includes('instrument_create_idempotency')) {
    return true;
  }

  return false;
}

export function isInstrumentSaleRpcMissingOrArityError(
  error: unknown
): boolean {
  const code = getErrorCode(error);
  const msg = getErrorMessage(error);

  if (code === '42883') return true;
  if (msg.includes('could not find the function')) return true;

  if (
    msg.includes('update_instrument_sale_transition_atomic') &&
    (msg.includes('does not exist') || msg.includes('unknown function'))
  ) {
    return true;
  }

  if (
    msg.includes('function') &&
    msg.includes('not found in the schema cache')
  ) {
    return true;
  }

  return false;
}

/**
 * The sale RPC probe intentionally uses a fake instrument id and null payloads.
 * If the function exists, the database may return a domain/business error such
 * as not-found or concurrency conflict. Those errors prove the RPC is callable,
 * so they should be treated as contract-ok rather than probe failure.
 */
function isExpectedSaleRpcProbeExecutionError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (isInstrumentSaleRpcMissingOrArityError(error)) return false;
  if (isPermissionOrAuthError(error)) return false;

  const code = getErrorCode(error);
  const text = getErrorText(error);

  if (
    text.includes('instrument_concurrency_conflict') ||
    text.includes('instrument not found') ||
    text.includes('not found') ||
    text.includes('expected_updated_at') ||
    text.includes('updated_at') ||
    text.includes('no rows') ||
    text.includes('invalid instrument')
  ) {
    return true;
  }

  // PostgreSQL raised exception / no data / FK-check style errors here usually
  // mean the function exists and executed with intentionally invalid probe data.
  if (['P0001', 'P0002', '23503', '23514'].includes(code)) {
    return true;
  }

  return false;
}

export function instrumentSchemaContractMissingResult(
  missing: string[]
): ApiHandlerResult {
  const missingText = missing.length > 0 ? missing.join(', ') : 'unknown';

  return {
    status: 503,
    payload: {
      success: false,
      error: `Instrument API database contract is missing or inconclusive. Apply pending migrations or inspect contract probe failures: ${missingText}.`,
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
): Promise<ContractProbeOutcome> {
  const { error } = await client
    .from('instrument_create_idempotency')
    .select('org_id')
    .limit(0);

  if (!error) return 'ok';
  if (isInstrumentIdempotencyTableMissingError(error)) return 'missing';

  logWarn(
    'instrument_idempotency_table_probe_unexpected_error',
    'instrumentApiContract',
    {
      code: getErrorCode(error),
      message: getErrorMessage(error),
    }
  );

  return 'unknown_error';
}

async function probeSaleRpcContract(
  client: SupabaseClient
): Promise<ContractProbeOutcome> {
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
  if (isExpectedSaleRpcProbeExecutionError(error)) return 'ok';

  logWarn(
    'instrument_sale_rpc_probe_unexpected_error',
    'instrumentApiContract',
    {
      code: getErrorCode(error),
      message: getErrorMessage(error),
    }
  );

  return 'unknown_error';
}

/**
 * Fail closed when idempotency table is absent.
 * Probe results are cached per process.
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

  // Unknown probe errors are not cached and do not block runtime requests,
  // because the real request path can still succeed. Admin health check below
  // is stricter and reports inconclusive probes as unhealthy.
  logWarn(
    'instrument_idempotency_table_probe_inconclusive',
    'instrumentApiContract',
    {}
  );

  return null;
}

/**
 * Fail closed when sale RPC is missing or wrong arity.
 * Probe results are cached per process.
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

  // Unknown probe errors are not cached and do not block runtime requests.
  // This avoids false negatives caused by probe-specific business errors.
  logWarn(
    'instrument_sale_rpc_probe_inconclusive',
    'instrumentApiContract',
    {}
  );

  return null;
}

/**
 * Admin readiness: both table and RPC must be present and probeable.
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
    } else if (tableOutcome === 'unknown_error') {
      missing.push('instrument_create_idempotency_probe_inconclusive');
    }

    const rpcOutcome = await probeSaleRpcContract(admin);
    if (rpcOutcome === 'missing') {
      missing.push('update_instrument_sale_transition_atomic');
    } else if (rpcOutcome === 'unknown_error') {
      missing.push(
        'update_instrument_sale_transition_atomic_probe_inconclusive'
      );
    }

    if (missing.length > 0) {
      logWarn(
        'instrument_api_contract_admin_probe_unhealthy',
        'instrumentApiContract',
        {
          missing,
          tableOutcome,
          rpcOutcome,
        }
      );
    }

    return {
      ok: missing.length === 0,
      missing,
    };
  } catch (error) {
    logWarn(
      'instrument_api_contract_admin_probe_exception',
      'instrumentApiContract',
      {
        reason: error instanceof Error ? error.message : String(error),
      }
    );

    return {
      ok: false,
      missing: ['instrument_api_contract_admin_probe_exception'],
    };
  }
}
