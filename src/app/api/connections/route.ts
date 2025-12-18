import { NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
// captureException removed - withSentryRoute handles error reporting
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import {
  validateClientInstrument,
  validateCreateClientInstrument,
  validatePartialClientInstrument,
  safeValidate,
} from '@/utils/typeGuards';
import { validateSortColumn, validateUUID } from '@/utils/inputValidation';
import type { User } from '@supabase/supabase-js';

async function getHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'ConnectionsAPI',
      context: 'ConnectionsAPI',
    },
    async () => {
      const searchParams = request.nextUrl.searchParams;
      const clientId = searchParams.get('client_id') || undefined;
      const instrumentId = searchParams.get('instrument_id') || undefined;
      const orderBy = validateSortColumn(
        'connections',
        searchParams.get('orderBy')
      );
      const ascending = searchParams.get('ascending') !== 'false';

      // Pagination parameters
      const page = searchParams.get('page')
        ? Math.max(1, parseInt(searchParams.get('page')!, 10))
        : undefined;
      const pageSize = searchParams.get('pageSize')
        ? Math.max(
            1,
            Math.min(100, parseInt(searchParams.get('pageSize')!, 10))
          )
        : undefined;

      // Validate UUIDs early
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

      const supabase = getServerSupabase();
      let query = supabase.from('client_instruments').select(
        `
          *,
          client:clients(*),
          instrument:instruments(*)
        `,
        { count: 'exact' }
      );

      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      if (instrumentId) {
        query = query.eq('instrument_id', instrumentId);
      }

      // Order by display_order first (if available), then by the specified orderBy
      // display_order is used for drag-and-drop reordering
      // Note: display_order column may not exist if migration hasn't been run
      // If the column doesn't exist, we'll fall back to just orderBy
      // The migration file is: 20250115000003_add_connection_order.sql
      query = query.order(orderBy, { ascending });

      // Apply pagination if provided
      if (page && pageSize) {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);
      }

      let { data, error, count } = await query;

      // If error is due to missing display_order column, retry without it
      if (error && error.message?.includes('display_order does not exist')) {
        // Retry query without display_order - this happens if migration hasn't been run
        let retryQuery = supabase.from('client_instruments').select(
          `
            *,
            client:clients(*),
            instrument:instruments(*)
          `,
          { count: 'exact' }
        );

        if (clientId) {
          retryQuery = retryQuery.eq('client_id', clientId);
        }

        if (instrumentId) {
          retryQuery = retryQuery.eq('instrument_id', instrumentId);
        }

        retryQuery = retryQuery.order(orderBy, { ascending });

        if (page && pageSize) {
          const from = (page - 1) * pageSize;
          const to = from + pageSize - 1;
          retryQuery = retryQuery.range(from, to);
        }

        const retryResult = await retryQuery;
        data = retryResult.data;
        error = retryResult.error;
        count = retryResult.count;
      }

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Fetch connections');
      }

      return {
        payload: {
          data: data || [],
          count: count || 0,
          page,
          pageSize,
          totalPages:
            page && pageSize && count ? Math.ceil(count / pageSize) : undefined,
        },
        metadata: {
          recordCount: data?.length || 0,
          totalCount: count || 0,
          page,
          pageSize,
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

async function postHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    {
      method: 'POST',
      path: '/api/connections',
      context: 'ConnectionsAPI',
    },
    async () => {
      const body = await request.json();

      // Validate request body using Zod schema
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

      // Use validated data instead of raw body
      const validatedInput = validationResult.data;

      const supabase = getServerSupabase();
      const { data, error } = await supabase
        .from('client_instruments')
        .insert(validatedInput)
        .select(
          `
          *,
          client:clients(*),
          instrument:instruments(*)
        `
        )
        .single();

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Create connection');
      }

      // Validate response data (with relations)
      const validatedResponse = validateClientInstrument(data);

      return {
        payload: { data: validatedResponse },
        status: 201,
        metadata: { connectionId: validatedResponse.id },
      };
    }
  );
}

