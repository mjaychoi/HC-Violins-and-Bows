import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { errorHandler } from '@/utils/errorHandler';
import { captureException } from '@/utils/monitoring';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import {
  requireAdmin,
  requireOrgContext,
} from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import {
  validateSalesHistory,
  validateSalesHistoryArray,
  validatePartialSalesHistory,
  validateCreateSalesHistory,
  safeValidate,
} from '@/utils/typeGuards';
import {
  validateUUID,
  sanitizeSearchTerm,
  validateDateString,
  escapePostgrestFilterValue,
} from '@/utils/inputValidation';
import {
  validateSalePrice,
  type SalePriceErrorCode,
} from '@/utils/salePriceRules';

import { writeAuditLog } from '@/utils/auditLog';
import {
  applyScopedRateLimit,
  mutationRateLimit,
  tooManyRequestsApiResult,
} from '@/app/api/_utils/rateLimit';

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_SEARCH_LEN = 160;
const MAX_NOTES_LENGTH = 5_000;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const MAX_ALL_RESULTS = 1000;
const MAX_EXPORT_PAGE_SIZE = 5_000;

const SALES_SELECT_COLUMNS = `
  id,
  instrument_id,
  client_id,
  sale_price,
  sale_date,
  notes,
  created_at,
  entry_kind,
  adjustment_of_sale_id
`;

type SalesFilterState = {
  fromDate?: string;
  toDate?: string;
  search?: string;
  hasClient?: boolean;
  instrumentId?: string;
};

type SalesTotals = {
  revenue: number;
  refund: number;
  avgTicket: number;
  count: number;
  refundRate: number;
};

type SalesCreateInput = {
  sale_price: number;
  sale_date: string;
  client_id: string | null;
  instrument_id: string | null;
  notes: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readJsonObject(
  request: NextRequest
): Promise<
  { ok: true; body: Record<string, unknown> } | { ok: false; error: string }
> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      error: 'Invalid JSON body',
    };
  }

  if (!isObject(body)) {
    return {
      ok: false,
      error: 'Invalid request body',
    };
  }

  return {
    ok: true,
    body,
  };
}

