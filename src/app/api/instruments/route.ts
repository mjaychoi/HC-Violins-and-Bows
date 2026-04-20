import { NextRequest } from 'next/server';
import { errorHandler } from '@/utils/errorHandler';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { buildReservedStateUpdate } from '@/app/api/_utils/instrumentReservedState';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import {
  validateInstrument,
  validatePartialInstrument,
  validateCreateInstrument,
  safeValidate,
} from '@/utils/typeGuards';
import { validateSortColumn, validateUUID } from '@/utils/inputValidation';
import { Instrument } from '@/types';
import type { TablesInsert, TablesUpdate } from '@/types/database';

type InstrumentUpdateInput = Partial<
  Omit<Instrument, 'id' | 'created_at' | 'updated_at'>
> & {
  id: string;
  sale_transition?: {
    sale_price: number;
    sale_date: string;
    client_id: string;
    sales_note?: string | null;
  };
};

type InstrumentInsertRow = TablesInsert<'instruments'>;
type InstrumentUpdateRow = TablesUpdate<'instruments'>;

function toInstrumentInsertRow(
  input: Omit<Instrument, 'id' | 'created_at' | 'updated_at'> & {
    org_id: string;
    reserved_by_user_id: string | null;
    reserved_connection_id: string | null;
  }
): InstrumentInsertRow {
  const { has_certificate, ...rest } = input;
  void has_certificate;
  return rest;
}

function toInstrumentUpdateRow(
  input: Partial<Instrument>
): InstrumentUpdateRow {
  const { has_certificate, ...rest } = input;
  void has_certificate;
  return rest;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function getHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'InstrumentsAPI',
      context: 'InstrumentsAPI',
    },
    async () => {
      try {
        // 1️⃣ org 체크
        if (!auth.orgId) {
          return {
            payload: { error: 'Organization context required', success: false },
            status: 403,
          };
        }

        const searchParams = request.nextUrl.searchParams;

        const orderBy = validateSortColumn(
          'instruments',
          searchParams.get('orderBy')
        );

        const ascending = searchParams.get('ascending') !== 'false';
        const ownership = searchParams.get('ownership') || 'all';
        const search = searchParams.get('search');
        const limitParam = searchParams.get('limit');
        const limit = limitParam ? parseInt(limitParam, 10) : undefined;

        let query = auth.userSupabase
          .from('instruments')
          .select('*', { count: 'exact' })
          .eq('org_id', auth.orgId);

        if (ownership === 'owned') {
          query = query.eq('ownership', 'owned');
        } else if (ownership === 'consigned') {
          query = query.eq('ownership', 'consigned');
        }

        if (search) {
          query = query.or(`maker.ilike.%${search}%`);
        }

        // ✅ limit은 non-reassigning 형태로 호출 (mock chain 대응)
        if (limit) {
          query.limit(limit);
        }

        // order
        if (query.order) {
          query = query.order(orderBy, { ascending });
        }

        const { data, error, count } = await query;

        // error handling
        if (error) {
          errorHandler.handleSupabaseError(error, 'Fetch instruments');
          return {
            payload: { error: 'Database error', success: false },
            status: 500,
          };
        }

        // ✅ 🔥 핵심: has_certificate 추가
        const transformed = (data || []).map(item => ({
          ...item,
          has_certificate: !!item.certificate,
        }));

        return {
          payload: {
            data: transformed,
            count: count || 0,
          },
        };
      } catch (err) {
        if (process.env.NODE_ENV === 'test') {
          console.error('Instruments GET Error:', err);
        }
        throw err;
      }
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));
export const POST = withSentryRoute(withAuthRoute(postHandler));

async function postHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'POST',
      path: 'InstrumentsAPI',
      context: 'InstrumentsAPI',
    },
    async () => {
      if (!auth.orgId) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      const body = await request.json();

      const validationResult = safeValidate(body, validateCreateInstrument);
      if (!validationResult.success) {
        return {
          payload: {
            error: `Invalid instrument data: ${validationResult.error}`,
            success: false,
          },
          status: 400,
        };
      }

      if (
        validationResult.data.status === 'Reserved' &&
        !validationResult.data.reserved_reason?.trim()
      ) {
        return {
          payload: {
            error: 'Reserved status requires a reserved_reason.',
            success: false,
          },
          status: 400,
        };
      }

      const instrumentInsert = toInstrumentInsertRow({
        ...validationResult.data,
        org_id: auth.orgId,
        reserved_reason:
          validationResult.data.status === 'Reserved'
            ? (validationResult.data.reserved_reason?.trim() ?? null)
            : null,
        reserved_by_user_id:
          validationResult.data.status === 'Reserved' ? auth.user.id : null,
        reserved_connection_id: null,
      });

      const { data, error } = await auth.userSupabase
        .from('instruments')
        .insert(instrumentInsert)
        .select()
        .single();

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Create instrument');
      }

      const validatedResponse = validateInstrument(data);

      return {
        payload: { data: validatedResponse },
        status: 201,
        metadata: { instrumentId: validatedResponse.id },
      };
    }
  );
}

