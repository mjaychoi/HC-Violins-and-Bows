import { NextRequest } from 'next/server';
import type { Json } from '@/types/database';
import { errorHandler } from '@/utils/errorHandler';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import {
  requireAdmin,
  requireOrgContext,
} from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import {
  validateClientInstrument,
  validateCreateClientInstrument,
  validatePartialClientInstrument,
  normalizeInstrument,
  safeValidate,
} from '@/utils/typeGuards';
import { validateSortColumn, validateUUID } from '@/utils/inputValidation';
import type { ClientInstrument } from '@/types';
import { mapClientsTableRowToClient } from '@/utils/clientDbMap';
import {
  claimCreateIdempotency,
  clearCreateIdempotency,
  completeCreateIdempotency,
  createRequestHash,
} from '@/app/api/_utils/createIdempotency';
import { assertClientConnectionsSchemaReadiness } from '@/app/api/_utils/schemaReadiness';
import { authRateLimit, applyRateLimit } from '@/app/api/_utils/rateLimit';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_ALL_RESULTS = 1000;
/**
 * Explicit minimum column allowlists for the embedded client/instrument
 * resources, replacing the previous `client:clients(*)` /
 * `instrument:instruments(*)` wildcard projections.
 *
 * Scope is the actual shipped `/connections` UI (ConnectionCard,
 * EditConnectionModal, ConnectionModal, connection search/sort in
 * page.tsx and connectionGrouping.ts) - not every column on `clients` /
 * `instruments`. In particular this intentionally excludes: private
 * `note`/`interest`, `address`, `contact_number`, `client_number`
 * (client), and `serial_number`, `status`, `cost_price`,
 * `consignment_price`, `ownership`, `note`, `size`, `weight`,
 * `certificate*`, `reserved_*` (instrument) - none of which the shipped
 * connections surfaces render. If a future connections feature needs one
 * of these, add it here deliberately rather than reverting to `*`.
 *
 * Shared by every handler below (GET collection, by-ID GET, POST/PATCH
 * mutation response, PUT reorder response) so every surface that renders a
 * connection sees an identical client/instrument shape.
 */
const CONNECTION_CLIENT_COLUMNS = 'id, first_name, last_name, email, tags';
const CONNECTION_INSTRUMENT_COLUMNS = 'id, maker, type, year, price';
const CONNECTION_DETAIL_SELECT = `
  *,
  client:clients(${CONNECTION_CLIENT_COLUMNS}),
  instrument:instruments(${CONNECTION_INSTRUMENT_COLUMNS})
`;

type ConnectionDisplayOrderUpdate = {
  id: string;
  display_order: number;
};

type ConnectionDetailRow = Record<string, unknown> & {
  client?: Record<string, unknown> | null;
  instrument?: Record<string, unknown> | null;
};

function mapConnectionDetailRow(row: unknown): unknown {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return row;
  }

  const detailRow = row as ConnectionDetailRow;

  return {
    ...detailRow,
    client: detailRow.client
      ? mapClientsTableRowToClient(
          detailRow.client as Parameters<typeof mapClientsTableRowToClient>[0]
        )
      : detailRow.client,
    instrument: detailRow.instrument
      ? normalizeInstrument(detailRow.instrument)
      : detailRow.instrument,
  };
}

function parsePage(input: string | null): number {
  const parsed = Number.parseInt(input ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;

  return parsed;
}

function parsePageSize(input: string | null): number {
  if (!input) return DEFAULT_PAGE_SIZE;
  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE;

  return Math.min(parsed, MAX_PAGE_SIZE);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonObject(
  request: NextRequest
): Promise<
  { ok: true; body: Record<string, unknown> } | { ok: false; error: string }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: 'Invalid JSON body' };
  }
  if (!isObject(body)) {
    return { ok: false, error: 'Invalid request body' };
  }
  return { ok: true, body };
}

function getConnectionConflictStatus(errorMessage: string): number {
  if (
    errorMessage.includes('not found') ||
    errorMessage.includes('cannot be assigned') ||
    errorMessage.includes('cannot be moved') ||
    errorMessage.includes('Use the sales API')
  ) {
    return 409;
  }

  return 500;
}

/**
 * Stable RPC-raised application errors (RAISE EXCEPTION 'CODE: message') that
 * must map to a specific HTTP status + error_code rather than falling through
 * to getConnectionConflictStatus's brittle free-text matching or the generic
 * 500 fallback.
 */
const DUPLICATE_CONNECTION_MESSAGE =
  'A connection with this relationship type already exists between this client and instrument.';

