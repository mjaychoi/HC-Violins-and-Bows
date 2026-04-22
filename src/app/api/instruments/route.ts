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
import { generateInstrumentSerialNumber } from '@/utils/uniqueNumberGenerator';
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
type CreateInstrumentInput = {
  status?: Instrument['status'];
  reserved_reason?: string | null;
  maker?: string | null;
  type: string;
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
};
type PartialInstrumentInput = Partial<CreateInstrumentInput> & {
  reserved_by_user_id?: string | null;
  reserved_connection_id?: string | null;
};
type InstrumentInsertInput = CreateInstrumentInput & {
  org_id: string;
  reserved_by_user_id: string | null;
  reserved_connection_id: string | null;
};

const SERIAL_CONFLICT_MAX_RETRIES = 3;

function normalizeNullableText(
  value: string | null | undefined
): string | null {
  if (typeof value !== 'string') {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toInstrumentInsertRow(
  input: InstrumentInsertInput
): InstrumentInsertRow {
  return {
    org_id: input.org_id,
    type: input.type.trim(),
    maker: normalizeNullableText(input.maker),
    subtype: normalizeNullableText(input.subtype),
    year: input.year ?? null,
    certificate: Boolean(input.certificate ?? input.has_certificate),
    cost_price: input.cost_price ?? null,
    consignment_price: input.consignment_price ?? null,
    size: normalizeNullableText(input.size),
    weight: normalizeNullableText(input.weight),
    price: input.price ?? null,
    ownership: normalizeNullableText(input.ownership),
    note: normalizeNullableText(input.note),
    serial_number: normalizeNullableText(input.serial_number),
    status: input.status ?? 'Available',
    reserved_reason:
      input.status === 'Reserved'
        ? normalizeNullableText(input.reserved_reason)
        : null,
    reserved_by_user_id: input.reserved_by_user_id,
    reserved_connection_id: input.reserved_connection_id,
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

function isRetryableSerialConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  if (code !== '23505') {
    return false;
  }

  const message =
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message.toLowerCase()
      : '';
  const details =
    typeof (error as { details?: unknown }).details === 'string'
      ? (error as { details: string }).details.toLowerCase()
      : '';

  return (
    message.includes('serial') ||
    details.includes('serial') ||
    details.includes('idx_instruments_org_serial') ||
    details.includes('idx_instruments_serial_number')
  );
}

async function getOrgSerialNumbers(
  auth: AuthContext,
  orgId: string
): Promise<string[]> {
  const { data, error } = await auth.userSupabase
    .from('instruments')
    .select('serial_number')
    .eq('org_id', orgId);

  if (error) {
    throw errorHandler.handleSupabaseError(error, 'Fetch instrument serials');
  }

  return (data ?? [])
    .map((row: { serial_number?: string | null }) => row.serial_number ?? null)
    .filter((serial): serial is string => Boolean(serial?.trim()));
}

async function allocateRetrySerialNumber(
  auth: AuthContext,
  instrumentInsert: InstrumentInsertRow
): Promise<string> {
  const existingSerialNumbers = await getOrgSerialNumbers(auth, auth.orgId!);
  return generateInstrumentSerialNumber(
    instrumentInsert.type,
    existingSerialNumbers
  );
}

async function createInstrumentWithRetry(
  auth: AuthContext,
  instrumentInsert: InstrumentInsertRow
) {
  let nextInsert = instrumentInsert;

  for (let attempt = 0; attempt <= SERIAL_CONFLICT_MAX_RETRIES; attempt += 1) {
    const { data, error } = await auth.userSupabase
      .from('instruments')
      .insert(nextInsert)
      .select()
      .single();

    if (!error) {
      return data;
    }

    const isLastAttempt = attempt >= SERIAL_CONFLICT_MAX_RETRIES;
    const canRetry =
      !isLastAttempt &&
      Boolean(nextInsert.serial_number) &&
      isRetryableSerialConflict(error);

    if (!canRetry) {
      throw errorHandler.handleSupabaseError(error, 'Create instrument');
    }

    nextInsert = {
      ...nextInsert,
      serial_number: await allocateRetrySerialNumber(auth, nextInsert),
    };
  }

  throw new Error(
    'Failed to create instrument after retrying serial allocation.'
  );
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
        /**
         * `all=true` = intentional unbounded list for admin/inventory UIs.
         * Otherwise, cap rows when `limit` is omitted (PostgREST default is unbounded).
         */
        const listAll = searchParams.get('all') === 'true';
        const DEFAULT_LIST_LIMIT = 200;
        const limit = listAll
          ? undefined
          : limitParam
            ? parseInt(limitParam, 10)
            : DEFAULT_LIST_LIMIT;

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
        if (typeof limit === 'number' && !Number.isNaN(limit) && limit > 0) {
          query = query.limit(limit);
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

      if (auth.role !== 'admin') {
        return {
          payload: { error: 'Admin role required', success: false },
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

      const createInput = validationResult.data as CreateInstrumentInput;
      const nextStatus = createInput.status ?? 'Available';

      if (nextStatus === 'Reserved' && !createInput.reserved_reason?.trim()) {
        return {
          payload: {
            error: 'Reserved status requires a reserved_reason.',
            success: false,
          },
          status: 400,
        };
      }

      const instrumentInsert = toInstrumentInsertRow({
        ...createInput,
        status: nextStatus,
        org_id: auth.orgId,
        reserved_reason:
          nextStatus === 'Reserved'
            ? (createInput.reserved_reason?.trim() ?? null)
            : null,
        reserved_by_user_id: nextStatus === 'Reserved' ? auth.user.id : null,
        reserved_connection_id: null,
      });

      const data = await createInstrumentWithRetry(auth, instrumentInsert);

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
        .update(
          toInstrumentUpdateRow(validationResult.data as PartialInstrumentInput)
        )
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
