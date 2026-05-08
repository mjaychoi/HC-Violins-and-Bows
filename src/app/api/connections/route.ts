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

const CONNECTION_SELECT_COLUMNS =
  'id, client_id, instrument_id, relationship_type, notes, display_order, created_at';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_ALL_RESULTS = 1000;
const CONNECTION_DETAIL_SELECT = `
  *,
  client:clients(*),
  instrument:instruments(*)
`;

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
        .select(CONNECTION_SELECT_COLUMNS, { count: 'exact' })
        .eq('org_id', auth.orgId!);

      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      if (instrumentId) {
        query = query.eq('instrument_id', instrumentId);
      }

      query = query.order(orderBy, { ascending });

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
          .select(CONNECTION_SELECT_COLUMNS, { count: 'exact' })
          .eq('org_id', auth.orgId!);

        if (clientId) {
          retryQuery = retryQuery.eq('client_id', clientId);
        }

        if (instrumentId) {
          retryQuery = retryQuery.eq('instrument_id', instrumentId);
        }

        retryQuery = retryQuery.order(orderBy, { ascending });

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
      const responseData = truncated
        ? rawData.slice(0, MAX_ALL_RESULTS)
        : rawData;
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

      const body = await request.json();

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

      const body = await request.json();
      const { id, ...updates } = body || {};

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
          // ClientInstrument relation fields are stripped by validation.
          // Remaining fields are JSON-serializable.
          p_updates: validatedUpdates as unknown as Json,
        }
      );

      if (error || typeof connectionId !== 'string') {
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

      const body = await request.json();
      const { orders } = body || {};

      if (!Array.isArray(orders)) {
        return {
          payload: { error: 'orders must be an array' },
          status: 400,
        };
      }

      if (orders.length === 0) {
        return { payload: { data: [] } };
      }

      for (const order of orders) {
        if (!order?.id || !validateUUID(order.id)) {
          return {
            payload: { error: `Invalid connection ID: ${order?.id}` },
            status: 400,
          };
        }

        if (typeof order.display_order !== 'number') {
          return {
            payload: {
              error: `Invalid display_order for connection ${order.id}`,
            },
            status: 400,
          };
        }
      }

      await assertClientConnectionsSchemaReadiness({
        supabase: auth.userSupabase,
      });

      const { error: reorderError } = await auth.userSupabase.rpc(
        'reorder_connections_atomic',
        { p_orders: orders }
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

      const ids = orders.map(o => o.id);

      const { data, error: fetchError } = await auth.userSupabase
        .from('client_instruments')
        .select(
          `
            *,
            client:clients(*),
            instrument:instruments(*)
          `
        )
        .in('id', ids)
        .eq('org_id', auth.orgId!)
        .order('display_order', { ascending: true });

      if (fetchError) {
        throw errorHandler.handleSupabaseError(
          fetchError,
          'Fetch updated connections'
        );
      }

      return {
        payload: { data: (data || []) as ClientInstrument[] },
        metadata: { orderCount: orders.length },
      };
    }
  );
}

export const PUT = withSentryRoute(withAuthRoute(putHandler));