const CONNECTION_ERROR_CODE_PREFIXES: Array<{
  prefix: string;
  status: number;
  error_code: string;
  message: string;
}> = [
  {
    prefix: 'SOLD_CONNECTION_IMMUTABLE',
    status: 409,
    error_code: 'SOLD_CONNECTION_IMMUTABLE',
    message:
      'Sold relationships cannot be deleted. Use the sales refund/adjustment workflow instead.',
  },
  {
    prefix: 'DUPLICATE_CONNECTION',
    status: 409,
    error_code: 'DUPLICATE_CONNECTION',
    message: DUPLICATE_CONNECTION_MESSAGE,
  },
  {
    // F13: the API layer already rejects client_id/instrument_id on PATCH
    // with an explicit 400 before ever calling the RPC (see patchHandler
    // below), so this path is normally unreachable through this API.
    // update_connection_atomic itself raises this same stable error for
    // any caller that invokes it directly, and this mapping keeps this
    // route's error contract consistent in case that validation is ever
    // bypassed or changes.
    prefix: 'CONNECTION_REASSIGNMENT_UNSUPPORTED',
    status: 400,
    error_code: 'CONNECTION_REASSIGNMENT_UNSUPPORTED',
    message:
      "Reassigning a connection's client_id/instrument_id is not supported. Create a new connection instead.",
  },
];

/**
 * Postgres unique-violation (23505) constraint/index names that map to a
 * specific conflict response. Matched by the exact stable name (embedded in
 * the Postgres error message by PostgREST), not free-text phrasing, so
 * message wording changes upstream cannot silently break this mapping.
 * Unique violations on any other constraint intentionally fall through to
 * generic error handling so they retain their existing classification.
 */
const UNIQUE_VIOLATION_CONFLICTS: Record<
  string,
  { status: number; error_code: string; message: string }
> = {
  client_instruments_single_owner_per_instrument: {
    status: 409,
    error_code: 'INSTRUMENT_ALREADY_OWNED',
    message: 'This instrument already has an active Owned relationship.',
  },
  client_instruments_unique_interested_booked_per_pair: {
    status: 409,
    error_code: 'DUPLICATE_CONNECTION',
    message: DUPLICATE_CONNECTION_MESSAGE,
  },
};

type ConnectionErrorPayload = {
  status: number;
  payload: { error: string; error_code: string };
};

/**
 * Maps a Supabase/Postgres RPC error to a stable API error response when the
 * error is a known, safe-to-surface conflict. Returns null for anything that
 * should keep going through the generic errorHandler path (and therefore its
 * existing status, typically 500 for unclassified database errors).
 */
function mapConnectionRpcError(error: unknown): ConnectionErrorPayload | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const pgError = error as { code?: unknown; message?: unknown };
  const message = typeof pgError.message === 'string' ? pgError.message : '';

  if (pgError.code === '23505') {
    for (const [constraint, info] of Object.entries(
      UNIQUE_VIOLATION_CONFLICTS
    )) {
      if (message.includes(constraint)) {
        return {
          status: info.status,
          payload: { error: info.message, error_code: info.error_code },
        };
      }
    }
    // Unrelated unique violation: do not reclassify it here. Let it fall
    // through to the generic conflict/error handling below.
    return null;
  }

  for (const known of CONNECTION_ERROR_CODE_PREFIXES) {
    if (message.startsWith(known.prefix)) {
      return {
        status: known.status,
        payload: { error: known.message, error_code: known.error_code },
      };
    }
  }

  return null;
}

async function fetchConnectionById(auth: AuthContext, connectionId: string) {
  if (!auth.orgId) {
    throw new Error('Organization context required for connection lookup');
  }

  await assertClientConnectionsSchemaReadiness({
    supabase: auth.userSupabase,
  });

  const { data, error } = await auth.userSupabase
    .from('client_instruments')
    .select(CONNECTION_DETAIL_SELECT)
    .eq('id', connectionId)
    .eq('org_id', auth.orgId)
    .single();

  if (error) {
    throw errorHandler.handleSupabaseError(error, 'Fetch connection');
  }

  return validateClientInstrument(mapConnectionDetailRow(data));
}