export const POST = withSentryRoute(withAuthRoute(postHandler));

async function patchHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    {
      method: 'PATCH',
      path: 'ConnectionsAPI',
      context: 'ConnectionsAPI',
    },
    async () => {
      const body = await request.json();
      const { id, ...updates } = body;

      if (!id) {
        return {
          payload: { error: 'Connection ID is required' },
          status: 400,
        };
      }

      // Validate UUID format
      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid connection ID format' },
          status: 400,
        };
      }

      // Validate update data using partial schema
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

      const supabase = getServerSupabase();
      const { data, error } = await supabase
        .from('client_instruments')
        .update(updates)
        .eq('id', id)
        .select(
          `
          *,
          client:clients(*),
          instrument:instruments(*)
        `
        )
        .single();

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Update connection');
      }

      // Validate response data (with relations)
      const validatedData = validateClientInstrument(data);

      return {
        payload: { data: validatedData },
        metadata: { connectionId: id },
      };
    }
  );
}

export const PATCH = withSentryRoute(withAuthRoute(patchHandler));

async function deleteHandler(request: NextRequest, _user: User) {
  void _user;

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return apiHandler(
      request,
      {
        method: 'DELETE',
        path: 'ConnectionsAPI',
        context: 'ConnectionsAPI',
      },
      async () => ({
        payload: { error: 'Connection ID is required' },
        status: 400,
      })
    );
  }

  // Validate UUID format
  if (!validateUUID(id)) {
    return apiHandler(
      request,
      {
        method: 'DELETE',
        path: 'ConnectionsAPI',
        context: 'ConnectionsAPI',
      },
      async () => ({
        payload: { error: 'Invalid connection ID format' },
        status: 400,
      })
    );
  }

  return apiHandler(
    request,
    {
      method: 'DELETE',
      path: 'ConnectionsAPI',
      context: 'ConnectionsAPI',
      metadata: { connectionId: id },
    },
    async () => {
      const supabase = getServerSupabase();
      const { error } = await supabase
        .from('client_instruments')
        .delete()
        .eq('id', id);

      if (error) {
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

// Batch update display_order for multiple connections
async function putHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    {
      method: 'PUT',
      path: 'ConnectionsAPI',
      context: 'ConnectionsAPI',
    },
    async () => {
      const body = await request.json();
      const { orders } = body; // Array of { id: string, display_order: number }

      if (!Array.isArray(orders)) {
        return {
          payload: { error: 'orders must be an array' },
          status: 400,
        };
      }

      if (orders.length === 0) {
        return {
          payload: { data: [] },
        };
      }

      // Validate all IDs and orders
      for (const order of orders) {
        if (!order.id || !validateUUID(order.id)) {
          return {
            payload: { error: `Invalid connection ID: ${order.id}` },
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

      const supabase = getServerSupabase();

      // Use a transaction-like approach: update all connections
      // Since Supabase doesn't support transactions in JS client, we'll do sequential updates
      // For better performance, we could use a stored procedure, but this is simpler
      const updatePromises = orders.map(({ id, display_order }) =>
        supabase
          .from('client_instruments')
          .update({ display_order })
          .eq('id', id)
      );

      const results = await Promise.all(updatePromises);

      // Check for errors
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        const firstError = errors[0].error;
        throw errorHandler.handleSupabaseError(
          firstError,
          'Batch update connection orders'
        );
      }

      // Fetch updated connections
      const ids = orders.map(o => o.id);
      const { data, error: fetchError } = await supabase
        .from('client_instruments')
        .select(
          `
            *,
            client:clients(*),
            instrument:instruments(*)
          `
        )
        .in('id', ids);

      if (fetchError) {
        throw errorHandler.handleSupabaseError(
          fetchError,
          'Fetch updated connections'
        );
      }

      return {
        payload: { data: data || [] },
        metadata: { orderCount: orders.length },
      };
    }
  );
}

export const PUT = withSentryRoute(withAuthRoute(putHandler));
