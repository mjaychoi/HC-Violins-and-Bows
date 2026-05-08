import { createHash } from 'crypto';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type IdempotencyRow = {
  org_id: string;
  user_id: string;
  route_key: string;
  idempotency_key: string;
  request_hash: string;
  status: 'in_progress' | 'completed';
  response_payload: Record<string, unknown> | null;
};

type QueryResult<T> = Promise<{ data: T; error: SupabaseErrorLike | null }>;

type IdempotencyQuery = {
  select(columns?: string): IdempotencyQuery;
  eq(column: string, value: unknown): IdempotencyQuery;
  maybeSingle(): QueryResult<IdempotencyRow | null>;
  single(): QueryResult<IdempotencyRow>;
  insert(row: Partial<IdempotencyRow>): IdempotencyQuery;
  update(row: Partial<IdempotencyRow>): IdempotencyQuery;
  delete(): IdempotencyQuery;
};

type IdempotencySupabase = {
  from(table: 'api_create_idempotency'): IdempotencyQuery;
};

export type CreateIdempotencyClaim =
  | { kind: 'none' }
  | { kind: 'claimed'; idempotencyKey: string }
  | { kind: 'replay'; payload: Record<string, unknown> }
  | { kind: 'conflict'; payload: Record<string, unknown>; status: number };

function idempotencyTable(auth: AuthContext): IdempotencyQuery {
  return (auth.userSupabase as unknown as IdempotencySupabase).from(
    'api_create_idempotency'
  );
}

function normalizeIdempotencyKey(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  return trimmed;
}

function scopedQuery(
  auth: AuthContext,
  routeKey: string,
  idempotencyKey: string
): IdempotencyQuery {
  return idempotencyTable(auth)
    .select('*')
    .eq('org_id', auth.orgId!)
    .eq('user_id', auth.user.id)
    .eq('route_key', routeKey)
    .eq('idempotency_key', idempotencyKey);
}

export function getCreateIdempotencyKey(request: Request): string | null {
  return normalizeIdempotencyKey(request.headers.get('Idempotency-Key'));
}

export function createRequestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function claimCreateIdempotency(
  request: Request,
  auth: AuthContext,
  routeKey: string,
  requestHash: string
): Promise<CreateIdempotencyClaim> {
  const idempotencyKey = getCreateIdempotencyKey(request);
  if (!idempotencyKey) {
    return { kind: 'none' };
  }

  if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return {
      kind: 'conflict',
      status: 400,
      payload: {
        error: `Idempotency-Key cannot exceed ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
        error_code: 'IDEMPOTENCY_KEY_INVALID',
        retryable: false,
        success: false,
      },
    };
  }

  const { data: inserted, error: insertError } = await idempotencyTable(auth)
    .insert({
      org_id: auth.orgId!,
      user_id: auth.user.id,
      route_key: routeKey,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
      status: 'in_progress',
      response_payload: null,
    })
    .select('*')
    .single();

  if (!insertError && inserted) {
    return { kind: 'claimed', idempotencyKey };
  }

  const { data: existing, error: lookupError } = await scopedQuery(
    auth,
    routeKey,
    idempotencyKey
  ).maybeSingle();

  if (lookupError || !existing) {
    return {
      kind: 'conflict',
      status: 503,
      payload: {
        error: 'Could not verify idempotency state. Please retry.',
        error_code: 'IDEMPOTENCY_LOOKUP_FAILED',
        retryable: true,
        success: false,
      },
    };
  }

  if (existing.request_hash !== requestHash) {
    return {
      kind: 'conflict',
      status: 409,
      payload: {
        error: 'Idempotency key reuse with different payload',
        error_code: 'IDEMPOTENCY_KEY_REUSED',
        retryable: false,
        success: false,
      },
    };
  }

  if (existing.status === 'completed' && existing.response_payload) {
    return {
      kind: 'replay',
      payload: {
        ...existing.response_payload,
        idempotentReplay: true,
      },
    };
  }

  return {
    kind: 'conflict',
    status: 409,
    payload: {
      error: 'Idempotent request is already in progress',
      error_code: 'IDEMPOTENCY_IN_PROGRESS',
      retryable: true,
      success: false,
    },
  };
}

export async function completeCreateIdempotency(
  auth: AuthContext,
  routeKey: string,
  idempotencyKey: string | null,
  payload: Record<string, unknown>
): Promise<void> {
  if (!idempotencyKey) return;

  await idempotencyTable(auth)
    .update({
      status: 'completed',
      response_payload: payload,
    })
    .eq('org_id', auth.orgId!)
    .eq('user_id', auth.user.id)
    .eq('route_key', routeKey)
    .eq('idempotency_key', idempotencyKey);
}

export async function clearCreateIdempotency(
  auth: AuthContext,
  routeKey: string,
  idempotencyKey: string | null
): Promise<void> {
  if (!idempotencyKey) return;

  await idempotencyTable(auth)
    .delete()
    .eq('org_id', auth.orgId!)
    .eq('user_id', auth.user.id)
    .eq('route_key', routeKey)
    .eq('idempotency_key', idempotencyKey);
}
