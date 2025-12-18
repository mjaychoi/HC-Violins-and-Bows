'use client';

import {
  useEffect,
  useMemo,
  useCallback,
  useState,
  useRef,
  Suspense,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { AppLayout } from '@/components/layout';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import {
  useUnifiedClients,
  useUnifiedInstruments,
} from '@/hooks/useUnifiedData';
import {
  ErrorBoundary,
  TableSkeleton,
  CardSkeleton,
  ConfirmDialog,
} from '@/components/common';
import { SalesHistory, EnrichedSale } from '@/types';
import {
  useSalesHistory,
  useSalesFilters,
  useSalesSort,
  useEnrichedSales,
} from './hooks';
import dynamic from 'next/dynamic';

// Dynamic imports for large components to reduce initial bundle size
const SalesCharts = dynamic(() => import('./components/SalesCharts'), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-200">
      <CardSkeleton count={1} />
    </div>
  ),
});

const SalesInsights = dynamic(() => import('./components/SalesInsights'), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-200">
      <CardSkeleton count={1} />
    </div>
  ),
});

const SalesAlerts = dynamic(() => import('./components/SalesAlerts'), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-200">
      <CardSkeleton count={1} />
    </div>
  ),
});

// Dynamic import for SalesTable (264 lines) - loaded when table is visible
const SalesTable = dynamic(() => import('./components/SalesTable'), {
  ssr: false,
  loading: () => (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
      <TableSkeleton rows={10} columns={7} />
    </div>
  ),
});

// Dynamic import for SaleForm (451 lines) - modal, loaded when needed
// TODO: SaleForm is currently unused but may be needed for future sale creation functionality
// const SaleForm = dynamic(() => import('./components/SaleForm'), {
//   ssr: false,
// });

// Dynamic import for SalesSummary (215 lines) - KPI cards, can be lazy loaded
const SalesSummary = dynamic(() => import('./components/SalesSummary'), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {[1, 2, 3, 4].map(i => (
        <div
          key={i}
          className="bg-white border border-gray-200 rounded-lg shadow-sm p-4"
        >
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          </div>
        </div>
      ))}
    </div>
  ),
});

// Dynamic import for SalesFilters (251 lines) - loaded when filters are shown
const SalesFilters = dynamic(() => import('./components/SalesFilters'), {
  ssr: false,
});
import { Pagination } from '@/components/common';
import {
  calculateTotals,
  formatPeriodInfo,
  createMaps,
  enrichSales,
  sortByClientName,
} from './utils/salesUtils';
// Large utility functions loaded on demand
// generateCSV and generateReceiptEmail are imported dynamically when needed
import { currency, dateFormat } from './utils/salesFormatters';
import { SaleStatus } from './types';