function readRequiredIdempotencyKey(request: NextRequest):
  | { ok: true; idempotencyKey: string }
  | {
      ok: false;
      result: {
        payload: {
          error: string;
          error_code: string;
          retryable: false;
          success: false;
        };
        status: 400;
      };
    } {
  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim() ?? '';

  if (!idempotencyKey) {
    return {
      ok: false,
      result: {
        payload: {
          error: 'Idempotency key is required.',
          error_code: 'IDEMPOTENCY_KEY_REQUIRED',
          retryable: false,
          success: false,
        },
        status: 400,
      },
    };
  }

  if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return {
      ok: false,
      result: {
        payload: {
          error: `Idempotency-Key cannot exceed ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
          error_code: 'IDEMPOTENCY_KEY_INVALID',
          retryable: false,
          success: false,
        },
        status: 400,
      },
    };
  }

  return {
    ok: true,
    idempotencyKey,
  };
}

function parsePageNumber(value: string | null): number {
  const parsed = Number.parseInt(value ?? '1', 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.min(parsed, 1_000_000);
}

function parsePageSize(value: string | null, isExport: boolean): number {
  const parsed = Number.parseInt(value ?? String(DEFAULT_PAGE_SIZE), 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(parsed, isExport ? MAX_EXPORT_PAGE_SIZE : MAX_PAGE_SIZE);
}

function parseDateFilters(
  fromDate?: string,
  toDate?: string
):
  | { ok: true; fromDate?: string; toDate?: string }
  | { ok: false; payload: { error: string; success: false }; status: 400 } {
  if (fromDate && !validateDateString(fromDate)) {
    return {
      ok: false,
      payload: {
        error: `Invalid fromDate. Expected YYYY-MM-DD, received: ${fromDate}`,
        success: false,
      },
      status: 400,
    };
  }

  if (toDate && !validateDateString(toDate)) {
    return {
      ok: false,
      payload: {
        error: `Invalid toDate. Expected YYYY-MM-DD, received: ${toDate}`,
        success: false,
      },
      status: 400,
    };
  }

  if (fromDate && toDate && fromDate > toDate) {
    return {
      ok: false,
      payload: {
        error: 'fromDate cannot be after toDate',
        success: false,
      },
      status: 400,
    };
  }

  return {
    ok: true,
    fromDate,
    toDate,
  };
}

function normalizeSearch(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const sanitized = sanitizeSearchTerm(value).trim().slice(0, MAX_SEARCH_LEN);

  return sanitized || undefined;
}

function normalizeOptionalUuid(
  value: unknown,
  fieldName: string
):
  | { ok: true; value: string | null }
  | { ok: false; error: string; status: 400 } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }

  if (typeof value !== 'string') {
    return {
      ok: false,
      error: `${fieldName} must be a UUID string`,
      status: 400,
    };
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: true, value: null };
  }

  if (!validateUUID(trimmed)) {
    return {
      ok: false,
      error: `Invalid ${fieldName} format`,
      status: 400,
    };
  }

  return {
    ok: true,
    value: trimmed,
  };
}

function normalizeNotes(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return String(value).trim() || null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, MAX_NOTES_LENGTH) : null;
}

/**
 * POST /api/sales intentionally allows a negative amount to record a
 * standalone refund-style entry directly (SaleForm.tsx: "Amount (negative
 * for refund)"; permanent test "should allow negative sale_price for
 * refunds") — a pre-existing, documented product decision. PATCH /api/sales
 * also needs both signs: the client-sent amount is only used to disambiguate
 * refund vs. undo-refund intent (must exactly match ±the stored original —
 * see hasPriceChange below), never persisted directly. So both call sites use
 * requirePositive: false; only zero (and -0) is rejected here. This mirrors
 * validateSalePrice from src/utils/salePriceRules.ts — the same shared
 * validator PATCH /api/instruments uses — just with the sign requirement
 * relaxed for this endpoint's documented carve-out.
 */
function parseSalePrice(
  value: unknown
):
  | { ok: true; value: number }
  | { ok: false; error: string; status: 400; errorCode: SalePriceErrorCode } {
  const result = validateSalePrice(value, { requirePositive: false });

  if (!result.ok) {
    return {
      ok: false,
      error: result.message,
      status: 400,
      errorCode: result.code,
    };
  }

  return {
    ok: true,
    value: Number(result.amountDecimal),
  };
}

function parseCreateSaleInput(body: Record<string, unknown>):
  | { ok: true; value: SalesCreateInput }
  | {
      ok: false;
      error: string;
      status: 400;
      errorCode?: SalePriceErrorCode;
    } {
  const salePrice = parseSalePrice(body.sale_price);
  if (!salePrice.ok) return salePrice;

  if (
    body.sale_date === undefined ||
    body.sale_date === null ||
    body.sale_date === '' ||
    typeof body.sale_date !== 'string' ||
    !body.sale_date.trim()
  ) {
    return {
      ok: false,
      error: 'Sale date is required.',
      status: 400,
    };
  }

  const saleDate = body.sale_date.trim();

  if (!validateDateString(saleDate)) {
    return {
      ok: false,
      error: 'sale_date must be a valid date string (YYYY-MM-DD).',
      status: 400,
    };
  }

  const clientId = normalizeOptionalUuid(body.client_id, 'client_id');
  if (!clientId.ok) return clientId;

  const instrumentId = normalizeOptionalUuid(
    body.instrument_id,
    'instrument_id'
  );
  if (!instrumentId.ok) return instrumentId;

  return {
    ok: true,
    value: {
      sale_price: salePrice.value,
      sale_date: saleDate,
      client_id: clientId.value,
      instrument_id: instrumentId.value,
      notes: normalizeNotes(body.notes),
    },
  };
}

function buildSaleCreateRequestHash(input: SalesCreateInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function escapeIlikePattern(value: string): string {
  return `%${escapePostgrestFilterValue(value)}%`;
}

async function fetchSalesTotals(
  auth: AuthContext,
  filters: SalesFilterState,
  count: number
): Promise<SalesTotals | null> {
  if (count <= 0) {
    return null;
  }

  let positiveTotalsQuery = auth.userSupabase
    .from('sales_history')
    .select('revenue:sale_price.sum(), avg_ticket:sale_price.avg()')
    .eq('org_id', auth.orgId!)
    .gt('sale_price', 0);

  if (filters.fromDate) {
    positiveTotalsQuery = positiveTotalsQuery.gte(
      'sale_date',
      filters.fromDate
    );
  }

  if (filters.toDate) {
    positiveTotalsQuery = positiveTotalsQuery.lte('sale_date', filters.toDate);
  }

  if (filters.search) {
    positiveTotalsQuery = positiveTotalsQuery.ilike(
      'notes',
      escapeIlikePattern(filters.search)
    );
  }

  if (filters.hasClient !== undefined) {
    positiveTotalsQuery = filters.hasClient
      ? positiveTotalsQuery.not('client_id', 'is', null)
      : positiveTotalsQuery.is('client_id', null);
  }

  if (filters.instrumentId) {
    positiveTotalsQuery = positiveTotalsQuery.eq(
      'instrument_id',
      filters.instrumentId
    );
  }

  const { data: positiveTotals, error: positiveTotalsError } =
    await positiveTotalsQuery.single();

  if (positiveTotalsError) {
    throw errorHandler.handleSupabaseError(
      positiveTotalsError,
      'Fetch sales totals'
    );
  }

  let refundTotalsQuery = auth.userSupabase
    .from('sales_history')
    .select('refund_total:sale_price.sum()')
    .eq('org_id', auth.orgId!)
    .lt('sale_price', 0);

  if (filters.fromDate) {
    refundTotalsQuery = refundTotalsQuery.gte('sale_date', filters.fromDate);
  }

  if (filters.toDate) {
    refundTotalsQuery = refundTotalsQuery.lte('sale_date', filters.toDate);
  }

  if (filters.search) {
    refundTotalsQuery = refundTotalsQuery.ilike(
      'notes',
      escapeIlikePattern(filters.search)
    );
  }

  if (filters.hasClient !== undefined) {
    refundTotalsQuery = filters.hasClient
      ? refundTotalsQuery.not('client_id', 'is', null)
      : refundTotalsQuery.is('client_id', null);
  }

  if (filters.instrumentId) {
    refundTotalsQuery = refundTotalsQuery.eq(
      'instrument_id',
      filters.instrumentId
    );
  }

  const { data: refundTotals, error: refundTotalsError } =
    await refundTotalsQuery.single();

  if (refundTotalsError) {
    throw errorHandler.handleSupabaseError(
      refundTotalsError,
      'Fetch sales totals'
    );
  }

  const revenue = Math.max(0, Number(positiveTotals?.revenue ?? 0));
  const avgTicket = Math.max(0, Number(positiveTotals?.avg_ticket ?? 0));
  const refund = Math.abs(Number(refundTotals?.refund_total ?? 0));
  const totalSalesAmount = revenue + refund;
  const refundRate =
    totalSalesAmount > 0
      ? Math.round((refund / totalSalesAmount) * 100 * 10) / 10
      : 0;

  return {
    revenue,
    refund,
    avgTicket,
    count,
    refundRate,
  };
}

function isSaleConflict(message: string): boolean {
  return (
    message.includes('already') ||
    message.includes('not found') ||
    message.includes('Only ') ||
    message.includes('Direct sale amount rewrites are not allowed')
  );
}

async function fetchSaleById(auth: AuthContext, saleId: string) {
  if (!auth.orgId) {
    throw new Error('Organization context required for sale lookup');
  }

  const query = auth.userSupabase
    .from('sales_history')
    .select(SALES_SELECT_COLUMNS)
    .eq('id', saleId)
    .eq('org_id', auth.orgId);

  const { data, error } = await query.single();

  if (error) {
    throw errorHandler.handleSupabaseError(error, 'Fetch sale');
  }

  return validateSalesHistory(data);
}

async function getHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'SalesAPI',
      context: 'SalesAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      const searchParams = request.nextUrl.searchParams;
      const isExport = searchParams.get('export') === 'true';
      const fetchAll = searchParams.get('all') === 'true';
      const allScope = isExport || fetchAll;

      if (allScope) {
        const adminError = requireAdmin(auth);
        if (adminError) {
          return {
            payload: {
              error: 'Admin role required',
              error_code: 'ADMIN_REQUIRED',
              success: false,
            },
            status: 403,
          };
        }
      }

      let page = parsePageNumber(searchParams.get('page'));
      const pageSize = fetchAll
        ? MAX_ALL_RESULTS
        : parsePageSize(searchParams.get('pageSize'), isExport);

      if (allScope) {
        page = 1;
      }

      const rawFromDate = searchParams.get('fromDate') || undefined;
      const rawToDate = searchParams.get('toDate') || undefined;
      const dateFilters = parseDateFilters(rawFromDate, rawToDate);

      const fromDate = dateFilters.ok ? dateFilters.fromDate : undefined;
      const toDate = dateFilters.ok ? dateFilters.toDate : undefined;

      const search = normalizeSearch(searchParams.get('search') || undefined);

      const hasClientParam = searchParams.get('hasClient');
      const hasClient =
        hasClientParam === 'true'
          ? true
          : hasClientParam === 'false'
            ? false
            : hasClientParam
              ? null
              : undefined;

      if (hasClient === null) {
        return {
          payload: {
            error: 'hasClient must be true or false',
            success: false,
          },
          status: 400,
        };
      }

      const instrumentId = searchParams.get('instrument_id') || undefined;
      if (instrumentId && !validateUUID(instrumentId)) {
        return {
          payload: { error: 'Invalid instrument_id format', success: false },
          status: 400,
        };
      }

      const sortColumn = searchParams.get('sortColumn') || 'sale_date';
      const sortDirection = searchParams.get('sortDirection') || 'desc';

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = auth.userSupabase
        .from('sales_history')
        .select(SALES_SELECT_COLUMNS, { count: 'exact' })
        .eq('org_id', auth.orgId!);

      if (fromDate) {
        query = query.gte('sale_date', fromDate);
      }

      if (toDate) {
        query = query.lte('sale_date', toDate);
      }

      if (search) {
        query = query.ilike('notes', escapeIlikePattern(search));
      }

      if (hasClient !== undefined) {
        query = hasClient
          ? query.not('client_id', 'is', null)
          : query.is('client_id', null);
      }

      if (instrumentId) {
        query = query.eq('instrument_id', instrumentId);
      }

      const ascending = sortDirection === 'asc';

      let orderColumn: string;
      switch (sortColumn) {
        case 'sale_date':
          orderColumn = 'sale_date';
          break;
        case 'sale_price':
          orderColumn = 'sale_price';
          break;
        default:
          orderColumn = 'sale_date';
      }

      const { data, error, count } = allScope
        ? await query
            .order(orderColumn, { ascending })
            .limit(fetchAll ? pageSize + 1 : pageSize)
        : await query.order(orderColumn, { ascending }).range(from, to);

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Fetch sales history');
      }

      const rawRows = data || [];
      const truncated = fetchAll && rawRows.length > pageSize;
      const rows = truncated ? rawRows.slice(0, pageSize) : rawRows;
      const validationResult = safeValidate(rows, validateSalesHistoryArray);
      const validationWarning = !validationResult.success;

      if (validationWarning) {
        captureException(
          new Error('SalesAPI response validation warning'),
          'SalesAPI GET response validation warning'
        );
      }

      let totals = null;

      if (!allScope && count !== null && count > 0) {
        totals = await fetchSalesTotals(
          auth,
          {
            fromDate,
            toDate,
            search,
            hasClient,
            instrumentId,
          },
          count
        );
      }

      if (allScope) {
        if (!validationResult.success) {
          return {
            payload: {
              error:
                'Sales export failed: invalid data detected in database rows.',
              success: false,
            },
            status: 500,
          };
        }

        return {
          payload: {
            data: validationResult.data,
            pagination: {
              page: 1,
              pageSize: fetchAll ? validationResult.data.length : pageSize,
              totalCount: count || 0,
              totalPages: 1,
            },
            scope: 'all',
            truncated,
            success: true,
          },
          metadata: {
            page,
            recordCount: validationResult.data.length,
            totalCount: count || 0,
            sortColumn: orderColumn,
            sortDirection: ascending ? 'asc' : 'desc',
            instrumentId,
            isExport,
            fetchAll,
            validationWarning: false,
            scope: { enforced: true, orgId: auth.orgId },
            truncated,
          },
        };
      }

      // Product policy: sale_price is a completed-transaction financial figure.
      // Non-admin members can see that a sale occurred but not the amount.
      // allScope (export/all) is already admin-gated above.
      const isAdmin = auth.role === 'admin';
      const safeRows = isAdmin
        ? rows
        : rows.map(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ({ sale_price: _sp, ...rest }: Record<string, unknown>) => rest
          );

      return {
        payload: {
          data: safeRows,
          pagination: {
            page,
            pageSize,
            totalCount: count || 0,
            totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
          },
          scope: 'paged',
          // Totals are aggregate financial data — only return to admins.
          totals: isAdmin ? totals || undefined : undefined,
          success: true,
        },
        metadata: {
          page,
          recordCount: rows.length,
          totalCount: count || 0,
          sortColumn: orderColumn,
          sortDirection: ascending ? 'asc' : 'desc',
          instrumentId,
          isExport,
          hasTotals: totals !== null,
          validationWarning,
          scope: { enforced: true, orgId: auth.orgId },
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
      path: 'SalesAPI',
      context: 'SalesAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: {
            error: 'Admin role required',
            error_code: 'ADMIN_REQUIRED',
            success: false,
          },
          status: 403,
        };
      }

      const rateLimit = await applyScopedRateLimit(mutationRateLimit, {
        orgId: auth.orgId,
        userId: auth.user.id,
        method: 'POST',
        routeKey: 'sales',
        ip: request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
      });
      if (rateLimit.limited) {
        return tooManyRequestsApiResult();
      }

      const idempotency = readRequiredIdempotencyKey(request);
      if (!idempotency.ok) {
        return idempotency.result;
      }

      const bodyResult = await readJsonObject(request);
      if (!bodyResult.ok) {
        return {
          payload: { error: bodyResult.error, success: false },
          status: 400,
        };
      }

      const parsedInput = parseCreateSaleInput(bodyResult.body);
      if (!parsedInput.ok) {
        return {
          payload: {
            error: parsedInput.error,
            error_code: parsedInput.errorCode,
            success: false,
          },
          status: parsedInput.status,
        };
      }

      const normalizedSaleInput = parsedInput.value;

      const validationResult = safeValidate(
        normalizedSaleInput,
        validateCreateSalesHistory
      );

      if (!validationResult.success) {
        return {
          payload: {
            error: `Invalid sales history data: ${validationResult.error}`,
            success: false,
          },
          status: 400,
        };
      }

      const requestHash = buildSaleCreateRequestHash(normalizedSaleInput);

      const { data: saleId, error: createError } = await auth.userSupabase.rpc(
        'create_sale_atomic_idempotent',
        {
          p_route_key: 'POST:/api/sales',
          p_idempotency_key: idempotency.idempotencyKey,
          p_request_hash: requestHash,
          p_sale_price: normalizedSaleInput.sale_price,
          p_sale_date: normalizedSaleInput.sale_date,
          p_client_id: normalizedSaleInput.client_id,
          p_instrument_id: normalizedSaleInput.instrument_id,
          p_notes: normalizedSaleInput.notes,
        }
      );

      if (createError) {
        const errorMessage =
          createError && typeof createError.message === 'string'
            ? createError.message
            : 'Failed to create sale';

        if (
          errorMessage.includes(
            'Idempotency key reuse with different payload'
          ) ||
          errorMessage.includes('Idempotent request is already in progress')
        ) {
          return {
            payload: { error: errorMessage, success: false },
            status: 409,
          };
        }

        if (
          errorMessage.includes('already sold') ||
          errorMessage.includes('completed sale record') ||
          errorMessage.includes('Instrument not found')
        ) {
          return {
            payload: { error: errorMessage, success: false },
            status: 409,
          };
        }

        throw errorHandler.handleSupabaseError(createError, 'Create sale');
      }

      if (typeof saleId === 'string') {
        const validatedData = await fetchSaleById(auth, saleId);

        void writeAuditLog({
          orgId: auth.orgId!,
          actorId: auth.user.id,
          actorRole: auth.role as 'admin' | 'member' | 'service',
          action: 'sale.create',
          resourceType: 'sale',
          resourceId: validatedData.id,
        });

        return {
          payload: { data: validatedData, success: true },
          status: 201,
          metadata: {
            recordId: validatedData.id,
            idempotencyKeyPresent: true,
          },
        };
      }

      if (saleId !== null && typeof saleId === 'object') {
        return {
          payload: { data: saleId, success: true },
          status: 201,
          metadata: {
            idempotencyKeyPresent: true,
          },
        };
      }

      throw errorHandler.handleSupabaseError(null, 'Create sale');
    }
  );
}

export const POST = withSentryRoute(withAuthRoute(postHandler));

async function patchHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'PATCH',
      path: 'SalesAPI',
      context: 'SalesAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: {
            error: 'Admin role required',
            error_code: 'ADMIN_REQUIRED',
            success: false,
          },
          status: 403,
        };
      }

      const rateLimit = await applyScopedRateLimit(mutationRateLimit, {
        orgId: auth.orgId,
        userId: auth.user.id,
        method: 'PATCH',
        routeKey: 'sales',
        ip: request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
      });
      if (rateLimit.limited) {
        return tooManyRequestsApiResult();
      }

      const bodyResult = await readJsonObject(request);
      if (!bodyResult.ok) {
        return {
          payload: { error: bodyResult.error, success: false },
          status: 400,
        };
      }

      const { id, sale_price, notes } = bodyResult.body;

      if (typeof id !== 'string' || !id.trim()) {
        return {
          payload: { error: 'Sale ID is required.', success: false },
          status: 400,
        };
      }

      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid sale ID format', success: false },
          status: 400,
        };
      }

      let normalizedPrice: number | undefined = undefined;

      if (sale_price !== undefined && sale_price !== null) {
        const parsedPrice = parseSalePrice(sale_price);
        if (!parsedPrice.ok) {
          return {
            payload: {
              error: parsedPrice.error,
              error_code: parsedPrice.errorCode,
              success: false,
            },
            status: parsedPrice.status,
          };
        }

        normalizedPrice = parsedPrice.value;
      }

      const normalizedNotes =
        notes === undefined ? undefined : normalizeNotes(notes);

      const validationResult = safeValidate(
        { sale_price: normalizedPrice, notes: normalizedNotes },
        validatePartialSalesHistory
      );

      if (!validationResult.success) {
        return {
          payload: {
            error: `Invalid update data: ${validationResult.error}`,
            success: false,
          },
          status: 400,
        };
      }

      if (normalizedPrice === undefined && notes === undefined) {
        return {
          payload: { error: 'No fields to update.', success: false },
          status: 400,
        };
      }

      const currentSale = await fetchSaleById(auth, id);

      const hasPriceChange =
        normalizedPrice !== undefined &&
        normalizedPrice !== currentSale.sale_price;

      const noteOnlyUpdate =
        !hasPriceChange &&
        notes !== undefined &&
        normalizedNotes !== currentSale.notes;

      if (hasPriceChange) {
        const isRefundRequest =
          currentSale.sale_price > 0 &&
          normalizedPrice === -Math.abs(currentSale.sale_price);

        const isUndoRefundRequest =
          currentSale.sale_price < 0 &&
          normalizedPrice === Math.abs(currentSale.sale_price);

        if (!isRefundRequest && !isUndoRefundRequest) {
          return {
            payload: {
              error:
                'Direct sale amount rewrites are not allowed. Record an adjustment instead.',
              success: false,
            },
            status: 409,
          };
        }

        const adjustmentKind = isRefundRequest ? 'refund' : 'undo_refund';

        const { data: adjustmentId, error } = await auth.userSupabase.rpc(
          'create_sale_adjustment_atomic',
          {
            p_source_sale_id: id,
            p_adjustment_kind: adjustmentKind,
            p_notes: normalizedNotes ?? currentSale.notes ?? null,
          }
        );

        if (error || typeof adjustmentId !== 'string') {
          const errorMessage =
            error && typeof error.message === 'string'
              ? error.message
              : 'Failed to create sale adjustment';

          if (isSaleConflict(errorMessage)) {
            const { data: existing } = await auth.userSupabase
              .from('sales_history')
              .select('*')
              .eq('adjustment_of_sale_id', id)
              .eq('entry_kind', adjustmentKind)
              .eq('org_id', auth.orgId!)
              .maybeSingle();

            if (existing) {
              return {
                payload: { data: existing, success: true },
                metadata: {
                  id: existing.id,
                  idempotencyKeyPresent: true,
                  replayedAdjustment: true,
                },
              };
            }

            return {
              payload: { error: errorMessage, success: false },
              status: 409,
            };
          }

          throw errorHandler.handleSupabaseError(
            error,
            'Create sale adjustment'
          );
        }

        const adjustmentSale = await fetchSaleById(auth, adjustmentId);

        void writeAuditLog({
          orgId: auth.orgId!,
          actorId: auth.user.id,
          actorRole: auth.role as 'admin' | 'member' | 'service',
          action: 'sale.update',
          resourceType: 'sale',
          resourceId: id,
          metadata: {
            adjustment_kind: adjustmentKind,
            adjustment_id: adjustmentId,
          },
        });

        return {
          payload: { data: adjustmentSale, success: true },
          metadata: {
            id: adjustmentId,
            idempotencyKeyPresent: true,
          },
        };
      }

      if (!noteOnlyUpdate) {
        return {
          payload: { data: currentSale, success: true },
          metadata: {
            id,
            idempotencyKeyPresent: true,
            noOp: true,
          },
        };
      }

      const { data: updatedSaleId, error } = await auth.userSupabase.rpc(
        'update_sale_notes_atomic',
        {
          p_sale_id: id,
          p_notes: normalizedNotes ?? null,
        }
      );

      if (error || typeof updatedSaleId !== 'string') {
        const errorMessage =
          error && typeof error.message === 'string'
            ? error.message
            : 'Failed to update sale notes';

        if (isSaleConflict(errorMessage)) {
          return {
            payload: { error: errorMessage, success: false },
            status: 409,
          };
        }

        throw errorHandler.handleSupabaseError(error, 'Update sale notes');
      }

      const validatedData = await fetchSaleById(auth, updatedSaleId);

      void writeAuditLog({
        orgId: auth.orgId!,
        actorId: auth.user.id,
        actorRole: auth.role as 'admin' | 'member' | 'service',
        action: 'sale.update',
        resourceType: 'sale',
        resourceId: id,
        metadata: { notes_updated: true },
      });

      return {
        payload: { data: validatedData, success: true },
        metadata: {
          id,
          idempotencyKeyPresent: true,
        },
      };
    }
  );
}

export const PATCH = withSentryRoute(withAuthRoute(patchHandler));
