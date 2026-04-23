import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { buildReservedStateUpdate } from '@/app/api/_utils/instrumentReservedState';
import { validateInstrumentStatusTransition } from '@/app/api/_utils/stateTransitions';
import type { ApiHandlerResult } from '@/app/api/_utils/apiHandler';
import {
  ensureInstrumentSaleRpcContract,
  instrumentSchemaContractMissingResult,
  isInstrumentSaleRpcMissingOrArityError,
  requireInstrumentPatchUpdatedAt,
} from '@/app/api/instruments/_shared/instrumentApiContract';
import { validateUUID } from '@/utils/inputValidation';
import * as typeGuards from '@/utils/typeGuards';
import { errorHandler } from '@/utils/errorHandler';
import { logInfo, logWarn } from '@/utils/logger';
import type { Instrument } from '@/types';
import type { Json, TablesUpdate } from '@/types/database';

type InstrumentUpdateRow = TablesUpdate<'instruments'>;

type PartialInstrumentInput = Partial<{
  status: Instrument['status'];
  reserved_reason: string | null;
  maker: string | null;
  type: string;
  subtype: string | null;
  year: number | null;
  certificate: boolean;
  has_certificate: boolean;
  size: string | null;
  weight: string | null;
  price: number | null;
  cost_price: number | null;
  consignment_price: number | null;
  ownership: string | null;
  note: string | null;
  serial_number: string | null;
  reserved_by_user_id: string | null;
  reserved_connection_id: string | null;
}>;

type SaleTransitionPayload = {
  sale_price?: number | null;
  sale_date?: string | null;
  client_id?: string | null;
  sales_note?: string | null;
};

const RPC_PATCH_KEYS = [
  'status',
  'maker',
  'type',
  'subtype',
  'year',
  'certificate',
  'cost_price',
  'consignment_price',
  'size',
  'weight',
  'price',
  'ownership',
  'note',
  'serial_number',
  'reserved_reason',
  'reserved_by_user_id',
  'reserved_connection_id',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

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
  input: PartialInstrumentInput
): InstrumentUpdateRow {
  const row: InstrumentUpdateRow = {};

  if (Object.prototype.hasOwnProperty.call(input, 'status')) {
    row.status = input.status;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'reserved_reason')) {
    row.reserved_reason = normalizeNullableText(input.reserved_reason);
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
  if (Object.prototype.hasOwnProperty.call(input, 'reserved_by_user_id')) {
    row.reserved_by_user_id = input.reserved_by_user_id ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'reserved_connection_id')) {
    row.reserved_connection_id = input.reserved_connection_id ?? null;
  }

  return row;
}

function toRpcPatchJson(data: Partial<Instrument>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of RPC_PATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const v = data[key];
      if (v !== undefined) {
        out[key] = v;
      }
    }
  }
  return out;
}

function asSaleTransition(value: unknown): SaleTransitionPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as SaleTransitionPayload;
}

