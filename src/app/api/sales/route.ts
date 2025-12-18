import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
import { logApiRequest } from '@/utils/logger';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity } from '@/types/errors';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import {
  createSafeErrorResponse,
  createLogErrorInfo,
} from '@/utils/errorSanitization';
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

async function getHandler(request: NextRequest) {
  const startTime = performance.now();
  const searchParams = request.nextUrl.searchParams;

  // Export 모드 확인 (CSV export 등에서 전체 데이터 필요)
  const isExport = searchParams.get('export') === 'true';

  // 페이지네이션 인자 방어적 검증
  let page = parseInt(searchParams.get('page') || '1', 10);
  let pageSize = parseInt(
    searchParams.get('pageSize') || PAGE_SIZE.toString(),
    10
  );

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = PAGE_SIZE;

  // Export 모드일 때는 페이지네이션 건너뛰기 (DoS 방지를 위해 최대 10000개로 제한)
  // 일반 모드에서는 기존 제한 유지
  if (isExport) {
    pageSize = 10000; // Export 모드에서 최대 10000개까지 허용
    page = 1; // Export 모드에서는 항상 첫 페이지만
  } else {
    // 과도한 pageSize 제한 (DoS 방지)
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

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const supabase = getServerSupabase();
    let query = supabase.from('sales_history').select(
      `
          id,
          instrument_id,
          client_id,
          sale_price,
          sale_date,
          notes,
          created_at
        `,
      { count: 'exact' }
    );

    // 날짜 필터링: 검증 및 순서 처리
    let fromFilter = fromDate;
    let toFilter = toDate;

    if (
      fromFilter &&
      toFilter &&
      validateDateString(fromFilter) &&
      validateDateString(toFilter)
    ) {
      // fromDate > toDate인 경우 swap하여 올바른 범위로 처리
      if (fromFilter > toFilter) {
        [fromFilter, toFilter] = [toFilter, fromFilter];
      }
      query = query.gte('sale_date', fromFilter).lte('sale_date', toFilter);
    } else {
      // 단일 날짜 필터 처리
      if (fromFilter && validateDateString(fromFilter)) {
        query = query.gte('sale_date', fromFilter);
      }
      if (toFilter && validateDateString(toFilter)) {
        query = query.lte('sale_date', toFilter);
      }
    }

    if (search) {
      const sanitizedSearch = sanitizeSearchTerm(search);
      if (sanitizedSearch) {
        query = query.ilike('notes', `%${sanitizedSearch}%`);
      }
    }

    // Client filter: true = has clients (client_id IS NOT NULL), false = no clients (client_id IS NULL)
    if (hasClient !== undefined) {
      if (hasClient) {
        query = query.not('client_id', 'is', null);
      } else {
        query = query.is('client_id', null);
      }
    }

    if (instrumentId) {
      if (!validateUUID(instrumentId)) {
        return NextResponse.json(
          { error: 'Invalid instrument_id format' },
          { status: 400 }
        );
      }
      query = query.eq('instrument_id', instrumentId);
    }

    // 정렬 처리
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

    // Export 모드에서는 페이지네이션 없이 전체 데이터 가져오기 (limit으로만 제한)
    const { data, error, count } = isExport
      ? await query.order(orderColumn, { ascending }).limit(pageSize)
      : await query.order(orderColumn, { ascending }).range(from, to);

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        'Fetch sales history'
      );
      const logInfo = createLogErrorInfo(appError);
      logApiRequest('GET', '/api/sales', undefined, duration, 'SalesAPI', {
        page,
        fromDate,
        toDate,
        search,
        sortColumn,
        sortDirection,
        error: true,
        errorCode: (appError as { code?: string })?.code,
        logMessage: logInfo.message,
      });
      captureException(
        appError,
        'SalesAPI.GET',
        { page, fromDate, toDate, search, sortColumn, sortDirection, duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // Validate response data
    const validationResult = safeValidate(
      data || [],
      validateSalesHistoryArray
    );
    if (!validationResult.success) {
      captureException(
        new Error(`Invalid sales history data: ${validationResult.error}`),
        'SalesAPI.GET',
        { duration, recordCount: data?.length || 0 },
        ErrorSeverity.HIGH
      );
      logApiRequest('GET', '/api/sales', 200, duration, 'SalesAPI', {
        page,
        recordCount: data?.length || 0,
        totalCount: count || 0,
        sortColumn,
        sortDirection,
        instrumentId,
        validationWarning: true,
      });
    }

    // 전체 데이터의 totals 계산 (필터링된 전체 데이터 기준)
    // Export 모드가 아니고, totals 계산이 필요한 경우에만 수행
    let totals = null;
    if (!isExport && count !== null && count > 0) {
      // 전체 필터링된 데이터를 가져와서 totals 계산
      // 효율성을 위해 sale_price만 선택
      const totalsQuery = supabase.from('sales_history').select('sale_price');

      // 동일한 필터 적용
      if (
        fromFilter &&
        toFilter &&
        validateDateString(fromFilter) &&
        validateDateString(toFilter)
      ) {
        if (fromFilter > toFilter) {
          [fromFilter, toFilter] = [toFilter, fromFilter];
        }
        totalsQuery.gte('sale_date', fromFilter).lte('sale_date', toFilter);
      } else {
        if (fromFilter && validateDateString(fromFilter)) {
          totalsQuery.gte('sale_date', fromFilter);
        }
        if (toFilter && validateDateString(toFilter)) {
          totalsQuery.lte('sale_date', toFilter);
        }
      }

      if (search) {
        const sanitizedSearch = sanitizeSearchTerm(search);
        if (sanitizedSearch) {
          totalsQuery.ilike('notes', `%${sanitizedSearch}%`);
        }
      }

      // Client filter: totals 계산에도 동일하게 적용
      if (hasClient !== undefined) {
        if (hasClient) {
          totalsQuery.not('client_id', 'is', null);
        } else {
          totalsQuery.is('client_id', null);
        }
      }

      if (instrumentId && validateUUID(instrumentId)) {
        totalsQuery.eq('instrument_id', instrumentId);
      }

      // Limit을 크게 설정하되, 너무 많은 데이터는 가져오지 않도록 (totals 계산용)
      const { data: allSalesForTotals, error: totalsError } =
        await totalsQuery.limit(10000);

      if (!totalsError && allSalesForTotals && allSalesForTotals.length > 0) {
        const positiveSales = allSalesForTotals.filter(
          (s: { sale_price: number }) => s.sale_price > 0
        );
        const revenue = positiveSales.reduce(
          (sum: number, s: { sale_price: number }) => sum + s.sale_price,
          0
        );
        const refund = allSalesForTotals
          .filter((s: { sale_price: number }) => s.sale_price < 0)
          .reduce(
            (sum: number, s: { sale_price: number }) =>
              sum + Math.abs(s.sale_price),
            0
          );
        const avgTicket =
          positiveSales.length > 0 ? revenue / positiveSales.length : 0;
        const totalSalesAmount = revenue + refund;
        const refundRate =
          totalSalesAmount > 0
            ? Math.round((refund / totalSalesAmount) * 100 * 10) / 10
            : 0;

        totals = {
          revenue,
          refund,
          avgTicket,
          count: count || allSalesForTotals.length, // count가 더 정확할 수 있음
          refundRate,
        };
      }
    }

    logApiRequest('GET', '/api/sales', 200, duration, 'SalesAPI', {
      page,
      recordCount: data?.length || 0,
      totalCount: count || 0,
      sortColumn,
      sortDirection,
      instrumentId,
      isExport,
      hasTotals: totals !== null,
    });

    // Export 모드일 때는 pagination 정보 없이 데이터만 반환
    if (isExport) {
      return NextResponse.json({
        data: data || [],
      });
    }

    return NextResponse.json({
      data: data || [],
      pagination: {
        page,
        pageSize,
        totalCount: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
      },
      totals: totals || undefined,
    });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error,
      'Fetch sales history'
    );
    const logInfo = createLogErrorInfo(appError);
    logApiRequest('GET', '/api/sales', undefined, duration, 'SalesAPI', {
      page,
      fromDate,
      toDate,
      search,
      sortColumn,
      sortDirection,
      error: true,
      errorCode: (appError as { code?: string })?.code,
      logMessage: logInfo.message,
    });
    captureException(
      appError,
      'SalesAPI.GET',
      { page, fromDate, toDate, search, sortColumn, sortDirection, duration },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}

export const GET = withSentryRoute(withAuthRoute(getHandler));

export const POST = withAuthRoute(async function POST(request: NextRequest) {
  const startTime = performance.now();

  try {
    const body = await request.json();
    const { sale_price, sale_date, client_id, instrument_id, notes } = body;

    // Basic validation: 명시적으로 undefined/null/빈 문자열 체크
    if (
      sale_price === undefined ||
      sale_price === null ||
      sale_date == null ||
      sale_date === ''
    ) {
      return NextResponse.json(
        { error: 'Sale price and date are required.' },
        { status: 400 }
      );
    }

    // 날짜 형식 검증
    if (!validateDateString(sale_date)) {
      return NextResponse.json(
        { error: 'sale_date must be a valid date string (YYYY-MM-DD).' },
        { status: 400 }
      );
    }

    // 가격 타입 및 값 검증
    const parsedPrice = Number(sale_price);
    if (Number.isNaN(parsedPrice)) {
      return NextResponse.json(
        { error: 'Sale price must be a number.' },
        { status: 400 }
      );
    }

    // 비즈니스 규칙: 0원 금액은 허용하지 않음
    if (parsedPrice === 0) {
      return NextResponse.json(
        { error: 'Sale price cannot be zero.' },
        { status: 400 }
      );
    }

    // Validate request body structure (POST는 id와 created_at이 없으므로 create schema 사용)
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
      return NextResponse.json(
        { error: `Invalid sales history data: ${validationResult.error}` },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('sales_history')
      .insert([
        {
          sale_price: parsedPrice,
          sale_date,
          client_id: client_id || null,
          instrument_id: instrument_id || null,
          notes: notes || null,
        },
      ])
      .select()
      .single();

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(error, 'Create sale');
      const logInfo = createLogErrorInfo(appError);
      logApiRequest('POST', '/api/sales', undefined, duration, 'SalesAPI', {
        error: true,
        errorCode: (appError as { code?: string })?.code,
        logMessage: logInfo.message,
      });
      captureException(
        appError,
        'SalesAPI.POST',
        { duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // Validate response data
    const validatedData = validateSalesHistory(data);

    logApiRequest('POST', '/api/sales', 201, duration, 'SalesAPI', {
      recordId: validatedData.id,
    });

    return NextResponse.json({ data: validatedData }, { status: 201 });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(error, 'Create sale');
    const logInfo = createLogErrorInfo(appError);
    logApiRequest('POST', '/api/sales', undefined, duration, 'SalesAPI', {
      error: true,
      errorCode: (appError as { code?: string })?.code,
      logMessage: logInfo.message,
    });
    captureException(
      appError,
      'SalesAPI.POST',
      { duration },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
});

export const PATCH = withAuthRoute(async function PATCH(request: NextRequest) {
  const startTime = performance.now();
  let body: { id?: string; sale_price?: number | string; notes?: string } = {};

  try {
    body = await request.json();
    const { id, sale_price, notes } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Sale ID is required.' },
        { status: 400 }
      );
    }

    // Validate UUID format
    if (!validateUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid sale ID format' },
        { status: 400 }
      );
    }

    // sale_price 타입 파싱 (POST와 일관성 유지)
    let normalizedPrice: number | undefined = undefined;
    if (sale_price !== undefined && sale_price !== null) {
      const parsed = Number(sale_price);
      if (Number.isNaN(parsed)) {
        return NextResponse.json(
          { error: 'Sale price must be a number.' },
          { status: 400 }
        );
      }
      // 비즈니스 규칙: 0원 금액은 허용하지 않음
      if (parsed === 0) {
        return NextResponse.json(
          { error: 'Sale price cannot be zero.' },
          { status: 400 }
        );
      }
      normalizedPrice = parsed;
    }

    // Validate update data using partial schema
    const validationResult = safeValidate(
      { sale_price: normalizedPrice, notes },
      validatePartialSalesHistory
    );
    if (!validationResult.success) {
      return NextResponse.json(
        { error: `Invalid update data: ${validationResult.error}` },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (normalizedPrice !== undefined) {
      updateData.sale_price = normalizedPrice;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update.' },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('sales_history')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(error, 'Update sale');
      const logInfo = createLogErrorInfo(appError);
      logApiRequest('PATCH', '/api/sales', undefined, duration, 'SalesAPI', {
        id,
        error: true,
        errorCode: (appError as { code?: string })?.code,
        logMessage: logInfo.message,
      });
      captureException(
        appError,
        'SalesAPI.PATCH',
        { id, duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // Validate response data
    const validatedData = validateSalesHistory(data);

    logApiRequest('PATCH', '/api/sales', 200, duration, 'SalesAPI', {
      id,
    });

    return NextResponse.json({ data: validatedData });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(error, 'Update sale');
    const logInfo = createLogErrorInfo(appError);
    logApiRequest('PATCH', '/api/sales', undefined, duration, 'SalesAPI', {
      id: body?.id,
      error: true,
      errorCode: (appError as { code?: string })?.code,
      logMessage: logInfo.message,
    });
    captureException(
      appError,
      'SalesAPI.PATCH',
      { id: body?.id, duration },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
});