async function patchHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'PATCH',
      path: 'InstrumentsAPI',
      context: 'InstrumentsAPI',
    },
    async () => {
      if (!auth.orgId) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      if (auth.role !== 'admin') {
        return {
          payload: { error: 'Admin role required', success: false },
          status: 403,
        };
      }

      const body = await request.json();

      if (!isObject(body) || typeof body.id !== 'string') {
        return {
          payload: { error: 'Instrument ID is required', success: false },
          status: 400,
        };
      }

      const { id, sale_transition, ...updates } =
        body as unknown as InstrumentUpdateInput;

      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid instrument ID format', success: false },
          status: 400,
        };
      }

      const orgId = auth.orgId;

      if (updates.status === 'Sold' && sale_transition) {
        const { error: rpcError, data: rpcData } = await auth.userSupabase.rpc(
          'update_instrument_sale_transition_atomic',
          {
            p_instrument_id: id,
            p_sale_price: sale_transition.sale_price,
            p_sale_date: sale_transition.sale_date,
            p_client_id: sale_transition.client_id,
            p_sales_note: sale_transition.sales_note || null,
          }
        );

        if (rpcError) {
          throw errorHandler.handleSupabaseError(rpcError, 'Update sale');
        }

        return {
          payload: { data: rpcData },
          status: 200,
          metadata: { instrumentId: id, transition: 'Sold' },
        };
      }

      if (
        updates.status ||
        Object.prototype.hasOwnProperty.call(updates, 'reserved_reason')
      ) {
        const { data: current, error: fetchError } = await auth.userSupabase
          .from('instruments')
          .select(
            'status, reserved_reason, reserved_by_user_id, reserved_connection_id'
          )
          .eq('id', id)
          .eq('org_id', orgId)
          .single();

        if (fetchError || !current) {
          throw errorHandler.handleSupabaseError(
            fetchError,
            'Fetch current status'
          );
        }

        const reservedUpdateResult = buildReservedStateUpdate(
          (current.status ?? 'Available') as Instrument['status'],
          current.reserved_reason,
          current.reserved_by_user_id,
          current.reserved_connection_id,
          updates,
          auth.user.id
        );

        if (reservedUpdateResult.error) {
          return {
            payload: { error: reservedUpdateResult.error, success: false },
            status: 400,
          };
        }

        Object.assign(updates, reservedUpdateResult.update);
      }

      const validationResult = safeValidate(updates, validatePartialInstrument);
      if (!validationResult.success) {
        return {
          payload: {
            error: `Invalid instrument updates: ${validationResult.error}`,
            success: false,
          },
          status: 400,
        };
      }

      const { data, error } = await auth.userSupabase
        .from('instruments')
        .update(toInstrumentUpdateRow(validationResult.data))
        .eq('id', id)
        .eq('org_id', orgId)
        .select()
        .single();

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Update instrument');
      }

      return {
        payload: { data: validateInstrument(data) },
        status: 200,
        metadata: { instrumentId: id },
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
      path: 'InstrumentsAPI',
      context: 'InstrumentsAPI',
    },
    async () => {
      if (!auth.orgId) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      if (auth.role !== 'admin') {
        return {
          payload: { error: 'Admin role required', success: false },
          status: 403,
        };
      }

      const searchParams = request.nextUrl.searchParams;
      const id = searchParams.get('id');

      if (!id) {
        return {
          payload: { error: 'Instrument ID is required', success: false },
          status: 400,
        };
      }

      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid instrument ID format', success: false },
          status: 400,
        };
      }

      const orgId = auth.orgId;

      const { error, count } = await auth.userSupabase
        .from('instruments')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('org_id', orgId);

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Delete instrument');
      }

      if (!count || count === 0) {
        return {
          payload: { error: 'Instrument not found', success: false },
          status: 404,
        };
      }

      return {
        payload: { success: true, id },
        status: 200,
        metadata: { instrumentId: id },
      };
    }
  );
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));