export async function executeInstrumentPatch(
  auth: AuthContext,
  input: {
    mode: 'collection' | 'byId';
    instrumentId: string;
    body: unknown;
    apiPath: string;
  }
): Promise<ApiHandlerResult> {
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

  const orgId = auth.orgId;
  const instrumentId = input.instrumentId;

  if (!validateUUID(instrumentId)) {
    return {
      payload: { error: 'Invalid instrument ID format', success: false },
      status: 400,
    };
  }

  if (!isObject(input.body)) {
    return {
      payload: { error: 'Invalid request body', success: false },
      status: 400,
    };
  }

  const body = input.body;

  if (input.mode === 'byId') {
    const bodyId = body.id;
    if (typeof bodyId === 'string' && bodyId !== instrumentId) {
      return {
        payload: { error: 'Instrument ID mismatch', success: false },
        status: 400,
      };
    }
  }

  const updatedAtGate = requireInstrumentPatchUpdatedAt(body, input.apiPath);
  if (!updatedAtGate.ok) {
    return updatedAtGate.result;
  }
  const expectedUpdatedAt = updatedAtGate.expectedUpdatedAt;

  const updates: Record<string, unknown> = { ...body };
  delete updates.id;
  delete updates.updated_at;
  delete updates.sale_transition;

  const saleTransition = asSaleTransition(body.sale_transition);

  if (saleTransition) {
    const saleContract = await ensureInstrumentSaleRpcContract(
      auth.userSupabase
    );
    if (saleContract) {
      return saleContract;
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, 'status') ||
      Object.prototype.hasOwnProperty.call(updates, 'reserved_reason')
    ) {
      const { data: current, error: fetchError } = await auth.userSupabase
        .from('instruments')
        .select(
          'status, reserved_reason, reserved_by_user_id, reserved_connection_id'
        )
        .eq('id', instrumentId)
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
        updates as Partial<Instrument>,
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

    const validationResult = typeGuards.safeValidate(
      updates,
      typeGuards.validatePartialInstrument
    );
    if (!validationResult.success) {
      return {
        payload: {
          error: `Invalid instrument updates: ${validationResult.error}`,
          success: false,
        },
        status: 400,
      };
    }

    const p_patch = toRpcPatchJson(
      validationResult.data as Partial<Instrument>
    );

    const { error: rpcError, data: rpcData } = await auth.userSupabase.rpc(
      'update_instrument_sale_transition_atomic',
      {
        p_instrument_id: instrumentId,
        p_patch: p_patch as Json,
        p_sale_price: saleTransition.sale_price ?? null,
        p_sale_date: saleTransition.sale_date ?? null,
        p_client_id: saleTransition.client_id ?? null,
        p_sales_note: saleTransition.sales_note ?? null,
        p_expected_updated_at: expectedUpdatedAt,
      }
    );

    if (rpcError) {
      if (isInstrumentSaleRpcMissingOrArityError(rpcError)) {
        logWarn('instrument_sale_rpc_contract_failure', input.apiPath, {
          instrumentId,
          code: (rpcError as { code?: string }).code,
        });
        return instrumentSchemaContractMissingResult([
          'update_instrument_sale_transition_atomic',
        ]);
      }
      const msg = String(rpcError.message ?? '');
      if (msg.includes('instrument_concurrency_conflict')) {
        logInfo('instrument_sale_transition_conflict', input.apiPath, {
          instrumentId,
          event: 'instrument_patch_conflict',
          http_status: 409,
        });
        return {
          payload: {
            error: 'This record was updated elsewhere. Refresh and try again.',
            error_code: 'INSTRUMENT_CONFLICT',
            success: false,
          },
          status: 409,
          metadata: { instrumentId },
        };
      }
      throw errorHandler.handleSupabaseError(rpcError, 'Update sale');
    }

    logInfo('instrument_patch_sale_rpc_success', input.apiPath, {
      instrumentId,
    });

    return {
      payload: {
        data: typeGuards.validateInstrument(rpcData as unknown as Instrument),
      },
      status: 200,
      metadata: { instrumentId, transition: 'sale_rpc' },
    };
  }

  const validationResult = typeGuards.safeValidate(
    updates,
    typeGuards.validatePartialInstrument
  );
  if (!validationResult.success) {
    return {
      payload: {
        error: `Invalid instrument updates: ${validationResult.error}`,
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
        .eq('id', instrumentId)
        .eq('org_id', orgId)
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
          success: false,
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
            'Instrument status cannot be set to Sold directly. Use the sales flow.',
          success: false,
        },
        status: 409,
      };
    }

    const currentStatus = (currentInstrument.status ??
      'Available') as Instrument['status'];
    const transitionError = validateInstrumentStatusTransition(
      currentStatus,
      validationResult.data.status as Instrument['status']
    );
    if (transitionError) {
      return {
        payload: { error: transitionError, success: false },
        status: 409,
      };
    }

    const reservedStateResult = buildReservedStateUpdate(
      currentStatus,
      currentInstrument.reserved_reason,
      currentInstrument.reserved_by_user_id,
      currentInstrument.reserved_connection_id,
      validationResult.data as Partial<Instrument>,
      auth.user.id
    );

    if (reservedStateResult.error) {
      return {
        payload: { error: reservedStateResult.error, success: false },
        status: 400,
      };
    }

    validationResult.data =
      reservedStateResult.update as typeof validationResult.data;
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
        .eq('id', instrumentId)
        .eq('org_id', orgId)
        .single();

    if (currentInstrumentError || !currentInstrument) {
      throw errorHandler.handleSupabaseError(
        currentInstrumentError,
        'Fetch instrument state'
      );
    }

    const reservedStateResult = buildReservedStateUpdate(
      (currentInstrument.status ?? 'Available') as Instrument['status'],
      currentInstrument.reserved_reason,
      currentInstrument.reserved_by_user_id,
      currentInstrument.reserved_connection_id,
      validationResult.data as Partial<Instrument>,
      auth.user.id
    );

    if (reservedStateResult.error) {
      return {
        payload: { error: reservedStateResult.error, success: false },
        status: 400,
      };
    }

    validationResult.data =
      reservedStateResult.update as typeof validationResult.data;
  }

  const row = toInstrumentUpdateRow(
    validationResult.data as PartialInstrumentInput
  );

  if (Object.keys(row).length === 0) {
    return {
      payload: {
        error: 'No valid fields to update',
        success: false,
      },
      status: 400,
    };
  }

  const { data: updatedRows, error } = await auth.userSupabase
    .from('instruments')
    .update(row)
    .eq('id', instrumentId)
    .eq('org_id', orgId)
    .eq('updated_at', expectedUpdatedAt)
    .select('*');

  if (error) {
    throw errorHandler.handleSupabaseError(error, 'Update instrument');
  }

  if (!updatedRows?.length) {
    const { data: exists } = await auth.userSupabase
      .from('instruments')
      .select('id')
      .eq('id', instrumentId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!exists) {
      return {
        payload: { error: 'Instrument not found', success: false },
        status: 404,
      };
    }

    logInfo('instrument_patch_conflict', input.apiPath, {
      instrumentId,
      event: 'instrument_patch_conflict',
      http_status: 409,
    });

    return {
      payload: {
        error: 'This record was updated elsewhere. Refresh and try again.',
        error_code: 'INSTRUMENT_CONFLICT',
        success: false,
      },
      status: 409,
      metadata: { instrumentId },
    };
  }

  const data = updatedRows[0];

  logInfo('instrument_patch_success', input.apiPath, { instrumentId });

  return {
    payload: { data: typeGuards.validateInstrument(data) },
    status: 200,
    metadata: { instrumentId },
  };
}
