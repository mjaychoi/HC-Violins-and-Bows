import { useCallback, useState } from 'react';
import { SalesHistory } from '@/types';
import { useErrorHandler } from '@/hooks/useErrorHandler';

const PAGE_SIZE = 10;

interface FetchOptions {
  fromDate?: string;
  toDate?: string;
  search?: string;
  hasClient?: boolean; // true = has clients, false = no clients, undefined = all
  // FIXED: Make page required (or default to 1) to avoid stale closure issues
  page: number;
  sortColumn?: 'sale_date' | 'sale_price' | 'client_name';
  sortDirection?: 'asc' | 'desc';
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

interface SalesTotals {
  revenue: number;
  refund: number;
  avgTicket: number;
  count: number;
  refundRate: number;
}

export function useSalesHistory() {
  const [sales, setSales] = useState<SalesHistory[]>([]);
  const [page, setPageState] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totals, setTotals] = useState<SalesTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const { handleError } = useErrorHandler();

  const setPage = useCallback((nextPage: number) => {
    setPageState(nextPage);
  }, []);

  // FIXED: Make fetchSales pure - always require page to avoid stale closure issues
  const fetchSales = useCallback(
    async (options: FetchOptions) => {
      setLoading(true);
      setError(null);
      // FIXED: Always use options.page (required parameter) - never use state to avoid stale closure
      const currentPage = options.page;

      try {
        const params = new URLSearchParams();
        params.set('page', currentPage.toString());
        if (options?.fromDate) {
          params.set('fromDate', options.fromDate);
        }
        if (options?.toDate) {
          params.set('toDate', options.toDate);
        }
        if (options?.search) {
          params.set('search', options.search);
        }
        if (options?.hasClient !== undefined) {
          params.set('hasClient', options.hasClient ? 'true' : 'false');
        }
        // client_name은 클라이언트에서만 정렬하므로 서버에 보내지 않음
        if (options?.sortColumn && options.sortColumn !== 'client_name') {
          params.set('sortColumn', options.sortColumn);
        }
        if (options?.sortDirection && options.sortColumn !== 'client_name') {
          params.set('sortDirection', options.sortDirection);
        }

        const response = await fetch(`/api/sales?${params.toString()}`);
        const result = await response.json();

        if (!response.ok) {
          const error = result.error || new Error('Failed to fetch sales');
          setError(error);
          handleError(error, 'Fetch sales history');
          return;
        }

        setSales((result.data || []) as SalesHistory[]);
        if (result.pagination) {
          const pagination = result.pagination as PaginationInfo;
          setTotalCount(pagination.totalCount);
          setTotalPages(pagination.totalPages);
          setPageState(pagination.page);
        } else {
          // Fallback for backward compatibility
          setTotalCount(result.data?.length || 0);
          setTotalPages(Math.max(1, Math.ceil((result.data?.length || 0) / PAGE_SIZE)));
          setPageState(currentPage);
        }
        // Set totals if provided by API (for filtered dataset totals)
        if (result.totals) {
          setTotals(result.totals as SalesTotals);
        } else {
          setTotals(null);
        }
      } catch (err) {
        const appError = handleError(err, 'Fetch sales history');
        setError(appError);
      } finally {
        setLoading(false);
      }
    },
    // FIXED: No need for eslint-disable - page is now required in options, no stale closure
    [handleError]
  );

  const createSale = useCallback(
    async (payload: Omit<SalesHistory, 'id' | 'created_at'>) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/sales', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (!response.ok) {
          const error = result.error || new Error('Failed to create sale');
          setError(error);
          handleError(error, 'Create sale');
          return null;
        }

        // Refresh the first page so the new sale shows up at the top
        await fetchSales({ page: 1 });
        
        // Note: 성공 메시지는 호출하는 컴포넌트에서 표시합니다
        // (Sales 페이지나 다른 페이지에서 showSuccess 호출)
        
        return result.data as SalesHistory;
      } catch (err) {
        const appError = handleError(err, 'Create sale');
        setError(appError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchSales, handleError]
  );

  const refundSale = useCallback(
    async (sale: SalesHistory, note?: string) => {
      const newPrice = sale.sale_price > 0 ? -sale.sale_price : sale.sale_price;
      const mergedNote = note
        ? `${note}${sale.notes ? ` | ${sale.notes}` : ''}`
        : sale.notes;

      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/sales', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: sale.id,
            sale_price: newPrice,
            notes: mergedNote,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          const error = result.error || new Error('Failed to refund sale');
          setError(error);
          handleError(error, 'Refund sale');
          return null;
        }

        // Note: Caller should refresh data with current filters to update KPI totals
        // await fetchSales({ page: page });
        return result.data as SalesHistory;
      } catch (err) {
        const appError = handleError(err, 'Refund sale');
        setError(appError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [handleError]
  );

  // 환불 취소 (Undo Refund)
  const undoRefund = useCallback(
    async (sale: SalesHistory, note?: string) => {
      // 이미 환불되지 않은 경우 처리하지 않음 (0원 거래도 환불 취소 불가)
      if (sale.sale_price > 0 || sale.sale_price === 0) {
        return null;
      }

      // 원래 가격으로 복원 (양수로 변경)
      const originalPrice = Math.abs(sale.sale_price);
      const mergedNote = note
        ? `${note}${sale.notes ? ` | ${sale.notes}` : ''}`
        : sale.notes;

      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/sales', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: sale.id,
            sale_price: originalPrice,
            notes: mergedNote,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          const error = result.error || new Error('Failed to undo refund');
          setError(error);
          handleError(error, 'Undo refund');
          return null;
        }

        // Note: Caller should refresh data with current filters to update KPI totals
        // await fetchSales({ page: page });
        return result.data as SalesHistory;
      } catch (err) {
        const appError = handleError(err, 'Undo refund');
        setError(appError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [handleError]
  );

  // Note: 초기 fetch는 SalesPage에서 관리합니다.
  // 이렇게 하면 필터/정렬 상태와 함께 한 번만 호출되어 이중 호출을 방지합니다.

  return {
    sales,
    page,
    totalCount,
    totalPages,
    totals,
    pageSize: PAGE_SIZE,
    loading,
    error,
    fetchSales,
    setPage,
    createSale,
    refundSale,
    undoRefund,
  };
}
