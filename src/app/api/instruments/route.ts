import { NextRequest } from 'next/server';
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
  validateInstrument,
  validateInstrumentArray,
  validatePartialInstrument,
  validateCreateInstrument,
  safeValidate,
} from '@/utils/typeGuards';
import {
  validateDateString,
  validateSortColumn,
  validateUUID,
} from '@/utils/inputValidation';
import { Instrument } from '@/types';
import { validateInstrumentStatusTransition } from '@/app/api/_utils/stateTransitions';

type SaleTransitionPayload = {
  sale_price?: number | null;
  sale_date?: string | null;
  client_id?: string | null;
  sales_note?: string | null;
};

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
      const searchParams = request.nextUrl.searchParams;
      const orderBy = validateSortColumn(
        'instruments',
        searchParams.get('orderBy')
      );
      const ascending = searchParams.get('ascending') !== 'false';
      const ownership = searchParams.get('ownership') || undefined;
      const search = searchParams.get('search') || undefined;
      const all = searchParams.get('all') === 'true';
      const limitParam = searchParams.get('limit');
      const limit = limitParam
        ? parseInt(limitParam, 10)
        : all
          ? undefined
          : 1000;

      // userSupabase: RLS (org_id = auth.org_id()) scopes to the caller's org
      let query = auth.userSupabase
        .from('instruments')
        .select('*', { count: 'exact' });

      if (ownership) {
        query = query.eq('ownership', ownership);
      }

      if (search && search.length >= 2) {
        const sanitizedSearch = search.trim().replace(/[(),%]/g, ' ');
        query = query.or(
          `maker.ilike.%${sanitizedSearch}%,type.ilike.%${sanitizedSearch}%,subtype.ilike.%${sanitizedSearch}%,serial_number.ilike.%${sanitizedSearch}%`
        );
      }

      if (limit !== undefined && limit > 0) {
        query = query.limit(limit);
      }

      query = query.order(orderBy, { ascending });

      const { data, error, count } = await query;

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Fetch instruments');
      }

      const instrumentIds = (data || []).map((inst: Instrument) => inst.id);
      let certificateSet = new Set<string>();

      if (instrumentIds.length > 0) {
        const { data: certificateRows, error: certError } =
          await auth.userSupabase
            .from('instrument_certificates')
            .select('instrument_id')
            .in('instrument_id', instrumentIds);

        if (certError) {
          throw errorHandler.handleSupabaseError(
            certError,
            'Fetch instrument certificates'
          );
        }

        certificateSet = new Set(
          (certificateRows || [])
            .map(row => row.instrument_id)
            .filter((id): id is string => typeof id === 'string')
        );
      }

      const normalizedData = (data || []).map(inst => ({
        ...inst,
        has_certificate: certificateSet.has(inst.id),
      }));

      const validationResult = safeValidate(
        normalizedData,
        validateInstrumentArray
      );
      const validationWarning = !validationResult.success;

      return {
        payload: {
          data: normalizedData,
          count: count || 0,
        },
        metadata: {
          recordCount: data?.length || 0,
          totalCount: count || 0,
          orderBy,
          ascending,
          ownership,
          search,
          limit,
          validationWarning,
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
      path: 'InstrumentsAPI',
      context: 'InstrumentsAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      const body = await request.json();

      const validationResult = safeValidate(body, validateCreateInstrument);
      if (!validationResult.success) {
        return {
          payload: {
            error: `Invalid instrument data: ${validationResult.error}`,
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
          },
          status: 400,
        };
      }

      const instrumentInsert = {
        ...validationResult.data,
        org_id: auth.orgId!,
        reserved_reason:
          validationResult.data.status === 'Reserved'
            ? (validationResult.data.reserved_reason?.trim() ?? null)
            : null,
        reserved_by_user_id:
          validationResult.data.status === 'Reserved' ? auth.user.id : null,
        reserved_connection_id: null,
      };

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

export const POST = withSentryRoute(withAuthRoute(postHandler));

function buildReservedStateUpdate(
  currentStatus: Instrument['status'],
  currentReservedReason: string | null,
  currentReservedByUserId: string | null,
  currentReservedConnectionId: string | null,
  nextUpdates: Partial<Instrument>,
  userId: string
): { update: Partial<Instrument>; error?: string } {
  const update = { ...nextUpdates };
  const nextStatus = nextUpdates.status;
  const hasReservedReasonPatch = Object.prototype.hasOwnProperty.call(
    nextUpdates,
    'reserved_reason'
  );
  const nextReservedReason = nextUpdates.reserved_reason;

  if (nextStatus === 'Reserved') {
    const normalizedReason =
      typeof nextReservedReason === 'string'
        ? nextReservedReason.trim()
        : currentStatus === 'Reserved'
          ? (currentReservedReason ?? '').trim()
          : '';

    if (!normalizedReason) {
      return {
        update,
        error: 'Reserved status requires a reserved_reason.',
      };
    }

    update.reserved_reason = normalizedReason;
    update.reserved_by_user_id = userId;
    update.reserved_connection_id = null;
    return { update };
  }

  if (hasReservedReasonPatch) {
    if (currentStatus !== 'Reserved' && nextStatus === undefined) {
      return {
        update,
        error:
          'reserved_reason can only be changed while the instrument is Reserved.',
      };
    }

    const normalizedReason =
      typeof nextReservedReason === 'string' ? nextReservedReason.trim() : '';
    if (!normalizedReason) {
      return {
        update,
        error: 'Reserved status requires a reserved_reason.',
      };
    }

    update.reserved_reason = normalizedReason;
    update.reserved_by_user_id = userId;
    update.reserved_connection_id = null;
    return { update };
  }

  if (
    nextStatus === 'Available' ||
    nextStatus === 'Maintenance' ||
    nextStatus === 'Sold'
  ) {
    update.reserved_reason = null;
    update.reserved_by_user_id = null;
    update.reserved_connection_id = null;
    return { update };
  }

  if (currentStatus === 'Reserved' && nextStatus === 'Booked') {
    update.reserved_reason = currentReservedReason;
    update.reserved_by_user_id = currentReservedByUserId;
    update.reserved_connection_id = currentReservedConnectionId;
  }

  return { update };
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
      const bodyRecord: Record<string, unknown> = isObject(body) ? body : {};
      const { id, sale_transition: saleTransitionRaw, ...updates } = bodyRecord;

      if (typeof id !== 'string' || !id) {
        return {
          payload: { error: 'Instrument ID is required' },
          status: 400,
        };
      }

      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid instrument ID format' },
          status: 400,
        };
      }

      const saleTransition = isObject(saleTransitionRaw)
        ? (saleTransitionRaw as SaleTransitionPayload)
        : null;

      const validationResult = safeValidate(updates, validatePartialInstrument);
      if (!validationResult.success) {
        return {
          payload: { error: `Invalid update data: ${validationResult.error}` },
          status: 400,
        };
      }

      if (validationResult.data.status !== undefined) {
        const { data: currentInstrument, error: currentInstrumentError } =
          await auth.userSupabase
            .from('instruments')
            .select(
              'status, reserved_reason, reserved_by_user_id, reserved_connection_id'
            )
            .eq('id', id)
            .single();

        if (currentInstrumentError || !currentInstrument) {
          throw errorHandler.handleSupabaseError(
            currentInstrumentError,
            'Fetch instrument state'
          );
        }

        if (
          currentInstrument.status === 'Sold' &&
          validationResult.data.status !== 'Sold'
        ) {
          if (!saleTransition) {
            return {
              payload: {
                error:
                  'Sold instruments must use the dashboard sale transition flow.',
              },
              status: 409,
            };
          }
        }

        if (
          currentInstrument.status !== 'Sold' &&
          validationResult.data.status === 'Sold'
        ) {
          if (!saleTransition) {
            return {
              payload: {
                error:
                  'Instrument status cannot be set to Sold directly. Use the dashboard sale transition flow.',
              },
              status: 409,
            };
          }
        }

        const usesAtomicSaleTransition =
          Boolean(saleTransition) &&
          ((currentInstrument.status !== 'Sold' &&
            validationResult.data.status === 'Sold') ||
            (currentInstrument.status === 'Sold' &&
              validationResult.data.status !== 'Sold'));

        if (!usesAtomicSaleTransition) {
          const transitionError = validateInstrumentStatusTransition(
            currentInstrument.status,
            validationResult.data.status
          );
          if (transitionError) {
            return {
              payload: { error: transitionError },
              status: 409,
            };
          }
        }

        const reservedStateResult = buildReservedStateUpdate(
          currentInstrument.status,
          currentInstrument.reserved_reason,
          currentInstrument.reserved_by_user_id,
          currentInstrument.reserved_connection_id,
          validationResult.data,
          auth.user.id
        );

        if (reservedStateResult.error) {
          return {
            payload: { error: reservedStateResult.error },
            status: 400,
          };
        }

        validationResult.data = reservedStateResult.update;

        if (usesAtomicSaleTransition) {
          let salePrice: number | null = null;
          if (
            saleTransition?.sale_price !== undefined &&
            saleTransition.sale_price !== null
          ) {
            const parsed = Number(saleTransition.sale_price);
            if (!Number.isFinite(parsed)) {
              return {
                payload: {
                  error: 'sale_transition.sale_price must be a number',
                },
                status: 400,
              };
            }
            salePrice = parsed;
          }

          if (
            saleTransition?.sale_date &&
            (typeof saleTransition.sale_date !== 'string' ||
              !validateDateString(saleTransition.sale_date))
          ) {
            return {
              payload: {
                error:
                  'sale_transition.sale_date must be a valid YYYY-MM-DD string',
              },
              status: 400,
            };
          }

          if (
            saleTransition?.client_id &&
            !validateUUID(saleTransition.client_id)
          ) {
            return {
              payload: { error: 'Invalid sale_transition.client_id format' },
              status: 400,
            };
          }

          const { data, error } = await auth.userSupabase.rpc(
            'update_instrument_sale_transition_atomic',
            {
              p_instrument_id: id,
              p_patch: validationResult.data,
              p_sale_price: salePrice,
              p_sale_date: saleTransition?.sale_date ?? null,
              p_client_id: saleTransition?.client_id ?? null,
              p_sales_note: saleTransition?.sales_note ?? null,
            }
          );

          if (error || !data) {
            const message =
              error && typeof error.message === 'string'
                ? error.message
                : 'Failed to update instrument sale transition';
            return {
              payload: { error: message },
              status: message.includes('not found') ? 404 : 409,
            };
          }

          const validatedData = validateInstrument(data);

          return {
            payload: { data: validatedData },
            metadata: { instrumentId: id, atomicSaleTransition: true },
          };
        }
      } else if (
        Object.prototype.hasOwnProperty.call(
          validationResult.data,
          'reserved_reason'
        )
      ) {
        const { data: currentInstrument, error: currentInstrumentError } =
          await auth.userSupabase
            .from('instruments')
            .select(
              'status, reserved_reason, reserved_by_user_id, reserved_connection_id'
            )
            .eq('id', id)
            .single();

        if (currentInstrumentError || !currentInstrument) {
          throw errorHandler.handleSupabaseError(
            currentInstrumentError,
            'Fetch instrument state'
          );
        }

        const reservedStateResult = buildReservedStateUpdate(
          currentInstrument.status,
          currentInstrument.reserved_reason,
          currentInstrument.reserved_by_user_id,
          currentInstrument.reserved_connection_id,
          validationResult.data,
          auth.user.id
        );

        if (reservedStateResult.error) {
          return {
            payload: { error: reservedStateResult.error },
            status: 400,
          };
        }

        validationResult.data = reservedStateResult.update;
      }

      // userSupabase + RLS prevents cross-tenant writes
      // Fix: use validationResult.data (not raw updates) to prevent mass-assignment
      const { data, error } = await auth.userSupabase
        .from('instruments')
        .update(validationResult.data)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Update instrument');
      }

      const validatedData = validateInstrument(data);

      return {
        payload: { data: validatedData },
        metadata: { instrumentId: id },
      };
    }
  );
}

export const PATCH = withSentryRoute(withAuthRoute(patchHandler));

async function deleteHandler(request: NextRequest, auth: AuthContext) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return apiHandler(
      request,
      {
        method: 'DELETE',
        path: 'InstrumentsAPI',
        context: 'InstrumentsAPI',
      },
      async () => ({
        payload: { error: 'Instrument ID is required' },
        status: 400,
      })
    );
  }

  if (!validateUUID(id)) {
    return apiHandler(
      request,
      {
        method: 'DELETE',
        path: 'InstrumentsAPI',
        context: 'InstrumentsAPI',
      },
      async () => ({
        payload: { error: 'Invalid instrument ID format' },
        status: 400,
      })
    );
  }

  return apiHandler(
    request,
    {
      method: 'DELETE',
      path: 'InstrumentsAPI',
      context: 'InstrumentsAPI',
      metadata: { instrumentId: id },
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

      // userSupabase + RLS prevents cross-tenant deletes
      const { error } = await auth.userSupabase
        .from('instruments')
        .delete()
        .eq('id', id);

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Delete instrument');
      }

      return {
        payload: { success: true },
        metadata: { instrumentId: id },
      };
    }
  );
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));
