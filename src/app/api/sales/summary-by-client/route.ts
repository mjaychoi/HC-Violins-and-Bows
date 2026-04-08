import { NextRequest } from 'next/server';
import { errorHandler } from '@/utils/errorHandler';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { requireOrgContext } from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
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

type SalesSummaryQuery = {
  eq: (column: string, value: string) => SalesSummaryQuery;
  gte: (column: string, value: string) => SalesSummaryQuery;
  lte: (column: string, value: string) => SalesSummaryQuery;
  not: (column: string, operator: string, value: null) => SalesSummaryQuery;
};

function applySalesSummaryFilters<T>(
  query: T,
  filters: {
    orgId: string;
    fromDate?: string;
    toDate?: string;
  }
) {
  let scopedQuery = (query as T & SalesSummaryQuery)
    .eq('org_id', filters.orgId)
    .not('client_id', 'is', null);

  if (filters.fromDate && validateDateString(filters.fromDate)) {
    scopedQuery = scopedQuery.gte('sale_date', filters.fromDate);
  }

  if (filters.toDate && validateDateString(filters.toDate)) {
    scopedQuery = scopedQuery.lte('sale_date', filters.toDate);
  }

  return scopedQuery as T;
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
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

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
        {
          orgId: auth.orgId!,
          fromDate,
          toDate,
        }
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
        {
          orgId: auth.orgId!,
          fromDate,
          toDate,
        }
      );

      const { count, error: countError } = await countQuery;

      if (countError) {
        throw errorHandler.handleSupabaseError(
          countError,
          'Count sales summary source rows'
        );
      }

      const summaries = (
        (data ?? []) as unknown as Array<Record<string, unknown>>
      ).map(row => ({
        client_id: String(row.client_id ?? ''),
        total_spend: Number(row.total_spend ?? 0),
        purchase_count: Number(row.purchase_count ?? 0),
        last_purchase_date:
          typeof row.last_purchase_date === 'string'
            ? row.last_purchase_date
            : null,
        first_purchase_date:
          typeof row.first_purchase_date === 'string'
            ? row.first_purchase_date
            : null,
      }));

      return {
        payload: {
          data: summaries,
          count: summaries.length,
          totalSales: count || 0,
        },
        metadata: {
          clientCount: summaries.length,
          totalSales: count || 0,
        },
      };
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));
