import { NextRequest } from 'next/server';
import { errorHandler } from '@/utils/errorHandler';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import {
  requireAdmin,
  requireOrgContext,
} from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import { validateDateString } from '@/utils/inputValidation';

/**
 * Client sales summary aggregation endpoint.
 * Returns aggregated sales data grouped by client_id.
 * This reduces data transfer compared to fetching all sales records.
 */
export interface ClientSalesSummary {
  client_id: string;
  total_spend: number;
  purchase_count: number;
  last_purchase_date: string | null;
  first_purchase_date: string | null;
}

type SalesSummaryQuery = {
  eq: (column: string, value: string) => SalesSummaryQuery;
  gte: (column: string, value: string) => SalesSummaryQuery;
  lte: (column: string, value: string) => SalesSummaryQuery;
  not: (column: string, operator: string, value: null) => SalesSummaryQuery;
};

type SalesSummaryFilters = {
  orgId: string;
  fromDate?: string;
  toDate?: string;
};

function parseDateFilters(
  fromDate?: string,
  toDate?: string
):
  | { ok: true; filters: { fromDate?: string; toDate?: string } }
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
    filters: {
      fromDate,
      toDate,
    },
  };
}

function applySalesSummaryFilters<T>(query: T, filters: SalesSummaryFilters) {
  let scopedQuery = (query as T & SalesSummaryQuery)
    .eq('org_id', filters.orgId)
    .not('client_id', 'is', null);

  if (filters.fromDate) {
    scopedQuery = scopedQuery.gte('sale_date', filters.fromDate);
  }

  if (filters.toDate) {
    scopedQuery = scopedQuery.lte('sale_date', filters.toDate);
  }

  return scopedQuery as T;
}

function readMoney(value: unknown): number {
  const numberValue = Number(value ?? 0);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return 0;
  }

  return Math.round(numberValue * 100) / 100;
}

function readCount(value: unknown): number {
  const numberValue = Number(value ?? 0);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return 0;
  }

  return Math.trunc(numberValue);
}

function normalizeSalesSummaryRow(
  row: Record<string, unknown>
): ClientSalesSummary | null {
  const clientId = typeof row.client_id === 'string' ? row.client_id : '';

  if (!clientId) {
    return null;
  }

  return {
    client_id: clientId,
    total_spend: readMoney(row.total_spend),
    purchase_count: readCount(row.purchase_count),
    last_purchase_date:
      typeof row.last_purchase_date === 'string'
        ? row.last_purchase_date
        : null,
    first_purchase_date:
      typeof row.first_purchase_date === 'string'
        ? row.first_purchase_date
        : null,
  };
}

async function getHandler(request: NextRequest, auth: AuthContext) {
  const searchParams = request.nextUrl.searchParams;
  const fromDate = searchParams.get('fromDate') || undefined;
  const toDate = searchParams.get('toDate') || undefined;

  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'SalesSummaryAPI',
      context: 'SalesSummaryAPI',
      metadata: { fromDate, toDate },
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
          payload: { error: 'Admin role required', success: false },
          status: 403,
        };
      }

      const dateFilters = parseDateFilters(fromDate, toDate);
      if (!dateFilters.ok) {
        return dateFilters;
      }

      const filters: SalesSummaryFilters = {
        orgId: auth.orgId!,
        ...dateFilters.filters,
      };

      const aggregateQuery = applySalesSummaryFilters(
        auth.userSupabase
          .from('sales_history')
          .select(
            [
              'client_id',
              'total_spend:sale_price.sum()',
              'purchase_count:client_id.count()',
              'last_purchase_date:sale_date.max()',
              'first_purchase_date:sale_date.min()',
            ].join(', ')
          ),
        filters
      );

      const { data, error } = await aggregateQuery;

      if (error) {
        throw errorHandler.handleSupabaseError(
          error,
          'Fetch sales summary by client'
        );
      }

      const countQuery = applySalesSummaryFilters(
        auth.userSupabase
          .from('sales_history')
          .select('id', { count: 'exact', head: true }),
        filters
      );

      const { count, error: countError } = await countQuery;

      if (countError) {
        throw errorHandler.handleSupabaseError(
          countError,
          'Count sales summary source rows'
        );
      }

      const rawRows = Array.isArray(data)
        ? (data as unknown as Array<Record<string, unknown>>)
        : [];

      const summaries = rawRows
        .map(normalizeSalesSummaryRow)
        .filter((summary): summary is ClientSalesSummary => Boolean(summary));

      const droppedRows = rawRows.length - summaries.length;
      return {
        payload: {
          data: summaries,
          count: summaries.length,
          totalSales: count || 0,
          droppedRows,
          success: true,
        },
        metadata: {
          clientCount: summaries.length,
          totalSales: count || 0,
          droppedRows,
          fromDate,
          toDate,
          scope: {
            enforced: true,
            orgId: auth.orgId,
          },
        },
      };
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));
