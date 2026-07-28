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
import { validateDateString, validateUUID } from '@/utils/inputValidation';
import * as typeGuards from '@/utils/typeGuards';
import { errorHandler } from '@/utils/errorHandler';
import { logInfo, logWarn } from '@/utils/logger';
import { writeAuditLog } from '@/utils/auditLog';
import type { Instrument } from '@/types';
import type { Json, TablesUpdate } from '@/types/database';
import { getInstrumentIdentityError } from '@/utils/identityValidation';

type InstrumentUpdateRow = TablesUpdate<'instruments'>;

type PartialInstrumentInput = Partial<{
  status: Instrument['status'];
  reserved_reason: string | null;
  maker: string | null;
  type: string | null;
  subtype: string | null;
  year: number | null;
  certificate: boolean;
  has_certificate: boolean;
  certificate_name: string | null;
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
  sale_price: number | null;
  sale_date: string | null;
  client_id: string | null;
  sales_note: string | null;
};

type SaleTransitionParseResult =
  | {
      ok: true;
      data: SaleTransitionPayload | null;
    }
  | {
      ok: false;
      error: string;
    };

const RPC_PATCH_KEYS = [
  'status',
  'maker',
  'type',
  'subtype',
  'year',
  'certificate',
  'certificate_name',
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

const SALE_TRANSITION_KEYS = [
  'sale_price',
  'sale_date',
  'client_id',
  'sales_note',
] as const;

const MAX_SALES_NOTE_LENGTH = 2_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
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

function normalizeOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('Expected text value');
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseSaleTransition(
  hasSaleTransition: boolean,
  value: unknown
): SaleTransitionParseResult {
  if (!hasSaleTransition || value === undefined || value === null) {
    return { ok: true, data: null };
  }

  if (!isObject(value)) {
    return {
      ok: false,
      error: 'sale_transition must be an object',
    };
  }

  const unknownKeys = Object.keys(value).filter(
    key =>
      !SALE_TRANSITION_KEYS.includes(
        key as (typeof SALE_TRANSITION_KEYS)[number]
      )
  );

  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `sale_transition contains unsupported fields: ${unknownKeys.join(
        ', '
      )}`,
    };
  }

  let salePrice: number | null = null;
  if (hasOwn(value, 'sale_price')) {
    const rawSalePrice = value.sale_price;

    if (rawSalePrice === null || rawSalePrice === undefined) {
      salePrice = null;
    } else if (
      typeof rawSalePrice === 'number' &&
      Number.isFinite(rawSalePrice)
    ) {
      if (rawSalePrice === 0) {
        return {
          ok: false,
          error: 'sale_transition.sale_price must be non-zero when provided',
        };
      }

      salePrice = rawSalePrice;
    } else {
      return {
        ok: false,
        error: 'sale_transition.sale_price must be a finite number',
      };
    }
  }

  let saleDate: string | null = null;
  if (hasOwn(value, 'sale_date')) {
    const rawSaleDate = value.sale_date;

    if (
      rawSaleDate === null ||
      rawSaleDate === undefined ||
      rawSaleDate === ''
    ) {
      saleDate = null;
    } else if (
      typeof rawSaleDate === 'string' &&
      validateDateString(rawSaleDate)
    ) {
      saleDate = rawSaleDate;
    } else {
      return {
        ok: false,
        error: 'sale_transition.sale_date must be a valid date string',
      };
    }
  }

  let clientId: string | null = null;
  if (hasOwn(value, 'client_id')) {
    const rawClientId = value.client_id;

    if (
      rawClientId === null ||
      rawClientId === undefined ||
      rawClientId === ''
    ) {
      clientId = null;
    } else if (typeof rawClientId === 'string' && validateUUID(rawClientId)) {
      clientId = rawClientId;
    } else {
      return {
        ok: false,
        error: 'sale_transition.client_id must be a valid UUID',
      };
    }
  }

  let salesNote: string | null = null;
  if (hasOwn(value, 'sales_note')) {
    try {
      salesNote = normalizeOptionalText(value.sales_note);
    } catch {
      return {
        ok: false,
        error: 'sale_transition.sales_note must be a string',
      };
    }

    if (salesNote && salesNote.length > MAX_SALES_NOTE_LENGTH) {
      return {
        ok: false,
        error: `sale_transition.sales_note cannot exceed ${MAX_SALES_NOTE_LENGTH} characters`,
      };
    }
  }

  return {
    ok: true,
    data: {
      sale_price: salePrice,
      sale_date: saleDate,
      client_id: clientId,
      sales_note: salesNote,
    },
  };
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

  if (Object.prototype.hasOwnProperty.call(input, 'type')) {
    row.type =
      typeof input.type === 'string'
        ? input.type.trim() || null
        : (input.type ?? null);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'subtype')) {
    row.subtype = normalizeNullableText(input.subtype);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'year')) {
    row.year = input.year ?? null;
  }

  const touchesCertificate =
    Object.prototype.hasOwnProperty.call(input, 'certificate') ||
    Object.prototype.hasOwnProperty.call(input, 'has_certificate');

  if (touchesCertificate) {
    row.certificate = Boolean(input.certificate ?? input.has_certificate);
    if (!row.certificate) {
      row.certificate_name = null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'certificate_name')) {
    row.certificate_name = normalizeNullableText(input.certificate_name);
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

async function assertResultingInstrumentIdentity(
  auth: AuthContext,
  orgId: string,
  instrumentId: string,
  updates: Partial<Instrument>
): Promise<ApiHandlerResult | null> {
  const touchesIdentity =
    Object.prototype.hasOwnProperty.call(updates, 'maker') ||
    Object.prototype.hasOwnProperty.call(updates, 'type');

  if (!touchesIdentity) {
    return null;
  }

  const { data: current, error } = await auth.userSupabase
    .from('instruments')
    .select('maker, type')
    .eq('id', instrumentId)
    .eq('org_id', orgId)
    .single();

  if (error || !current) {
    throw errorHandler.handleSupabaseError(error, 'Fetch instrument identity');
  }

  const resultingMaker = Object.prototype.hasOwnProperty.call(updates, 'maker')
    ? (updates.maker ?? null)
    : (current.maker ?? null);
  const resultingType = Object.prototype.hasOwnProperty.call(updates, 'type')
    ? (updates.type ?? null)
    : (current.type ?? null);

  const identityError = getInstrumentIdentityError({
    maker: resultingMaker,
    type: resultingType,
  });

  if (identityError) {
    return {
      payload: { error: identityError, success: false },
      status: 400,
    };
  }

  return null;
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
  const hasSaleTransition = hasOwn(body, 'sale_transition');

  delete updates.id;
  delete updates.updated_at;
  delete updates.sale_transition;

  const saleTransitionResult = parseSaleTransition(
    hasSaleTransition,
    body.sale_transition
  );

  if (!saleTransitionResult.ok) {
    return {
      payload: {
        error: saleTransitionResult.error,
        success: false,
      },
      status: 400,
    };
  }

  const saleTransition = saleTransitionResult.data;

  if (saleTransition) {
    if (updates.status !== 'Sold') {
      return {
        payload: {
          error: 'sale_transition requires status to be set to Sold.',
          success: false,
        },
        status: 400,
      };
    }

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

    const identityFailure = await assertResultingInstrumentIdentity(
      auth,
      orgId,
      instrumentId,
      validationResult.data as Partial<Instrument>
    );
    if (identityFailure) {
      return identityFailure;
    }

    const p_patch = toRpcPatchJson(
      validationResult.data as Partial<Instrument>
    );

    const { error: rpcError, data: rpcData } = await auth.userSupabase.rpc(
      'update_instrument_sale_transition_atomic',
      {
        p_instrument_id: instrumentId,
        p_patch: p_patch as Json,
        p_sale_price: saleTransition.sale_price,
        p_sale_date: saleTransition.sale_date,
        p_client_id: saleTransition.client_id,
        p_sales_note: saleTransition.sales_note,
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

  let validatedUpdates = validationResult.data;

  if (validatedUpdates.status !== undefined) {
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
      validatedUpdates.status !== 'Sold'
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
      validatedUpdates.status === 'Sold'
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
      validatedUpdates.status as Instrument['status']
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
      validatedUpdates as Partial<Instrument>,
      auth.user.id
    );

    if (reservedStateResult.error) {
      return {
        payload: { error: reservedStateResult.error, success: false },
        status: 400,
      };
    }

    validatedUpdates = reservedStateResult.update as typeof validatedUpdates;
  } else if (
    Object.prototype.hasOwnProperty.call(validatedUpdates, 'reserved_reason')
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
      validatedUpdates as Partial<Instrument>,
      auth.user.id
    );

    if (reservedStateResult.error) {
      return {
        payload: { error: reservedStateResult.error, success: false },
        status: 400,
      };
    }

    validatedUpdates = reservedStateResult.update as typeof validatedUpdates;
  }

  const identityFailure = await assertResultingInstrumentIdentity(
    auth,
    orgId,
    instrumentId,
    validatedUpdates as Partial<Instrument>
  );
  if (identityFailure) {
    return identityFailure;
  }

  const row = toInstrumentUpdateRow(validatedUpdates as PartialInstrumentInput);

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

  const hasFinancialChange =
    Object.prototype.hasOwnProperty.call(row, 'cost_price') ||
    Object.prototype.hasOwnProperty.call(row, 'consignment_price');

  if (hasFinancialChange) {
    void writeAuditLog({
      orgId,
      actorId: auth.user.id,
      actorRole: auth.role as 'admin' | 'member' | 'service',
      action: 'instrument.update_financial',
      resourceType: 'instrument',
      resourceId: instrumentId,
      metadata: {
        ...(Object.prototype.hasOwnProperty.call(row, 'cost_price') && {
          cost_price: row.cost_price,
        }),
        ...(Object.prototype.hasOwnProperty.call(row, 'consignment_price') && {
          consignment_price: row.consignment_price,
        }),
      },
    });
  }

  return {
    payload: { data: typeGuards.validateInstrument(data) },
    status: 200,
    metadata: { instrumentId },
  };
}
