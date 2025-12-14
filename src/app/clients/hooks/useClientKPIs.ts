import { useEffect, useState, useCallback, useRef } from 'react';
import { Client, SalesHistory } from '@/types';
import { useErrorHandler } from '@/contexts/ToastContext';
import { getMostRecentDate } from '@/utils/dateParsing';

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
  const [salesByClient, setSalesByClient] = useState<
    Map<string, SalesHistory[]>
  >(new Map());
  const hasFetchedRef = useRef(false);

  // Fetch all sales history and group by client_id
  const fetchSalesHistory = useCallback(async () => {
    // Prevent duplicate fetches
    if (hasFetchedRef.current) {
      return;
    }

    try {
      setLoading(true);
      hasFetchedRef.current = true;

      // Fetch all sales (up to 10k limit for KPI calculation)
      const response = await fetch('/api/sales?page=1&pageSize=10000');
      const result = await response.json();

      if (!response.ok) {
        throw result.error || new Error('Failed to fetch sales history');
      }

      const sales = (result.data || []) as SalesHistory[];

      // Group sales by client_id
      const grouped = new Map<string, SalesHistory[]>();
      sales.forEach(sale => {
        if (sale.client_id) {
          const existing = grouped.get(sale.client_id) || [];
          existing.push(sale);
          grouped.set(sale.client_id, existing);
        }
      });

      setSalesByClient(grouped);
    } catch (error) {
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
      const clientSales = salesByClient.get(client.id) || [];
      clientSales.forEach(sale => {
        // Only count positive sales (completed purchases)
        if (sale.sale_price > 0) {
          totalSpend += sale.sale_price;
          totalPurchases += 1;
          allPurchaseDates.push(sale.sale_date);
        }
      });
    });

    const avgSpendPerCustomer =
      totalCustomers > 0 ? totalSpend / totalCustomers : 0;
    const mostRecentPurchase = getMostRecentDate(allPurchaseDates) || 'N/A';

    return {
      totalCustomers,
      totalSpend,
      avgSpendPerCustomer,
      totalPurchases,
      mostRecentPurchase,
      loading,
    };
  }, [clients, salesByClient, loading]);

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

  useEffect(() => {
    if (!clientId) {
      setSales([]);
      return;
    }

    const fetchClientSales = async () => {
      try {
        setLoading(true);
        // ✅ FIXED: Use client_id parameter for server-side filtering (much more efficient)
        const response = await fetch(
          `/api/sales?client_id=${clientId}&page=1&pageSize=200`
        );
        const result = await response.json();

        if (!response.ok) {
          throw result.error || new Error('Failed to fetch client sales');
        }

        // ✅ Server already filtered, no need to filter client-side
        const clientSales = (result.data || []) as SalesHistory[];
        setSales(clientSales);
      } catch (error) {
        handleError(error, 'Failed to fetch client sales');
        setSales([]);
      } finally {
        setLoading(false);
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
    lastPurchaseDate: lastPurchaseDate || 'N/A',
    loading,
  };
}
