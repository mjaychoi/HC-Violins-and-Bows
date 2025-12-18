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
import { validateDateString } from '@/utils/inputValidation';

/**
 * Client sales summary aggregation endpoint
 * Returns aggregated sales data grouped by client_id
 * This reduces data transfer compared to fetching all sales records
 */
export interface ClientSalesSummary {
  client_id: string;
  total_spend: number;
  purchase_count: number;
  last_purchase_date: string | null;
  first_purchase_date: string | null;
}

async function getHandler(request: NextRequest) {
  const startTime = performance.now();
  const searchParams = request.nextUrl.searchParams;
  const fromDate = searchParams.get('fromDate') || undefined;
  const toDate = searchParams.get('toDate') || undefined;

  try {
    const supabase = getServerSupabase();

    // Build base query
    let query = supabase
      .from('sales_history')
      .select('client_id, sale_price, sale_date', { count: 'exact' });

    // Apply date filters if provided
    if (fromDate && validateDateString(fromDate)) {
      query = query.gte('sale_date', fromDate);
    }
    if (toDate && validateDateString(toDate)) {
      query = query.lte('sale_date', toDate);
    }

    // Filter out sales without client_id
    query = query.not('client_id', 'is', null);

    // Execute query
    const { data, error, count } = await query;

    const duration = Math.round(performance.now() - startTime);

    if (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        'Fetch sales summary by client'
      );
      const logInfo = createLogErrorInfo(appError);
      logApiRequest(
        'GET',
        '/api/sales/summary-by-client',
        undefined,
        duration,
        'SalesSummaryAPI',
        {
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );
      captureException(
        appError,
        'SalesSummaryAPI.GET',
        { fromDate, toDate, duration },
        ErrorSeverity.MEDIUM
      );
      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // Aggregate sales by client_id
    const summaryMap = new Map<string, ClientSalesSummary>();

    if (data && data.length > 0) {
      data.forEach(
        (sale: {
          client_id: string;
          sale_price: number;
          sale_date: string;
        }) => {
          const clientId = sale.client_id;
          const existing = summaryMap.get(clientId);

          if (existing) {
            existing.total_spend += sale.sale_price;
            existing.purchase_count += 1;
            // Update last purchase date (most recent)
            if (
              !existing.last_purchase_date ||
              sale.sale_date > existing.last_purchase_date
            ) {
              existing.last_purchase_date = sale.sale_date;
            }
            // Update first purchase date (earliest)
            if (
              !existing.first_purchase_date ||
              sale.sale_date < existing.first_purchase_date
            ) {
              existing.first_purchase_date = sale.sale_date;
            }
          } else {
            summaryMap.set(clientId, {
              client_id: clientId,
              total_spend: sale.sale_price,
              purchase_count: 1,
              last_purchase_date: sale.sale_date,
              first_purchase_date: sale.sale_date,
            });
          }
        }
      );
    }

    const summaries = Array.from(summaryMap.values());

    logApiRequest(
      'GET',
      '/api/sales/summary-by-client',
      200,
      duration,
      'SalesSummaryAPI',
      {
        clientCount: summaries.length,
        totalSales: count || 0,
        fromDate,
        toDate,
      }
    );

    return NextResponse.json({
      data: summaries,
      count: summaries.length,
      totalSales: count || 0,
    });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error,
      'Fetch sales summary by client'
    );
    const logInfo = createLogErrorInfo(appError);
    captureException(
      appError,
      'SalesSummaryAPI.GET',
      { duration, logMessage: logInfo.message },
      ErrorSeverity.HIGH
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}

export const GET = withSentryRoute(withAuthRoute(getHandler));
