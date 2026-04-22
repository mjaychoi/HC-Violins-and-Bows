import { NextRequest } from 'next/server';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';

import { validateInstrumentStatusTransition } from '@/app/api/_utils/stateTransitions';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import { validateUUID } from '@/utils/inputValidation';
import { validatePartialInstrument, safeValidate } from '@/utils/typeGuards';
import { errorHandler } from '@/utils/errorHandler';
import { buildReservedStateUpdate } from '@/app/api/_utils/instrumentReservedState';
import type { TablesUpdate } from '@/types/database';

type InstrumentUpdateRow = TablesUpdate<'instruments'>;
type PartialInstrumentUpdateInput = {
  status?: 'Available' | 'Booked' | 'Sold' | 'Reserved' | 'Maintenance';
  reserved_reason?: string | null;
  reserved_by_user_id?: string | null;
  reserved_connection_id?: string | null;
  maker?: string | null;
  type?: string;
  subtype?: string | null;
  year?: number | null;
  certificate?: boolean;
  has_certificate?: boolean;
  size?: string | null;
  weight?: string | null;
  price?: number | null;
  cost_price?: number | null;
  consignment_price?: number | null;
  ownership?: string | null;
  note?: string | null;
  serial_number?: string | null;
  created_at?: string;
  updated_at?: string;
};

function normalizeNullableText(
  value: string | null | undefined
): string | null {
  if (typeof value !== 'string') {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toInstrumentUpdateRow(
  input: PartialInstrumentUpdateInput
): InstrumentUpdateRow {
  const row: InstrumentUpdateRow = {};

  if (Object.prototype.hasOwnProperty.call(input, 'status')) {
    row.status = input.status;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'reserved_reason')) {
    row.reserved_reason = normalizeNullableText(input.reserved_reason);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'reserved_by_user_id')) {
    row.reserved_by_user_id = input.reserved_by_user_id ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'reserved_connection_id')) {
    row.reserved_connection_id = input.reserved_connection_id ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'maker')) {
    row.maker = normalizeNullableText(input.maker);
  }
  if (
    Object.prototype.hasOwnProperty.call(input, 'type') &&
    typeof input.type === 'string'
  ) {
    row.type = input.type.trim();
  }
  if (Object.prototype.hasOwnProperty.call(input, 'subtype')) {
    row.subtype = normalizeNullableText(input.subtype);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'year')) {
    row.year = input.year ?? null;
  }
  if (
    Object.prototype.hasOwnProperty.call(input, 'certificate') ||
    Object.prototype.hasOwnProperty.call(input, 'has_certificate')
  ) {
    row.certificate = Boolean(input.certificate ?? input.has_certificate);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'size')) {
    row.size = normalizeNullableText(input.size);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'weight')) {
    row.weight = normalizeNullableText(input.weight);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'price')) {
    row.price = input.price ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'cost_price')) {
    row.cost_price = input.cost_price ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'consignment_price')) {
    row.consignment_price = input.consignment_price ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'ownership')) {
    row.ownership = normalizeNullableText(input.ownership);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'note')) {
    row.note = normalizeNullableText(input.note);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'serial_number')) {
    row.serial_number = normalizeNullableText(input.serial_number);
  }

  return row;
}

const getParams = async (context?: { params?: Promise<{ id: string }> }) => {
  if (!context?.params) {
    return { id: '' };
  }

  return await context.params;
};

async function patchHandlerInternal(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  return apiHandler(
    request,
    {
      method: 'PATCH',
      path: `InstrumentsByIdAPI:${id}`,
      context: 'InstrumentsByIdAPI',
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
          payload: {
            error: 'Admin role required',
            error_code: 'ADMIN_REQUIRED',
            success: false,
          },
          status: 403,
        };
      }

      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid instrument ID format', success: false },
          status: 400,
        };
      }

      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object') {
        return {
          payload: { error: 'Invalid request body', success: false },
          status: 400,
        };
      }

      const validationResult = safeValidate(body, validatePartialInstrument);
      if (!validationResult.success) {
        return {
          payload: {
            error: `Invalid update data: ${validationResult.error}`,
            success: false,
          },
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
            .eq('org_id', auth.orgId!)
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
          return {
            payload: {
              error: 'Sold instruments cannot be moved to another status.',
            },
            status: 409,
          };
        }

        if (
          currentInstrument.status !== 'Sold' &&
          validationResult.data.status === 'Sold'
        ) {
          return {
            payload: {
              error:
                'Instrument status cannot be set to Sold directly. Use the sales API.',
            },
            status: 409,
          };
        }

        const currentStatus = (currentInstrument.status ??
          'Available') as Parameters<
          typeof validateInstrumentStatusTransition
        >[0];
        const transitionError = validateInstrumentStatusTransition(
          currentStatus,
          validationResult.data.status
        );
        if (transitionError) {
          return {
            payload: { error: transitionError },
            status: 409,
          };
        }

        const reservedStateResult = buildReservedStateUpdate(
          currentStatus,
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
            .eq('org_id', auth.orgId!)
            .single();

        if (currentInstrumentError || !currentInstrument) {
          throw errorHandler.handleSupabaseError(
            currentInstrumentError,
            'Fetch instrument state'
          );
        }

        const reservedStateResult = buildReservedStateUpdate(
          (currentInstrument.status ?? 'Available') as Parameters<
            typeof buildReservedStateUpdate
          >[0],
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

      const { data, error } = await auth.userSupabase
        .from('instruments')
        .update(
          toInstrumentUpdateRow(
            validationResult.data as PartialInstrumentUpdateInput
          )
        )
        .eq('id', id)
        .eq('org_id', auth.orgId!)
        .select('*')
        .single();

      if (error || !data) {
        return {
          payload: { error: error?.message || 'Failed to update instrument' },
          status: 500,
        };
      }

      return {
        payload: { data },
      };
    }
  );
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await getParams(context);

  const handler = withSentryRoute(
    withAuthRoute(async (req: NextRequest, auth: AuthContext) => {
      return patchHandlerInternal(req, auth, id);
    })
  );

  return handler(request);
}
