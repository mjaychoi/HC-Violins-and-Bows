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
import { assertClientsSchemaReadiness } from '@/app/api/_utils/schemaReadiness';
import { searchRateLimit, applyRateLimit } from '@/app/api/_utils/rateLimit';
import { validateDateString } from '@/utils/inputValidation';

/**
 * Organization-scoped clients analytics summary.
 *
 * Metric definitions (organization-wide unless date filters applied):
 * - customerCount: distinct clients in org (clients table count)
 * - clientsWithPurchases: distinct non-null client_id in sales_history
 * - totalSpend: sum(sale_price) for sales with non-null client_id
 * - purchaseCount: count of sales_history rows with non-null client_id
 * - avgSpendPerCustomer: totalSpend / max(clientsWithPurchases, 1) when
 *   clientsWithPurchases > 0, else 0 (never NaN/Infinity)
 * - mostRecentPurchaseDate: max(sale_date) among scoped sales
 *
 * Sales with null client_id are excluded. Refunded/cancelled rows are included
 * if present in sales_history (no status column filter — matches summary-by-client).
 * Currency: amounts are treated as the org's default currency with no conversion.
 * Date bounds use sale_date (YYYY-MM-DD) in the database's stored calendar dates
 * (no timezone conversion).
 */
export type ClientsAnalyticsSummary = {
  customerCount: number;
  clientsWithPurchases: number;
  totalSpend: number;
  purchaseCount: number;
  avgSpendPerCustomer: number;
  mostRecentPurchaseDate: string | null;
  scope: 'organization';
  fromDate: string | null;
  toDate: string | null;
};

function readMoney(value: unknown): number {
  const numberValue = Number(value ?? 0);
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
  return Math.round(numberValue * 100) / 100;
}

function readCount(value: unknown): number {
  const numberValue = Number(value ?? 0);
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
  return Math.trunc(numberValue);
}

async function getHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'ClientsAnalyticsAPI',
      context: 'ClientsAnalyticsAPI',
    },
    async () => {
      const orgError = requireOrgContext(auth);
      if (orgError) {
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

      const { limited } = await applyRateLimit(searchRateLimit, auth.user.id);
      if (limited) {
        return {
          payload: { error: 'Too many requests', success: false },
          status: 429,
        };
      }

      await assertClientsSchemaReadiness({ supabase: auth.userSupabase });

      const sp = request.nextUrl.searchParams;
      const fromDate = sp.get('fromDate') || undefined;
      const toDate = sp.get('toDate') || undefined;

      if (fromDate && !validateDateString(fromDate)) {
        return {
          payload: {
            error: `Invalid fromDate. Expected YYYY-MM-DD, received: ${fromDate}`,
            success: false,
          },
          status: 400,
        };
      }
      if (toDate && !validateDateString(toDate)) {
        return {
          payload: {
            error: `Invalid toDate. Expected YYYY-MM-DD, received: ${toDate}`,
            success: false,
          },
          status: 400,
        };
      }
      if (fromDate && toDate && fromDate > toDate) {
        return {
          payload: {
            error: 'fromDate cannot be after toDate',
            success: false,
          },
          status: 400,
        };
      }

      const orgId = auth.orgId!;

      const clientsCountQuery = auth.userSupabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId);

      const { count: customerCount, error: clientsError } =
        await clientsCountQuery;

      if (clientsError) {
        throw errorHandler.handleSupabaseError(
          clientsError,
          'Count clients for analytics'
        );
      }

      // sale_price is no longer a directly-selectable column for the
      // shared authenticated role (see
      // supabase/migrations/20260814160000_enforce_financial_confidentiality_db_boundary.sql),
      // so this aggregate (exclude null client_id so orphans do not inflate
      // spend) is computed by the admin-only get_client_purchase_aggregate()
      // RPC instead of a raw PostgREST aggregate select.
      const { data: salesAggRows, error: salesError } =
        await auth.userSupabase.rpc('get_client_purchase_aggregate', {
          p_from_date: fromDate ?? null,
          p_to_date: toDate ?? null,
        });

      if (salesError) {
        throw errorHandler.handleSupabaseError(
          salesError,
          'Aggregate sales for clients analytics'
        );
      }

      const salesAgg = salesAggRows?.[0];

      // Distinct purchasing clients (avoids join inflation)
      let distinctQuery = auth.userSupabase
        .from('sales_history')
        .select('client_id')
        .eq('org_id', orgId)
        .not('client_id', 'is', null);

      if (fromDate) distinctQuery = distinctQuery.gte('sale_date', fromDate);
      if (toDate) distinctQuery = distinctQuery.lte('sale_date', toDate);

      const { data: distinctRows, error: distinctError } = await distinctQuery;

      if (distinctError) {
        throw errorHandler.handleSupabaseError(
          distinctError,
          'Distinct purchasing clients'
        );
      }

      const clientsWithPurchases = new Set(
        (distinctRows ?? [])
          .map(row =>
            row && typeof row === 'object' && 'client_id' in row
              ? String((row as { client_id: string }).client_id)
              : ''
          )
          .filter(Boolean)
      ).size;

      const totalSpend = readMoney(
        salesAgg && typeof salesAgg === 'object'
          ? (salesAgg as { total_spend?: unknown }).total_spend
          : 0
      );
      const purchaseCount = readCount(
        salesAgg && typeof salesAgg === 'object'
          ? (salesAgg as { purchase_count?: unknown }).purchase_count
          : 0
      );
      const mostRecentRaw =
        salesAgg && typeof salesAgg === 'object'
          ? (salesAgg as { most_recent?: unknown }).most_recent
          : null;
      const mostRecentPurchaseDate =
        typeof mostRecentRaw === 'string' && mostRecentRaw
          ? mostRecentRaw.slice(0, 10)
          : null;

      const avgSpendPerCustomer =
        clientsWithPurchases > 0
          ? Math.round((totalSpend / clientsWithPurchases) * 100) / 100
          : 0;

      const summary: ClientsAnalyticsSummary = {
        customerCount: customerCount ?? 0,
        clientsWithPurchases,
        totalSpend,
        purchaseCount,
        avgSpendPerCustomer,
        mostRecentPurchaseDate,
        scope: 'organization',
        fromDate: fromDate ?? null,
        toDate: toDate ?? null,
      };

      return {
        payload: {
          data: summary,
          complete: true,
        },
      };
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));