// Component that uses useSearchParams - must be wrapped in Suspense
function SalesPageContent() {
  const searchParams = useSearchParams();
  const instrumentIdFromUrl = searchParams.get('instrumentId') || undefined;

  const {
    sales,
    page,
    totalCount,
    totalPages,
    totals: apiTotals,
    loading,
    fetchSales,
    setPage,
    refundSale,
    undoRefund,
  } = useSalesHistory();
  const { showSuccess, handleError } = useAppFeedback();

  // Confirmation dialog state
  const [confirmRefundSale, setConfirmRefundSale] =
    useState<SalesHistory | null>(null);
  const [confirmUndoRefundSale, setConfirmUndoRefundSale] =
    useState<SalesHistory | null>(null);

  // FIXED: useUnifiedData is now called at root layout level
  // No need to call it here - data is already fetched

  const { clients } = useUnifiedClients();
  const { instruments } = useUnifiedInstruments();

  const {
    showFilters,
    setShowFilters,
    from,
    setFrom,
    to,
    setTo,
    search,
    setSearch,
    hasClient,
    sortColumn,
    setSortColumn,
    sortDirection,
    setSortDirection,
    handleDatePreset,
    clearFilters,
  } = useSalesFilters();

  const { handleSort, getSortArrow } = useSalesSort(
    sortColumn,
    sortDirection,
    setSortColumn,
    setSortDirection
  );

  // FIXED: Removed search parameter - server handles filtering, client only enriches + sorts
  // FIXED: Removed search parameter - server handles filtering, client only enriches + sorts
  const enrichedSales = useEnrichedSales(
    sales,
    clients,
    instruments,
    sortColumn,
    sortDirection
  );

  // 필터 변경 추적 (page reset과 fetch 중복 방지용)
  const prevFiltersRef = useRef({
    from,
    to,
    search,
    hasClient,
    sortColumn,
    sortDirection,
  });
  const filtersChangedRef = useRef(false);

  // 필터 변경 감지 및 page 리셋
  useEffect(() => {
    const prevFilters = prevFiltersRef.current;
    const filtersChanged =
      prevFilters.from !== from ||
      prevFilters.to !== to ||
      prevFilters.search !== search ||
      prevFilters.hasClient !== hasClient ||
      prevFilters.sortColumn !== sortColumn ||
      prevFilters.sortDirection !== sortDirection;

    filtersChangedRef.current = filtersChanged;

    if (filtersChanged && page !== 1) {
      setPage(1);
    }
    prevFiltersRef.current = {
      from,
      to,
      search,
      hasClient,
      sortColumn,
      sortDirection,
    };
  }, [from, to, search, hasClient, sortColumn, sortDirection, page, setPage]);

  // 초기 로드 및 필터/페이지/정렬 변경 시 API 호출
  // FIXED: 필터 변경 시 page !== 1이면 fetch를 건너뛰고 page=1로만 맞춘 뒤 다음 render에서 fetch
  useEffect(() => {
    // 필터가 변경되었고 page가 아직 1이 아니면 fetch 건너뛰기
    if (filtersChangedRef.current && page !== 1) {
      return;
    }
    // page가 1로 리셋된 후에는 filtersChanged 플래그를 리셋
    if (filtersChangedRef.current && page === 1) {
      filtersChangedRef.current = false;
    }

    fetchSales({
      fromDate: from || undefined,
      toDate: to || undefined,
      page,
      search: search || undefined,
      hasClient: hasClient !== null ? hasClient : undefined,
      instrumentId: instrumentIdFromUrl,
      sortColumn: sortColumn === 'client_name' ? undefined : sortColumn, // client_name은 클라이언트에서만 처리
      sortDirection,
    });
  }, [
    from,
    to,
    page,
    search,
    hasClient,
    instrumentIdFromUrl,
    sortColumn,
    sortDirection,
    fetchSales,
  ]);

  // 데이터 로드 후 스크롤 위치 복원 (필터 변경 시)
  // SSR 안전성: useEffect는 클라이언트에서만 실행되지만, 명시적 가드 추가
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!loading) {
      const savedScrollPosition = sessionStorage.getItem('salesScrollPosition');
      if (savedScrollPosition) {
        requestAnimationFrame(() => {
          window.scrollTo(0, parseInt(savedScrollPosition, 10));
          sessionStorage.removeItem('salesScrollPosition');
        });
      }
    }
  }, [loading]);

  // API에서 제공된 전체 totals 사용 (필터링된 전체 데이터 기준)
  // API totals가 없으면 현재 페이지 데이터로 fallback
  const totals = useMemo(() => {
    if (apiTotals) {
      return apiTotals;
    }
    return calculateTotals(enrichedSales);
  }, [apiTotals, enrichedSales]);

  // Calculate actual date range from sales data (for "All time" display)
  const actualDateRange = useMemo(() => {
    if (enrichedSales.length === 0) return { from: undefined, to: undefined };
    const dates = enrichedSales.map(sale => sale.sale_date).sort();
    return {
      from: dates[0],
      to: dates[dates.length - 1],
    };
  }, [enrichedSales]);

  const periodInfo = useMemo(
    () => formatPeriodInfo(from, to, actualDateRange.from, actualDateRange.to),
    [from, to, actualDateRange.from, actualDateRange.to]
  );

  const handleSendReceipt = useCallback(
    async (sale: EnrichedSale) => {
      const email = sale.client?.email;
      if (!email) {
        handleError(
          new Error('No customer email available for this sale.'),
          'Send receipt'
        );
        return;
      }

      try {
        // Dynamic import for large utility function
        const { generateReceiptEmail } = await import('./utils/salesUtils');
        const { subject, body } = generateReceiptEmail(
          sale,
          dateFormat,
          currency
        );
        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        showSuccess('Receipt email opened in your email client.');
      } catch (error) {
        handleError(error, 'Send Receipt');
      }
    },
    [handleError, showSuccess]
    // dateFormat and currency are constants, not dependencies
  );

  // Request refund (shows confirmation dialog)
  const handleRequestRefund = useCallback((sale: SalesHistory) => {
    setConfirmRefundSale(sale);
  }, []);

  // Confirm refund
  const handleConfirmRefund = useCallback(async () => {
    if (!confirmRefundSale) return;
    const note = `Refund issued on ${new Date().toISOString()}`;
    const updated = await refundSale(confirmRefundSale, note);
    if (updated) {
      showSuccess('Sale marked as refunded.');
      setConfirmRefundSale(null);
      // FIXED: Refresh with current filters to update KPI totals
      await fetchSales({
        fromDate: from || undefined,
        toDate: to || undefined,
        page,
        search: search || undefined,
        hasClient: hasClient !== null ? hasClient : undefined,
        sortColumn: sortColumn === 'client_name' ? undefined : sortColumn,
        sortDirection,
      });
    }
  }, [
    confirmRefundSale,
    refundSale,
    showSuccess,
    fetchSales,
    from,
    to,
    page,
    search,
    hasClient,
    sortColumn,
    sortDirection,
  ]);

  // Request undo refund (shows confirmation dialog)
  const handleRequestUndoRefund = useCallback((sale: SalesHistory) => {
    setConfirmUndoRefundSale(sale);
  }, []);

  // Confirm undo refund
  const handleConfirmUndoRefund = useCallback(async () => {
    if (!confirmUndoRefundSale) return;
    const note = `Refund undone on ${new Date().toISOString()}`;
    const updated = await undoRefund(confirmUndoRefundSale, note);
    if (updated) {
      showSuccess('Refund has been undone.');
      setConfirmUndoRefundSale(null);
      // FIXED: Refresh with current filters to update KPI totals
      await fetchSales({
        fromDate: from || undefined,
        toDate: to || undefined,
        page,
        search: search || undefined,
        hasClient: hasClient !== null ? hasClient : undefined,
        sortColumn: sortColumn === 'client_name' ? undefined : sortColumn,
        sortDirection,
      });
    }
  }, [
    confirmUndoRefundSale,
    undoRefund,
    showSuccess,
    fetchSales,
    from,
    to,
    page,
    search,
    hasClient,
    sortColumn,
    sortDirection,
  ]);

  const statusForSale = useCallback(
    (sale: EnrichedSale): SaleStatus =>
      sale.sale_price < 0 ? 'Refunded' : 'Paid',
    []
  );

  // 인라인 편집용 sale 업데이트 핸들러
  const handleUpdateSale = useCallback(
    async (id: string, data: { sale_price?: number }) => {
      try {
        const response = await fetch('/api/sales', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id,
            sale_price: data.sale_price,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update sale');
        }

        showSuccess('Sale updated successfully.');
        // 데이터 새로고침
        await fetchSales({
          fromDate: from || undefined,
          toDate: to || undefined,
          page,
          search: search || undefined,
          hasClient: hasClient !== null ? hasClient : undefined,
          sortColumn: sortColumn === 'client_name' ? undefined : sortColumn,
          sortDirection,
        });
      } catch (error) {
        handleError(error, 'Update sale');
        throw error; // 인라인 편집 훅에서 에러 처리하도록
      }
    },
    [
      showSuccess,
      handleError,
      fetchSales,
      from,
      to,
      page,
      search,
      hasClient,
      sortColumn,
      sortDirection,
    ]
  );

  // Export CSV loading state
  const [isExportingCSV, setIsExportingCSV] = useState(false);

  const handleExportCSV = useCallback(async () => {
    if (isExportingCSV) return; // Prevent duplicate exports
    setIsExportingCSV(true);
    try {
      // Export 모드로 전체 데이터를 한 번에 가져오기
      // FIXED: pageSize를 5000으로 제한 (서버 타임아웃/메모리 방지)
      const params = new URLSearchParams();
      params.set('export', 'true'); // Export 모드 활성화
      params.set('page', '1');
      params.set('pageSize', '5000'); // 최대 5000개까지 (안전한 제한)
      if (from) {
        params.set('fromDate', from);
      }
      if (to) {
        params.set('toDate', to);
      }
      if (search) {
        params.set('search', search);
      }
      if (hasClient !== null) {
        params.set('hasClient', hasClient ? 'true' : 'false');
      }
      // client_name은 클라이언트에서만 정렬하므로 서버에 보내지 않음
      // 서버 정렬을 위해 다른 정렬 옵션만 전송
      if (sortColumn && sortColumn !== 'client_name') {
        params.set('sortColumn', sortColumn);
        if (sortDirection) {
          params.set('sortDirection', sortDirection);
        }
      }

      const response = await fetch(`/api/sales?${params.toString()}`);
      const result = await response.json();

      if (!response.ok) {
        handleError(
          new Error(result.error || 'Failed to export CSV'),
          'Export CSV'
        );
        return;
      }

      const allSales = (result.data || []) as SalesHistory[];

      // Enrich all sales data
      const { clientMap, instrumentMap } = createMaps(clients, instruments);
      let enrichedAllSales = enrichSales(allSales, clientMap, instrumentMap);

      // Apply client-side sorting for client_name (server cannot sort by client name)
      if (sortColumn === 'client_name' && sortDirection) {
        enrichedAllSales = sortByClientName(enrichedAllSales, sortDirection);
      }

      // Generate CSV - dynamic import for large function
      const { generateCSV } = await import('./utils/salesUtils');
      const csvContent = generateCSV(enrichedAllSales, dateFormat, currency);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      // FIXED: Include date range in filename if filters are applied
      const { todayLocalYMD } = await import('@/utils/dateParsing');
      let filename = 'sales-history';
      if (from && to) {
        // Format dates for filename (remove dashes for cleaner filename)
        const fromDate = from.replace(/-/g, '');
        const toDate = to.replace(/-/g, '');
        filename = `sales-history-${fromDate}-${toDate}`;
      } else if (from) {
        const fromDate = from.replace(/-/g, '');
        filename = `sales-history-${fromDate}`;
      } else if (to) {
        const toDate = to.replace(/-/g, '');
        filename = `sales-history-${toDate}`;
      } else {
        filename = `sales-history-${todayLocalYMD().replace(/-/g, '')}`;
      }
      link.setAttribute('download', `${filename}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showSuccess(`Exported ${enrichedAllSales.length} sales to CSV`);
    } catch (error) {
      handleError(error, 'Export CSV');
    } finally {
      setIsExportingCSV(false);
    }
  }, [
    from,
    to,
    search,
    hasClient,
    sortColumn,
    isExportingCSV,
    sortDirection,
    clients,
    instruments,
    showSuccess,
    handleError,
  ]);

  return (
    <ErrorBoundary>
      <AppLayout title="Sales">
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={8} columns={7} />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* DataQualityWarning 주석 처리 - Limited Data Available 경고 비활성화 */}
            {/* <DataQualityWarning dataQuality={dataQuality} /> */}

            {/* Filters & Search - KPI 위로 이동 */}
            <SalesFilters
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters(!showFilters)}
              search={search}
              onSearchChange={setSearch}
              from={from}
              onFromChange={setFrom}
              to={to}
              onToChange={setTo}
              onDatePreset={handleDatePreset}
              onClearFilters={clearFilters}
              onExportCSV={handleExportCSV}
              isExportingCSV={isExportingCSV}
              hasData={enrichedSales.length > 0}
            />

            <SalesSummary totals={totals} period={periodInfo} />

            {/* Sales Alerts */}
            {!loading && <SalesAlerts sales={enrichedSales} />}

            {/* Sales Insights */}
            {!loading && (
              <SalesInsights
                sales={enrichedSales}
                fromDate={from || undefined}
                toDate={to || undefined}
              />
            )}

            {/* Sales Charts */}
            {loading ? (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-64 bg-gray-100 rounded"></div>
                </div>
              </div>
            ) : (
              <SalesCharts
                sales={enrichedSales}
                fromDate={from || undefined}
                toDate={to || undefined}
                onDateFilter={(fromDate, toDate) => {
                  setFrom(fromDate);
                  setTo(toDate);
                }}
                onClientFilter={clientId => {
                  const client = clients.find(c => c.id === clientId);
                  if (client) {
                    const clientName =
                      `${client.first_name || ''} ${client.last_name || ''}`.trim() ||
                      client.email ||
                      '';
                    setSearch(clientName);
                  }
                }}
                onInstrumentFilter={instrumentId => {
                  const instrument = instruments.find(
                    i => i.id === instrumentId
                  );
                  if (instrument) {
                    const instrumentInfo =
                      `${instrument.maker || ''} ${instrument.type || ''} ${instrument.subtype || ''}`.trim();
                    setSearch(instrumentInfo);
                  }
                }}
              />
            )}

            {/* Sales Table */}
            <div>
              <SalesTable
                sales={enrichedSales}
                loading={loading}
                onSort={handleSort}
                getSortArrow={getSortArrow}
                onSendReceipt={handleSendReceipt}
                onRefund={handleRequestRefund}
                onUndoRefund={handleRequestUndoRefund}
                statusForSale={statusForSale}
                hasActiveFilters={
                  !!(search || from || to || hasClient !== null)
                }
                onResetFilters={clearFilters}
                onUpdateSale={handleUpdateSale}
              />
              {/* FIXED: filteredCount is now same as totalCount since server handles all filtering */}
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalCount={totalCount}
                filteredCount={totalCount}
                pageSize={10}
                loading={loading}
                hasFilters={!!(search || from || to || hasClient !== null)}
                onPageChange={setPage}
                compact={false}
              />
            </div>
          </div>
        )}

        {/* Refund Confirmation Dialog */}
        <ConfirmDialog
          isOpen={Boolean(confirmRefundSale)}
          title="Issue Refund?"
          message={
            confirmRefundSale ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">
                  Are you sure you want to issue a refund for this sale? This
                  action will mark the sale as refunded and cannot be easily
                  undone.
                </p>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-800 mb-1">
                    Refund Amount:
                  </p>
                  <p className="text-lg font-bold text-red-900">
                    {currency.format(Math.abs(confirmRefundSale.sale_price))}
                  </p>
                </div>
              </div>
            ) : (
              ''
            )
          }
          confirmLabel="Issue Refund"
          cancelLabel="Cancel"
          onConfirm={handleConfirmRefund}
          onCancel={() => setConfirmRefundSale(null)}
        />

        {/* Undo Refund Confirmation Dialog */}
        <ConfirmDialog
          isOpen={Boolean(confirmUndoRefundSale)}
          title="Undo Refund?"
          message={`Are you sure you want to undo the refund for this sale? This will restore the sale to its original paid status.`}
          confirmLabel="Undo Refund"
          cancelLabel="Cancel"
          onConfirm={handleConfirmUndoRefund}
          onCancel={() => setConfirmUndoRefundSale(null)}
        />
      </AppLayout>
    </ErrorBoundary>
  );
}

// Main page component with Suspense boundary
export default function SalesPage() {
  return (
    <Suspense
      fallback={
        <ErrorBoundary>
          <AppLayout title="Sales">
            <div className="p-6">
              <TableSkeleton rows={8} columns={7} />
            </div>
          </AppLayout>
        </ErrorBoundary>
      }
    >
      <SalesPageContent />
    </Suspense>
  );
}
