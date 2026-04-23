import { NextRequest } from 'next/server';
import { errorHandler } from '@/utils/errorHandler';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import { executeInstrumentPatch } from '@/app/api/instruments/_shared/executeInstrumentPatch';
import {
  ensureInstrumentIdempotencyTableContract,
  instrumentSchemaContractMissingResult,
  isInstrumentIdempotencyTableMissingError,
} from '@/app/api/instruments/_shared/instrumentApiContract';
import {
  validateInstrument,
  validateCreateInstrument,
  safeValidate,
} from '@/utils/typeGuards';
import { validateSortColumn, validateUUID } from '@/utils/inputValidation';
import { generateInstrumentSerialNumber } from '@/utils/uniqueNumberGenerator';
import { Instrument } from '@/types';
import type { TablesInsert } from '@/types/database';
import { logInfo, logWarn } from '@/utils/logger';

type InstrumentInsertRow = TablesInsert<'instruments'>;
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

function normalizeIdempotencyKey(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }
  const trimmed = headerValue.trim();
  if (!trimmed || trimmed.length > 200) {
    return null;
  }
  return trimmed;
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

      const idempotencyKey = normalizeIdempotencyKey(
        request.headers.get('idempotency-key')
      );

      if (idempotencyKey) {
        const idempotencyContract =
          await ensureInstrumentIdempotencyTableContract(auth.userSupabase);
        if (idempotencyContract) {
          return idempotencyContract;
        }

        const { data: existingMap, error: mapLookupError } =
          await auth.userSupabase
            .from('instrument_create_idempotency')
            .select('instrument_id')
            .eq('org_id', auth.orgId)
            .eq('idempotency_key', idempotencyKey)
            .maybeSingle();

        if (mapLookupError) {
          if (isInstrumentIdempotencyTableMissingError(mapLookupError)) {
            logWarn(
              'instrument_idempotency_lookup_schema_missing',
              'InstrumentsAPI',
              {
                orgId: auth.orgId,
              }
            );
            return instrumentSchemaContractMissingResult([
              'instrument_create_idempotency',
            ]);
          }
          logWarn('instrument_idempotency_lookup_failed', 'InstrumentsAPI', {
            orgId: auth.orgId,
            code: (mapLookupError as { code?: string }).code,
          });
          throw errorHandler.handleSupabaseError(
            mapLookupError,
            'Idempotency lookup'
          );
        }

        if (existingMap?.instrument_id) {
          const { data: existingRow, error: existingErr } =
            await auth.userSupabase
              .from('instruments')
              .select('*')
              .eq('id', existingMap.instrument_id)
              .eq('org_id', auth.orgId)
              .single();

          if (existingErr || !existingRow) {
            throw errorHandler.handleSupabaseError(
              existingErr,
              'Fetch idempotent instrument'
            );
          }

          logInfo('instrument_create_idempotent_hit', 'InstrumentsAPI', {
            orgId: auth.orgId,
            instrumentId: existingRow.id,
          });

          return {
            payload: { data: validateInstrument(existingRow) },
            status: 201,
            metadata: {
              instrumentId: existingRow.id,
              idempotentReplay: true,
            },
          };
        }
      }

      let resolvedSerial = normalizeNullableText(
        createInput.serial_number ?? null
      );
      if (!resolvedSerial) {
        const existingSerials = await getOrgSerialNumbers(auth, auth.orgId);
        resolvedSerial = generateInstrumentSerialNumber(
          createInput.type?.trim() || null,
          existingSerials
        );
      }

      const instrumentInsert = toInstrumentInsertRow({
        ...createInput,
        serial_number: resolvedSerial,
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

      if (idempotencyKey) {
        const { error: mapInsertError } = await auth.userSupabase
          .from('instrument_create_idempotency')
          .insert({
            org_id: auth.orgId,
            idempotency_key: idempotencyKey,
            instrument_id: data.id,
            created_by_user_id: auth.user.id,
          });

        if (mapInsertError?.code === '23505') {
          logInfo('instrument_create_idempotent_race', 'InstrumentsAPI', {
            orgId: auth.orgId,
          });
          const { data: winner, error: winnerErr } = await auth.userSupabase
            .from('instrument_create_idempotency')
            .select('instrument_id')
            .eq('org_id', auth.orgId)
            .eq('idempotency_key', idempotencyKey)
            .single();

          if (winnerErr || !winner?.instrument_id) {
            throw errorHandler.handleSupabaseError(
              winnerErr,
              'Resolve idempotent instrument'
            );
          }

          if (winner.instrument_id !== data.id) {
            await auth.userSupabase
              .from('instruments')
              .delete()
              .eq('id', data.id)
              .eq('org_id', auth.orgId);
            logInfo(
              'instrument_create_duplicate_row_removed',
              'InstrumentsAPI',
              {
                droppedId: data.id,
                canonicalId: winner.instrument_id,
              }
            );
          }

          const { data: canonical, error: canonicalErr } =
            await auth.userSupabase
              .from('instruments')
              .select('*')
              .eq('id', winner.instrument_id)
              .eq('org_id', auth.orgId)
              .single();

          if (canonicalErr || !canonical) {
            throw errorHandler.handleSupabaseError(
              canonicalErr,
              'Fetch canonical instrument'
            );
          }

          return {
            payload: { data: validateInstrument(canonical) },
            status: 201,
            metadata: {
              instrumentId: canonical.id,
              idempotentReplay: true,
            },
          };
        }

        if (mapInsertError) {
          if (isInstrumentIdempotencyTableMissingError(mapInsertError)) {
            logWarn(
              'instrument_idempotency_insert_schema_missing',
              'InstrumentsAPI',
              { orgId: auth.orgId }
            );
            return instrumentSchemaContractMissingResult([
              'instrument_create_idempotency',
            ]);
          }
          throw errorHandler.handleSupabaseError(
            mapInsertError,
            'Idempotency insert'
          );
        }

        logInfo('instrument_create_idempotent_registered', 'InstrumentsAPI', {
          orgId: auth.orgId,
          instrumentId: data.id,
        });
      }

      const validatedResponse = validateInstrument(data);

      logInfo('instrument_create_success', 'InstrumentsAPI', {
        instrumentId: validatedResponse.id,
      });

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
      const body = await request.json();

      if (!isObject(body) || typeof body.id !== 'string') {
        return {
          payload: { error: 'Instrument ID is required', success: false },
          status: 400,
        };
      }

      if (!validateUUID(body.id)) {
        return {
          payload: { error: 'Invalid instrument ID format', success: false },
          status: 400,
        };
      }

      return executeInstrumentPatch(auth, {
        mode: 'collection',
        instrumentId: body.id,
        body,
        apiPath: 'InstrumentsAPI',
      });
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

      logInfo('instrument_delete_success', 'InstrumentsAPI', {
        instrumentId: id,
        orgId,
        deletedRows: count,
      });

      return {
        payload: { success: true, id },
        status: 200,
        metadata: { instrumentId: id },
      };
    }
  );
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));