async function getHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'ConnectionsAPI',
      context: 'ConnectionsAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      const searchParams = request.nextUrl.searchParams;
      const clientId = searchParams.get('client_id') || undefined;
      const instrumentId = searchParams.get('instrument_id') || undefined;
      const orderBy = validateSortColumn(
        'connections',
        searchParams.get('orderBy')
      );
      const ascending = searchParams.get('ascending') !== 'false';

      /**
       * When true, return all rows for the optional org filters,
       * but still cap the result size to avoid unbounded reads.
       */
      const fetchAll = searchParams.get('all') === 'true';

      const page = parsePage(searchParams.get('page'));
      const pageSize = searchParams.has('pageSize')
        ? parsePageSize(searchParams.get('pageSize'))
        : DEFAULT_PAGE_SIZE;

      if (clientId && !validateUUID(clientId)) {
        return {
          payload: { error: 'Invalid client_id format' },
          status: 400,
        };
      }

      if (instrumentId && !validateUUID(instrumentId)) {
        return {
          payload: { error: 'Invalid instrument_id format' },
          status: 400,
        };
      }

      await assertClientConnectionsSchemaReadiness({
        supabase: auth.userSupabase,
      });

      let query = auth.userSupabase
        .from('client_instruments')
        .select(CONNECTION_DETAIL_SELECT, { count: 'exact' })
        .eq('org_id', auth.orgId!);

      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      if (instrumentId) {
        query = query.eq('instrument_id', instrumentId);
      }

      query = query.order(orderBy, { ascending });
      // Stable page partitioning for complete-cache drains: created_at is
      // not unique, so equal timestamps would otherwise shuffle across
      // offset pages. Keep the caller's primary column; add `id` only as
      // a tiebreaker (PR-26 client sorting stays separate).
      if (orderBy !== 'id') {
        query = query.order('id', { ascending });
      }

      const offset = (page - 1) * pageSize;
      const to = offset + pageSize - 1;

      if (fetchAll) {
        query = query.limit(MAX_ALL_RESULTS + 1);
      } else {
        query = query.range(offset, to);
      }

      let { data, error, count } = await query;

      // Retry only matters if you order/select by display_order somewhere.
      if (
        error &&
        error.message?.toLowerCase().includes('display_order') &&
        error.message?.toLowerCase().includes('does not exist')
      ) {
        let retryQuery = auth.userSupabase
          .from('client_instruments')
          .select(CONNECTION_DETAIL_SELECT, { count: 'exact' })
          .eq('org_id', auth.orgId!);

        if (clientId) {
          retryQuery = retryQuery.eq('client_id', clientId);
        }

        if (instrumentId) {
          retryQuery = retryQuery.eq('instrument_id', instrumentId);
        }

        retryQuery = retryQuery.order(orderBy, { ascending });
        if (orderBy !== 'id') {
          retryQuery = retryQuery.order('id', { ascending });
        }

        if (fetchAll) {
          retryQuery = retryQuery.limit(MAX_ALL_RESULTS + 1);
        } else {
          retryQuery = retryQuery.range(offset, to);
        }

        const retryResult = await retryQuery;
        data = retryResult.data;
        error = retryResult.error;
        count = retryResult.count;
      }

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Fetch connections');
      }

      const rawData = data || [];
      const truncated = fetchAll && rawData.length > MAX_ALL_RESULTS;
      const cappedData = truncated
        ? rawData.slice(0, MAX_ALL_RESULTS)
        : rawData;
      // Same normalization layer used by the by-ID / create / update / reorder
      // responses, so every surface that renders a connection (this list,
      // /clients, /dashboard) sees an identical client/instrument shape.
      const responseData = cappedData.map(mapConnectionDetailRow);
      const totalCount = count || 0;
      const recordCount = responseData.length;
      const responsePage = fetchAll ? 1 : page;
      const responsePageSize = fetchAll ? recordCount : pageSize;
      const responseTotalPages = fetchAll
        ? 1
        : page && pageSize && count
          ? Math.ceil(count / pageSize)
          : undefined;
      const totalPages = responseTotalPages ?? 1;

      return {
        payload: {
          data: responseData,
          count: totalCount,
          page: responsePage,
          pageSize: responsePageSize,
          totalPages,
          pagination: {
            page: responsePage,
            pageSize: responsePageSize,
            totalCount,
            totalPages,
          },
          scope: fetchAll ? 'all' : 'paged',
          truncated,
        },
        metadata: {
          recordCount,
          totalCount,
          page: responsePage,
          pageSize: responsePageSize,
          fetchAll,
          clientId,
          instrumentId,
          orderBy,
          ascending,
        },
      };
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));

