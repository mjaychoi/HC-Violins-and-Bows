import { NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
// captureException removed - withSentryRoute handles error reporting
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
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
import type { User } from '@supabase/supabase-js';

const PAGE_SIZE = 10;

async function getHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'SalesAPI',
      context: 'SalesAPI',
    },
    async () => {
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

      // Export 모드일 때는 페이지네이션 건너뛰기 (DoS 방지를 위해 최대 5000개로 제한)
      // FIXED: 10000개는 서버 타임아웃/메모리 위험하므로 5000개로 제한
      if (isExport) {
        pageSize = Math.min(5000, pageSize); // Export 모드에서 최대 5000개까지 허용
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
          return {
            payload: { error: 'Invalid instrument_id format' },
            status: 400,
          };
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

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Fetch sales history');
      }

      // Validate response data
      const validationResult = safeValidate(
        data || [],
        validateSalesHistoryArray
      );
      const validationWarning = !validationResult.success;

      // 전체 데이터의 totals 계산 (필터링된 전체 데이터 기준)
      // Export 모드가 아니고, totals 계산이 필요한 경우에만 수행
      let totals = null;
      if (!isExport && count !== null && count > 0) {
        // 전체 필터링된 데이터를 가져와서 totals 계산
        // 효율성을 위해 sale_price만 선택
        // ✅ FIXED: Supabase queries are immutable, must reassign chain results
        let totalsQuery = supabase.from('sales_history').select('sale_price');

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
          totalsQuery = totalsQuery
            .gte('sale_date', fromFilter)
            .lte('sale_date', toFilter);
        } else {
          if (fromFilter && validateDateString(fromFilter)) {
            totalsQuery = totalsQuery.gte('sale_date', fromFilter);
          }
          if (toFilter && validateDateString(toFilter)) {
            totalsQuery = totalsQuery.lte('sale_date', toFilter);
          }
        }

        if (search) {
          const sanitizedSearch = sanitizeSearchTerm(search);
          if (sanitizedSearch) {
            totalsQuery = totalsQuery.ilike('notes', `%${sanitizedSearch}%`);
          }
        }

        // Client filter: totals 계산에도 동일하게 적용
        if (hasClient !== undefined) {
          if (hasClient) {
            totalsQuery = totalsQuery.not('client_id', 'is', null);
          } else {
            totalsQuery = totalsQuery.is('client_id', null);
          }
        }

        if (instrumentId && validateUUID(instrumentId)) {
          totalsQuery = totalsQuery.eq('instrument_id', instrumentId);
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

      // Export 모드일 때는 pagination 정보 없이 데이터만 반환
      if (isExport) {
        return {
          payload: {
            data: data || [],
          },
          metadata: {
            page,
            recordCount: data?.length || 0,
            totalCount: count || 0,
            sortColumn,
            sortDirection,
            instrumentId,
            isExport,
            validationWarning,
          },
        };
      }

      return {
        payload: {
          data: data || [],
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
          recordCount: data?.length || 0,
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

async function postHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    {
      method: 'POST',
      path: 'SalesAPI',
      context: 'SalesAPI',
    },
    async () => {
      const body = await request.json();
      const { sale_price, sale_date, client_id, instrument_id, notes } = body;

      // Basic validation: 명시적으로 undefined/null/빈 문자열 체크
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

      // 날짜 형식 검증
      if (!validateDateString(sale_date)) {
        return {
          payload: {
            error: 'sale_date must be a valid date string (YYYY-MM-DD).',
          },
          status: 400,
        };
      }

      // 가격 타입 및 값 검증
      const parsedPrice = Number(sale_price);
      if (Number.isNaN(parsedPrice)) {
        return {
          payload: { error: 'Sale price must be a number.' },
          status: 400,
        };
      }

      // 비즈니스 규칙: 0원 금액은 허용하지 않음
      if (parsedPrice === 0) {
        return {
          payload: { error: 'Sale price cannot be zero.' },
          status: 400,
        };
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
        return {
          payload: {
            error: `Invalid sales history data: ${validationResult.error}`,
          },
          status: 400,
        };
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

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Create sale');
      }

      // Validate response data
      const validatedData = validateSalesHistory(data);

      return {
        payload: { data: validatedData },
        status: 201,
        metadata: { recordId: validatedData.id },
      };
    }
  );
}

export const POST = withSentryRoute(withAuthRoute(postHandler));

async function patchHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    {
      method: 'PATCH',
      path: 'SalesAPI',
      context: 'SalesAPI',
    },
    async () => {
      const body = await request.json();
      const { id, sale_price, notes } = body;

      if (!id) {
        return {
          payload: { error: 'Sale ID is required.' },
          status: 400,
        };
      }

      // Validate UUID format
      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid sale ID format' },
          status: 400,
        };
      }

      // sale_price 타입 파싱 (POST와 일관성 유지)
      let normalizedPrice: number | undefined = undefined;
      if (sale_price !== undefined && sale_price !== null) {
        const parsed = Number(sale_price);
        if (Number.isNaN(parsed)) {
          return {
            payload: { error: 'Sale price must be a number.' },
            status: 400,
          };
        }
        // 비즈니스 규칙: 0원 금액은 허용하지 않음
        if (parsed === 0) {
          return {
            payload: { error: 'Sale price cannot be zero.' },
            status: 400,
          };
        }
        normalizedPrice = parsed;
      }

      // Validate update data using partial schema
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

      const updateData: Record<string, unknown> = {};
      if (normalizedPrice !== undefined) {
        updateData.sale_price = normalizedPrice;
      }
      if (notes !== undefined) {
        updateData.notes = notes;
      }

      if (Object.keys(updateData).length === 0) {
        return {
          payload: { error: 'No fields to update.' },
          status: 400,
        };
      }

      const supabase = getServerSupabase();
      const { data, error } = await supabase
        .from('sales_history')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Update sale');
      }

      // Validate response data
      const validatedData = validateSalesHistory(data);

      return {
        payload: { data: validatedData },
        metadata: { id },
      };
    }
  );
}

export const PATCH = withSentryRoute(withAuthRoute(patchHandler));
