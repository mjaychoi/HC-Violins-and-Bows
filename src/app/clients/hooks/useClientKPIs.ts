import { useEffect, useState, useCallback, useRef } from 'react';
import { Client, SalesHistory } from '@/types';
import { useErrorHandler } from '@/contexts/ToastContext';
import { getMostRecentDate } from '@/utils/dateParsing';
import { apiFetch } from '@/utils/apiFetch';
import type { ClientSalesSummary } from '@/app/clients/analytics/hooks/useCustomers';

export interface ClientKPIs {
  totalCustomers: number;
  totalSpend: number;
  avgSpendPerCustomer: number;
  totalPurchases: number;
  mostRecentPurchase: string;
  loading: boolean;
}

/**
 * Calculate KPI statistics for all clients
 * This hook fetches sales history and calculates aggregate metrics
 */
export function useClientKPIs(
  clients: Client[],
  opts?: { enabled?: boolean }
): ClientKPIs {
  const enabled = opts?.enabled ?? true;
  const { handleError } = useErrorHandler();
  const [loading, setLoading] = useState(false);
  const [salesSummaryByClient, setSalesSummaryByClient] = useState<
    Map<string, ClientSalesSummary>
  >(new Map());
  const hasFetchedRef = useRef(false);

  // Fetch summarized sales metrics instead of loading the full sales dataset.
  const fetchSalesHistory = useCallback(async () => {
    // Prevent duplicate fetches
    if (hasFetchedRef.current) {
      return;
    }

    try {
      setLoading(true);
      hasFetchedRef.current = true;

      const response = await apiFetch('/api/sales/summary-by-client');
      const result = await response.json();

      if (!response.ok) {
        throw result.error || new Error('Failed to fetch sales summary');
      }

      const summaryData = (result.data || []) as ClientSalesSummary[];
      const summaryMap = new Map<string, ClientSalesSummary>();
      summaryData.forEach(summary => {
        summaryMap.set(summary.client_id, summary);
      });

      setSalesSummaryByClient(summaryMap);
    } catch (error) {
      setSalesSummaryByClient(new Map());
      handleError(error, 'Failed to fetch sales for KPIs');
      // Reset flag on error so it can retry
      hasFetchedRef.current = false;
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  // ✅ Fetch sales history only if enabled and clients exist
  useEffect(() => {
    if (!enabled) return;
    if (clients.length === 0) return;
    fetchSalesHistory();
  }, [enabled, clients.length, fetchSalesHistory]);

  // Calculate KPIs
  const kpis = useCallback((): ClientKPIs => {
    const totalCustomers = clients.length;

    // Calculate total spend and purchase count from sales
    let totalSpend = 0;
    let totalPurchases = 0;
    const allPurchaseDates: string[] = [];

    clients.forEach(client => {
      const summary = salesSummaryByClient.get(client.id);
      if (!summary) return;

      totalSpend += summary.total_spend || 0;
      totalPurchases += summary.purchase_count || 0;
      if (summary.last_purchase_date) {
        allPurchaseDates.push(summary.last_purchase_date);
      }
    });

    const avgSpendPerCustomer =
      totalCustomers > 0 ? totalSpend / totalCustomers : 0;
    const mostRecentPurchase = getMostRecentDate(allPurchaseDates) || '—';

    return {
      totalCustomers,
      totalSpend,
      avgSpendPerCustomer,
      totalPurchases,
      mostRecentPurchase,
      loading,
    };
  }, [clients, salesSummaryByClient, loading]);

  return kpis();
}

/**
 * Get sales data for a specific client
 * Used for row expand functionality
 */
export function useClientSalesData(clientId: string | null) {
  const { handleError } = useErrorHandler();
  const [sales, setSales] = useState<SalesHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<
    'loading' | 'success' | 'empty' | 'error'
  >('empty');
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!clientId) {
      requestIdRef.current += 1;
      setSales([]);
      setStatus('empty');
      setLoading(false);
      return;
    }

    const fetchClientSales = async () => {
      const requestId = ++requestIdRef.current;
      try {
        setSales([]);
        setLoading(true);
        setStatus('loading');
        // ✅ FIXED: Use client_id parameter for server-side filtering (much more efficient)
        // ✅ FIXED: Use apiFetch to include authentication headers
        const response = await apiFetch(
          `/api/sales?client_id=${clientId}&page=1&pageSize=200`
        );
        const result = await response.json();

        if (!response.ok) {
          throw result.error || new Error('Failed to fetch client sales');
        }

        // ✅ Server already filtered, no need to filter client-side
        const clientSales = (result.data || []) as SalesHistory[];
        if (requestId !== requestIdRef.current) {
          return;
        }
        setSales(clientSales);
        setStatus(clientSales.length > 0 ? 'success' : 'empty');
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        handleError(error, 'Failed to fetch client sales');
        setSales([]);
        setStatus('error');
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    };

    fetchClientSales();
  }, [clientId, handleError]);

  // Calculate client-specific metrics
  const totalSpend = sales
    .filter(sale => sale.sale_price > 0)
    .reduce((sum, sale) => sum + sale.sale_price, 0);

  const purchaseCount = sales.filter(sale => sale.sale_price > 0).length;

  const lastPurchaseDate = getMostRecentDate(
    sales.filter(s => s.sale_price > 0).map(s => s.sale_date)
  );

  return {
    totalSpend,
    purchaseCount,
    lastPurchaseDate: lastPurchaseDate || '—',
    loading,
    status,
  };
}
