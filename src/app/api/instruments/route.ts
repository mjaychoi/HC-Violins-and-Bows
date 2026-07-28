import { NextRequest } from 'next/server';
import { errorHandler } from '@/utils/errorHandler';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import { executeInstrumentPatch } from '@/app/api/instruments/_shared/executeInstrumentPatch';
import { ensureInstrumentIdempotencyTableContract } from '@/app/api/instruments/_shared/instrumentApiContract';
import {
  claimCreateIdempotency,
  clearCreateIdempotency,
  completeCreateIdempotency,
  createRequestHash,
} from '@/app/api/_utils/createIdempotency';
import {
  validateInstrument,
  validateCreateInstrument,
  safeValidate,
} from '@/utils/typeGuards';
import {
  validateSortColumn,
  validateUUID,
  sanitizeSearchTerm,
  escapePostgrestFilterValue,
} from '@/utils/inputValidation';
import { generateInstrumentSerialNumber } from '@/utils/uniqueNumberGenerator';
import { Instrument } from '@/types';
import type { TablesInsert } from '@/types/database';
import { logInfo, logError } from '@/utils/logger';
import { getStorage } from '@/utils/storage';
import { searchRateLimit, applyRateLimit } from '@/app/api/_utils/rateLimit';
import { writeAuditLog } from '@/utils/auditLog';
import { assertInstrumentsSchemaReadiness } from '@/app/api/_utils/schemaReadiness';

const MAX_SEARCH_LEN = 100;