async function postHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'POST',
      path: 'ConnectionsAPI',
      context: 'ConnectionsAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: { error: 'Admin role required' },
          status: 403,
        };
      }

      const { limited } = await applyRateLimit(authRateLimit, auth.user.id);
      if (limited) {
        return {
          payload: { error: 'Too many requests' },
          status: 429,
        };
      }

      const bodyResult = await readJsonObject(request);
      if (!bodyResult.ok) {
        return {
          payload: { error: bodyResult.error },
          status: 400,
        };
      }
      const body = bodyResult.body;

      const validationResult = safeValidate(
        body,
        validateCreateClientInstrument
      );

      if (!validationResult.success) {
        return {
          payload: {
            error: `Invalid connection data: ${validationResult.error}`,
          },
          status: 400,
        };
      }

      const validatedInput = validationResult.data;

      if (validatedInput.relationship_type === 'Sold') {
        return {
          payload: {
            error:
              'Sold relationship cannot be created directly. Use the sales API.',
          },
          status: 409,
        };
      }

      await assertClientConnectionsSchemaReadiness({
        supabase: auth.userSupabase,
      });

      const idempotency = await claimCreateIdempotency(
        request,
        auth,
        'POST:/api/connections',
        createRequestHash({
          client_id: validatedInput.client_id,
          instrument_id: validatedInput.instrument_id,
          relationship_type: validatedInput.relationship_type,
          notes: validatedInput.notes ?? null,
        })
      );

      if (idempotency.kind === 'replay') {
        return { payload: idempotency.payload, status: 200 };
      }

      if (idempotency.kind === 'conflict') {
        return { payload: idempotency.payload, status: idempotency.status };
      }

      const idempotencyKey =
        idempotency.kind === 'claimed' ? idempotency.idempotencyKey : null;

      const { data: connectionId, error } = await auth.userSupabase.rpc(
        'create_connection_atomic',
        {
          p_client_id: validatedInput.client_id,
          p_instrument_id: validatedInput.instrument_id,
          p_relationship_type: validatedInput.relationship_type,
          p_notes: validatedInput.notes ?? null,
        }
      );

      if (error || typeof connectionId !== 'string') {
        await clearCreateIdempotency(
          auth,
          'POST:/api/connections',
          idempotencyKey
        );

        const knownConflict = mapConnectionRpcError(error);
        if (knownConflict) {
          return knownConflict;
        }

        const errorMessage =
          error && typeof error.message === 'string'
            ? error.message
            : 'Failed to create connection';

        const status = getConnectionConflictStatus(errorMessage);
        if (status === 409) {
          return { payload: { error: errorMessage }, status };
        }

        throw errorHandler.handleSupabaseError(error, 'Create connection');
      }

      const validatedResponse = await fetchConnectionById(auth, connectionId);
      const payload = { data: validatedResponse };

      await completeCreateIdempotency(
        auth,
        'POST:/api/connections',
        idempotencyKey,
        payload
      );

      return {
        payload,
        status: 201,
        metadata: {
          connectionId: validatedResponse.id,
        },
      };
    }
  );
}

export const POST = withSentryRoute(withAuthRoute(postHandler));

async function patchHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'PATCH',
      path: 'ConnectionsAPI',
      context: 'ConnectionsAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: { error: 'Admin role required' },
          status: 403,
        };
      }

      const bodyResult = await readJsonObject(request);
      if (!bodyResult.ok) {
        return {
          payload: { error: bodyResult.error },
          status: 400,
        };
      }
      const { id: rawId, ...updates } = bodyResult.body;
      const id = typeof rawId === 'string' ? rawId : '';

      if (!id) {
        return {
          payload: { error: 'Connection ID is required' },
          status: 400,
        };
      }

      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid connection ID format' },
          status: 400,
        };
      }

      // F13: reassigning a connection to a different client or instrument is
      // not a supported product operation. These fields are create-only;
      // reject them explicitly rather than silently accepting or dropping
      // them so callers get clear feedback instead of a false impression of
      // success.
      const reassignmentFields = ['client_id', 'instrument_id'].filter(
        field => field in updates
      );
      if (reassignmentFields.length > 0) {
        return {
          payload: {
            error: `Reassigning a connection's ${reassignmentFields.join(' and ')} is not supported. Create a new connection instead.`,
          },
          status: 400,
        };
      }

      const validationResult = safeValidate(
        updates,
        validatePartialClientInstrument
      );

      if (!validationResult.success) {
        return {
          payload: { error: `Invalid update data: ${validationResult.error}` },
          status: 400,
        };
      }

      // Use validated updates, not raw updates.
      const validatedUpdates = validationResult.data;

      await assertClientConnectionsSchemaReadiness({
        supabase: auth.userSupabase,
      });

      const { data: connectionId, error } = await auth.userSupabase.rpc(
        'update_connection_atomic',
        {
          p_connection_id: id,
          // client_id/instrument_id are rejected above (F13); the RPC also
          // ignores them defensively for callers that invoke it directly.
          p_updates: validatedUpdates as unknown as Json,
        }
      );

      if (error || typeof connectionId !== 'string') {
        const knownConflict = mapConnectionRpcError(error);
        if (knownConflict) {
          return knownConflict;
        }

        const errorMessage =
          error && typeof error.message === 'string'
            ? error.message
            : 'Failed to update connection';

        const status = getConnectionConflictStatus(errorMessage);
        if (status === 409) {
          return { payload: { error: errorMessage }, status };
        }

        throw errorHandler.handleSupabaseError(error, 'Update connection');
      }

      const validatedData = await fetchConnectionById(auth, connectionId);

      return {
        payload: { data: validatedData },
        metadata: { connectionId: id },
      };
    }
  );
}

