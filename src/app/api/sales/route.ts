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
} from '@/utils/inputValidation';

const PAGE_SIZE = 10;
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

function buildSaleCreateRequestHash(input: {
  sale_price: number;
  sale_date: string;
  client_id: string | null;
  instrument_id: string | null;
  notes: string | null;
}): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
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

  if (filters.fromDate && validateDateString(filters.fromDate)) {
    positiveTotalsQuery = positiveTotalsQuery.gte(
      'sale_date',
      filters.fromDate
    );
  }

  if (filters.toDate && validateDateString(filters.toDate)) {
    positiveTotalsQuery = positiveTotalsQuery.lte('sale_date', filters.toDate);
  }

  if (filters.search) {
    positiveTotalsQuery = positiveTotalsQuery.ilike(
      'notes',
      `%${filters.search}%`
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

  if (filters.fromDate && validateDateString(filters.fromDate)) {
    refundTotalsQuery = refundTotalsQuery.gte('sale_date', filters.fromDate);
  }

  if (filters.toDate && validateDateString(filters.toDate)) {
    refundTotalsQuery = refundTotalsQuery.lte('sale_date', filters.toDate);
  }

  if (filters.search) {
    refundTotalsQuery = refundTotalsQuery.ilike('notes', `%${filters.search}%`);
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

  const revenue = Number(positiveTotals?.revenue ?? 0);
  const avgTicket = Number(positiveTotals?.avg_ticket ?? 0);
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
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      const searchParams = request.nextUrl.searchParams;
      const isExport = searchParams.get('export') === 'true';

      if (isExport) {
        const adminError = requireAdmin(auth);
        if (adminError) {
          return {
            payload: {
              error: 'Admin role required',
              error_code: 'ADMIN_REQUIRED',
            },
            status: 403,
          };
        }
      }

      let page = parseInt(searchParams.get('page') || '1', 10);
      let pageSize = parseInt(
        searchParams.get('pageSize') || PAGE_SIZE.toString(),
        10
      );

      if (!Number.isFinite(page) || page < 1) page = 1;
      if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = PAGE_SIZE;

      if (isExport) {
        pageSize = Math.min(5000, pageSize);
        page = 1;
      } else {
        if (pageSize > 100) pageSize = 100;
      }

      const fromDate = searchParams.get('fromDate') || undefined;
      const toDate = searchParams.get('toDate') || undefined;
      const search = searchParams.get('search') || undefined;
      const hasClientParam = searchParams.get('hasClient');
      const hasClient =
        hasClientParam === 'true'
          ? true
          : hasClientParam === 'false'
            ? false
            : undefined;
      const instrumentId = searchParams.get('instrument_id') || undefined;
      const sortColumn = searchParams.get('sortColumn') || 'sale_date';
      const sortDirection = searchParams.get('sortDirection') || 'desc';

      if (instrumentId && !validateUUID(instrumentId)) {
        return {
          payload: { error: 'Invalid instrument_id format' },
          status: 400,
        };
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = auth.userSupabase
        .from('sales_history')
        .select(SALES_SELECT_COLUMNS, { count: 'exact' })
        .eq('org_id', auth.orgId!);

      let fromFilter = fromDate;
      let toFilter = toDate;

      if (
        fromFilter &&
        toFilter &&
        validateDateString(fromFilter) &&
        validateDateString(toFilter)
      ) {
        if (fromFilter > toFilter) {
          [fromFilter, toFilter] = [toFilter, fromFilter];
        }
        query = query.gte('sale_date', fromFilter).lte('sale_date', toFilter);
      } else {
        if (fromFilter && validateDateString(fromFilter)) {
          query = query.gte('sale_date', fromFilter);
        }
        if (toFilter && validateDateString(toFilter)) {
          query = query.lte('sale_date', toFilter);
        }
      }

      const sanitizedSearch = search ? sanitizeSearchTerm(search) : undefined;
      const normalizedSearch = sanitizedSearch?.trim()
        ? sanitizedSearch
        : undefined;

      if (normalizedSearch) {
        query = query.ilike('notes', `%${normalizedSearch}%`);
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

      const { data, error, count } = isExport
        ? await query.order(orderColumn, { ascending }).limit(pageSize)
        : await query.order(orderColumn, { ascending }).range(from, to);

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Fetch sales history');
      }

      const rows = data || [];
      const validationResult = safeValidate(rows, validateSalesHistoryArray);
      const validationWarning = !validationResult.success;

      if (validationWarning) {
        captureException(
          new Error('SalesAPI response validation warning'),
          'SalesAPI GET response validation warning'
        );
      }

      let totals = null;
      if (!isExport && count !== null && count > 0) {
        totals = await fetchSalesTotals(
          auth,
          {
            fromDate: fromFilter,
            toDate: toFilter,
            search: normalizedSearch,
            hasClient,
            instrumentId,
          },
          count
        );
      }

      if (isExport) {
        if (!validationResult.success) {
          return {
            payload: {
              error:
                'Sales export failed: invalid data detected in database rows.',
            },
            status: 500,
          };
        }

        return {
          payload: {
            data: validationResult.data,
          },
          metadata: {
            page,
            recordCount: validationResult.data.length,
            totalCount: count || 0,
            sortColumn,
            sortDirection,
            instrumentId,
            isExport,
            validationWarning: false,
          },
        };
      }

      return {
        payload: {
          data: rows,
          pagination: {
            page,
            pageSize,
            totalCount: count || 0,
            totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
          },
          totals: totals || undefined,
        },
        metadata: {
          page,
          recordCount: rows.length,
          totalCount: count || 0,
          sortColumn,
          sortDirection,
          instrumentId,
          isExport,
          hasTotals: totals !== null,
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
      path: 'SalesAPI',
      context: 'SalesAPI',
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
          payload: {
            error: 'Admin role required',
            error_code: 'ADMIN_REQUIRED',
          },
          status: 403,
        };
      }

      const body = await request.json();
      const {
        sale_price,
        sale_date,
        client_id,
        instrument_id,
        notes,
        idempotency_key,
      } = body;

      // 1. Domain Validation First (per revised plan)
      if (
        sale_price === undefined ||
        sale_price === null ||
        sale_date == null ||
        sale_date === ''
      ) {
        return {
          payload: { error: 'Sale price and date are required.' },
          status: 400,
        };
      }

      if (!validateDateString(sale_date)) {
        return {
          payload: {
            error: 'sale_date must be a valid date string (YYYY-MM-DD).',
          },
          status: 400,
        };
      }

      const parsedPrice = Number(sale_price);
      if (Number.isNaN(parsedPrice)) {
        return {
          payload: { error: 'Sale price must be a number.' },
          status: 400,
        };
      }

      if (parsedPrice === 0) {
        return {
          payload: { error: 'Sale price cannot be zero.' },
          status: 400,
        };
      }

      // 2. Idempotency Key Check Second
      const idempotencyKey =
        request.headers.get('Idempotency-Key')?.trim() ||
        (typeof idempotency_key === 'string' ? idempotency_key.trim() : '');

      if (!idempotencyKey) {
        return {
          payload: { error: 'Idempotency key is required.' },
          status: 400,
        };
      }

      const validationResult = safeValidate(
        {
          sale_price: parsedPrice,
          sale_date,
          client_id: client_id || null,
          instrument_id: instrument_id || null,
          notes: notes || null,
        },
        validateCreateSalesHistory
      );
      if (!validationResult.success) {
        return {
          payload: {
            error: `Invalid sales history data: ${validationResult.error}`,
          },
          status: 400,
        };
      }

      const normalizedSaleInput = {
        sale_price: parsedPrice,
        sale_date,
        client_id: client_id || null,
        instrument_id: instrument_id || null,
        notes: notes || null,
      };
      const requestHash = buildSaleCreateRequestHash(normalizedSaleInput);

      const { data: saleId, error: createError } = await auth.userSupabase.rpc(
        'create_sale_atomic_idempotent',
        {
          p_route_key: 'POST:/api/sales',
          p_idempotency_key: idempotencyKey,
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
            payload: { error: errorMessage },
            status: 409,
          };
        }

        if (
          errorMessage.includes('already sold') ||
          errorMessage.includes('completed sale record') ||
          errorMessage.includes('Instrument not found')
        ) {
          return {
            payload: { error: errorMessage },
            status: 409,
          };
        }

        throw errorHandler.handleSupabaseError(createError, 'Create sale');
      }

      // Production path: saleId is a UUID string → fetch and return full record
      if (typeof saleId === 'string') {
        const validatedData = await fetchSaleById(auth, saleId);
        return {
          payload: { data: validatedData },
          status: 201,
          metadata: { recordId: validatedData.id },
        };
      }

      // Mock/object path: RPC returned a non-null object (e.g. { sale_id: '...' })
      if (saleId !== null && typeof saleId === 'object') {
        return {
          payload: { data: saleId },
          status: 201,
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
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: {
            error: 'Admin role required',
            error_code: 'ADMIN_REQUIRED',
          },
          status: 403,
        };
      }

      const body = await request.json();
      const { id, sale_price, notes } = body;

      if (!id) {
        return {
          payload: { error: 'Sale ID is required.' },
          status: 400,
        };
      }

      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid sale ID format' },
          status: 400,
        };
      }

      let normalizedPrice: number | undefined = undefined;
      if (sale_price !== undefined && sale_price !== null) {
        const parsed = Number(sale_price);
        if (Number.isNaN(parsed)) {
          return {
            payload: { error: 'Sale price must be a number.' },
            status: 400,
          };
        }
        if (parsed === 0) {
          return {
            payload: { error: 'Sale price cannot be zero.' },
            status: 400,
          };
        }
        normalizedPrice = parsed;
      }

      const validationResult = safeValidate(
        { sale_price: normalizedPrice, notes },
        validatePartialSalesHistory
      );
      if (!validationResult.success) {
        return {
          payload: { error: `Invalid update data: ${validationResult.error}` },
          status: 400,
        };
      }

      if (normalizedPrice === undefined && notes === undefined) {
        return {
          payload: { error: 'No fields to update.' },
          status: 400,
        };
      }

      const currentSale = await fetchSaleById(auth, id);
      const hasPriceChange =
        normalizedPrice !== undefined &&
        normalizedPrice !== currentSale.sale_price;
      const noteOnlyUpdate =
        !hasPriceChange && notes !== undefined && notes !== currentSale.notes;

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
            p_notes: notes ?? currentSale.notes ?? null,
          }
        );

        if (error || typeof adjustmentId !== 'string') {
          const errorMessage =
            error && typeof error.message === 'string'
              ? error.message
              : 'Failed to create sale adjustment';

          if (isSaleConflict(errorMessage)) {
            return {
              payload: { error: errorMessage },
              status: 409,
            };
          }

          throw errorHandler.handleSupabaseError(
            error,
            'Create sale adjustment'
          );
        }

        const adjustmentSale = await fetchSaleById(auth, adjustmentId);

        return {
          payload: { data: adjustmentSale },
          metadata: { id: adjustmentId },
        };
      }

      if (!noteOnlyUpdate) {
        return {
          payload: { data: currentSale },
          metadata: { id },
        };
      }

      const { data: updatedSaleId, error } = await auth.userSupabase.rpc(
        'update_sale_notes_atomic',
        {
          p_sale_id: id,
          p_notes: notes ?? null,
        }
      );

      if (error || typeof updatedSaleId !== 'string') {
        const errorMessage =
          error && typeof error.message === 'string'
            ? error.message
            : 'Failed to update sale notes';

        if (isSaleConflict(errorMessage)) {
          return {
            payload: { error: errorMessage },
            status: 409,
          };
        }

        throw errorHandler.handleSupabaseError(error, 'Update sale notes');
      }

      const validatedData = await fetchSaleById(auth, updatedSaleId);

      return {
        payload: { data: validatedData },
        metadata: { id },
      };
    }
  );
}

export const PATCH = withSentryRoute(withAuthRoute(patchHandler));