type InstrumentInsertRow = TablesInsert<'instruments'>;
type CreateInstrumentInput = {
  status?: Instrument['status'];
  reserved_reason?: string | null;
  maker?: string | null;
  type?: string | null;
  subtype?: string | null;
  year?: number | null;
  certificate?: boolean;
  has_certificate?: boolean;
  certificate_name?: string | null;
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
const MAX_ALL_RESULTS = 1000;

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
  const hasCertificate = Boolean(input.certificate ?? input.has_certificate);

  return {
    org_id: input.org_id,
    type: input.type?.trim() || null,
    maker: normalizeNullableText(input.maker),
    subtype: normalizeNullableText(input.subtype),
    year: input.year ?? null,
    certificate: hasCertificate,
    certificate_name: hasCertificate
      ? normalizeNullableText(input.certificate_name)
      : null,
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
    instrumentInsert.type?.trim() || null,
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

        const { limited } = await applyRateLimit(searchRateLimit, auth.user.id);
        if (limited) {
          return {
            payload: { error: 'Too many requests', success: false },
            status: 429,
          };
        }

        const searchParams = request.nextUrl.searchParams;

        const orderBy = validateSortColumn(
          'instruments',
          searchParams.get('orderBy')
        );

        const ascending = searchParams.get('ascending') !== 'false';
        const ownership = searchParams.get('ownership') || 'all';
        const rawSearch = searchParams.get('search');
        let search: string | undefined = rawSearch
          ? sanitizeSearchTerm(rawSearch)
          : undefined;

        if (search) {
          search = search.trim();
          if (!search) search = undefined;
        }

        if (search && search.length > MAX_SEARCH_LEN) {
          search = search.slice(0, MAX_SEARCH_LEN);
        }
        const limitParam = searchParams.get('limit');
        const listAll = searchParams.get('all') === 'true';
        const DEFAULT_LIST_LIMIT = 200;
        const MAX_LIST_LIMIT = MAX_ALL_RESULTS;
        const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
        const requestedLimit = Number.isFinite(parsedLimit)
          ? parsedLimit
          : DEFAULT_LIST_LIMIT;
        const responseLimit = Math.min(
          MAX_LIST_LIMIT,
          Math.max(1, listAll ? MAX_LIST_LIMIT : requestedLimit)
        );
        const queryLimit = listAll ? MAX_ALL_RESULTS + 1 : responseLimit;

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
          const escaped = escapePostgrestFilterValue(search);
          query = query.ilike('maker', `%${escaped}%`);
        }

        // ✅ limit은 non-reassigning 형태로 호출 (mock chain 대응)
        if (
          typeof queryLimit === 'number' &&
          !Number.isNaN(queryLimit) &&
          queryLimit > 0
        ) {
          query = query.limit(queryLimit);
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
        const rawRows = data || [];
        const truncated = listAll && rawRows.length > MAX_ALL_RESULTS;
        const rows = truncated ? rawRows.slice(0, MAX_ALL_RESULTS) : rawRows;

        const transformed = rows.map(item => ({
          ...item,
          has_certificate: !!item.certificate,
        }));

        // Product policy: cost_price and consignment_price are internal financial
        // fields (purchase cost / consignor settlement). Members see the retail
        // price but not the margin data. Admins receive the full record.
        const isAdmin = auth.role === 'admin';
        const responseRows = isAdmin
          ? transformed
          : transformed.map(
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ({ cost_price: _cp, consignment_price: _cc, ...rest }) => rest
            );

        const responsePageSize = listAll ? responseRows.length : responseLimit;

        return {
          payload: {
            data: responseRows,
            count: count || 0,
            pagination: {
              page: 1,
              pageSize: responsePageSize,
              totalCount: count || 0,
              totalPages: listAll
                ? 1
                : Math.max(1, Math.ceil((count || 0) / responseLimit)),
            },
            scope: listAll ? 'all' : 'paged',
            truncated,
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

      await assertInstrumentsSchemaReadiness({ supabase: auth.userSupabase });

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
      const idempotencyRouteKey = 'POST:/api/instruments';

      if (idempotencyKey) {
        const idempotencyContract =
          await ensureInstrumentIdempotencyTableContract(auth.userSupabase);
        if (idempotencyContract) {
          return idempotencyContract;
        }
      }

      const idempotency = await claimCreateIdempotency(
        request,
        auth,
        idempotencyRouteKey,
        createRequestHash(createInput)
      );

      if (idempotency.kind === 'replay') {
        return {
          payload: idempotency.payload,
          status: 201,
          metadata: { idempotentReplay: true },
        };
      }

      if (idempotency.kind === 'conflict') {
        return {
          payload: idempotency.payload,
          status: idempotency.status,
        };
      }

      const claimedIdempotencyKey =
        idempotency.kind === 'claimed' ? idempotency.idempotencyKey : null;

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

      let data;
      try {
        data = await createInstrumentWithRetry(auth, instrumentInsert);
      } catch (error) {
        await clearCreateIdempotency(
          auth,
          idempotencyRouteKey,
          claimedIdempotencyKey
        );
        throw error;
      }

      const validatedResponse = validateInstrument(data);
      const payload = { data: validatedResponse };

      await completeCreateIdempotency(
        auth,
        idempotencyRouteKey,
        claimedIdempotencyKey,
        payload
      );

      if (claimedIdempotencyKey) {
        logInfo('instrument_create_idempotent_registered', 'InstrumentsAPI', {
          orgId: auth.orgId,
          instrumentId: validatedResponse.id,
        });
      }

      logInfo('instrument_create_success', 'InstrumentsAPI', {
        instrumentId: validatedResponse.id,
      });

      void writeAuditLog({
        orgId: auth.orgId,
        actorId: auth.user.id,
        actorRole: auth.role as 'admin' | 'member' | 'service',
        action: 'instrument.create',
        resourceType: 'instrument',
        resourceId: validatedResponse.id,
        metadata: {
          ...(createInput.cost_price != null && {
            cost_price: createInput.cost_price,
          }),
          ...(createInput.consignment_price != null && {
            consignment_price: createInput.consignment_price,
          }),
          changed_fields: [
            ...(createInput.cost_price != null ? ['cost_price'] : []),
            ...(createInput.consignment_price != null
              ? ['consignment_price']
              : []),
          ],
        },
      });

      return {
        payload,
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

      await assertInstrumentsSchemaReadiness({ supabase: auth.userSupabase });

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

      // Fetch storage keys before deletion so we can clean up physical files
      const [imagesResult, certificatesResult] = await Promise.all([
        auth.userSupabase
          .from('instrument_images')
          .select('storage_key')
          .eq('instrument_id', id)
          .eq('org_id', orgId),
        auth.userSupabase
          .from('instrument_certificates')
          .select('storage_path')
          .eq('instrument_id', id)
          .eq('org_id', orgId),
      ]);

      if (imagesResult.error) {
        throw errorHandler.handleSupabaseError(
          imagesResult.error,
          'Fetch instrument images for delete'
        );
      }
      if (certificatesResult.error) {
        throw errorHandler.handleSupabaseError(
          certificatesResult.error,
          'Fetch instrument certificates for delete'
        );
      }

      const storageKeys = [
        ...(imagesResult.data ?? []).map(r => r.storage_key).filter(Boolean),
        ...(certificatesResult.data ?? [])
          .map(r => r.storage_path)
          .filter(Boolean),
      ] as string[];

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
        storageKeysToClean: storageKeys.length,
      });

      void writeAuditLog({
        orgId,
        actorId: auth.user.id,
        actorRole: auth.role as 'admin' | 'member' | 'service',
        action: 'instrument.delete',
        resourceType: 'instrument',
        resourceId: id,
      });

      // Clean up physical storage files — DB rows are already gone via cascade.
      // Failures are non-fatal: log + persist to orphaned_storage_objects for retry.
      const storage = getStorage();
      for (const key of storageKeys) {
        try {
          await storage.deleteFile(key);
        } catch (storageErr) {
          const message =
            storageErr instanceof Error
              ? storageErr.message
              : String(storageErr);
          logError(
            'instrument_storage_cleanup_failed',
            storageErr,
            'InstrumentsAPI',
            {
              instrumentId: id,
              orgId,
              storageKey: key,
            }
          );
          await auth.userSupabase.from('orphaned_storage_objects').insert({
            org_id: orgId,
            storage_key: key,
            bucket: 's3',
            source: 'instrument_delete',
            error_message: message,
          });
        }
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