export const PATCH = withSentryRoute(withAuthRoute(patchHandler));

async function deleteHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'DELETE',
      path: 'ConnectionsAPI',
      context: 'ConnectionsAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: { error: 'Admin role required' },
          status: 403,
        };
      }

      const id = request.nextUrl.searchParams.get('id');

      if (!id) {
        return {
          payload: { error: 'Connection ID is required' },
          status: 400,
        };
      }

      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid connection ID format' },
          status: 400,
        };
      }

      const { data: connectionId, error } = await auth.userSupabase.rpc(
        'delete_connection_atomic',
        {
          p_connection_id: id,
        }
      );

      if (error || typeof connectionId !== 'string') {
        const knownConflict = mapConnectionRpcError(error);
        if (knownConflict) {
          return knownConflict;
        }

        const errorMessage =
          error && typeof error.message === 'string'
            ? error.message
            : 'Failed to delete connection';

        const status = getConnectionConflictStatus(errorMessage);
        if (status === 409) {
          return { payload: { error: errorMessage }, status };
        }

        throw errorHandler.handleSupabaseError(error, 'Delete connection');
      }

      return {
        payload: { success: true },
        metadata: { connectionId: id },
      };
    }
  );
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));

async function putHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'PUT',
      path: 'ConnectionsAPI',
      context: 'ConnectionsAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: { error: 'Admin role required' },
          status: 403,
        };
      }

      const bodyResult = await readJsonObject(request);
      if (!bodyResult.ok) {
        return {
          payload: { error: bodyResult.error },
          status: 400,
        };
      }
      const { orders } = bodyResult.body;

      if (!Array.isArray(orders)) {
        return {
          payload: { error: 'orders must be an array' },
          status: 400,
        };
      }

      if (orders.length === 0) {
        return { payload: { data: [] } };
      }

      const validatedOrders: ConnectionDisplayOrderUpdate[] = [];
      for (const order of orders) {
        const rawId = isObject(order) ? order.id : undefined;
        const id = typeof rawId === 'string' ? rawId : '';
        if (!id || !validateUUID(id)) {
          return {
            payload: { error: `Invalid connection ID: ${rawId}` },
            status: 400,
          };
        }

        const displayOrder = isObject(order) ? order.display_order : undefined;
        if (typeof displayOrder !== 'number') {
          return {
            payload: {
              error: `Invalid display_order for connection ${id}`,
            },
            status: 400,
          };
        }

        validatedOrders.push({ id, display_order: displayOrder });
      }

      await assertClientConnectionsSchemaReadiness({
        supabase: auth.userSupabase,
      });

      const { error: reorderError } = await auth.userSupabase.rpc(
        'reorder_connections_atomic',
        { p_orders: validatedOrders }
      );

      if (reorderError) {
        return {
          payload: {
            error: 'Failed to reorder connections',
            error_code: 'CONNECTION_REORDER_FAILED',
          },
          status: 500,
        };
      }

      const ids = validatedOrders.map(order => order.id);

      const { data, error: fetchError } = await auth.userSupabase
        .from('client_instruments')
        .select(CONNECTION_DETAIL_SELECT)
        .in('id', ids)
        .eq('org_id', auth.orgId!)
        .order('display_order', { ascending: true });

      if (fetchError) {
        throw errorHandler.handleSupabaseError(
          fetchError,
          'Fetch updated connections'
        );
      }

      const normalized = (data || []).map(mapConnectionDetailRow);

      return {
        payload: { data: normalized as ClientInstrument[] },
        metadata: { orderCount: orders.length },
      };
    }
  );
}

export const PUT = withSentryRoute(withAuthRoute(putHandler));
