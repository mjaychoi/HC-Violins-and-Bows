'use client';

import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
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
import {
  SalesSummary,
  SalesFilters,
  SalesTable,
  SalesInsights,
  SalesAlerts,
} from './components';
import dynamic from 'next/dynamic';

// Dynamic import for SalesCharts to reduce initial bundle size (recharts is large)
const SalesCharts = dynamic(() => import('./components/SalesCharts'), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-200">
      <CardSkeleton count={1} />
    </div>
  ),
});
import { Pagination } from '@/components/common';
import {
  calculateTotals,
  formatPeriodInfo,
  generateCSV,
  generateReceiptEmail,
  createMaps,
  enrichSales,
  sortByClientName,
} from './utils/salesUtils';
import { currency, dateFormat } from './utils/salesFormatters';
import { SaleStatus } from './types';

export default function SalesPage() {
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

  // 필터 변경 시 page를 1로 리셋 (API 호출은 하지 않음)
  const prevFiltersRef = useRef({ from, to, search, hasClient, sortColumn, sortDirection });
  useEffect(() => {
    const prevFilters = prevFiltersRef.current;
    const filtersChanged =
      prevFilters.from !== from ||
      prevFilters.to !== to ||
      prevFilters.search !== search ||
      prevFilters.hasClient !== hasClient ||
      prevFilters.sortColumn !== sortColumn ||
      prevFilters.sortDirection !== sortDirection;

    if (filtersChanged && page !== 1) {
      setPage(1);
    }
    prevFiltersRef.current = { from, to, search, hasClient, sortColumn, sortDirection };
  }, [from, to, search, hasClient, sortColumn, sortDirection, page, setPage]);

  // 초기 로드 및 필터/페이지/정렬 변경 시 API 호출
  useEffect(() => {
    fetchSales({
      fromDate: from || undefined,
      toDate: to || undefined,
      page,
      search: search || undefined,
      hasClient: hasClient !== null ? hasClient : undefined,
      sortColumn: sortColumn === 'client_name' ? undefined : sortColumn, // client_name은 클라이언트에서만 처리
      sortDirection,
    });
  }, [
    from,
    to,
    page,
    search,
    hasClient,
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
  const periodInfo = useMemo(() => formatPeriodInfo(from, to), [from, to]);

  const handleSendReceipt = useCallback(
    (sale: EnrichedSale) => {
      const email = sale.client?.email;
      if (!email) {
        handleError(
          new Error('No customer email available for this sale.'),
          'Send receipt'
        );
        return;
      }

      const { subject, body } = generateReceiptEmail(
        sale,
        dateFormat,
        currency
      );
      window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
      showSuccess('Receipt email opened in your email client.');
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

  const handleExportCSV = useCallback(async () => {
    try {
      // Show loading indicator
      showSuccess('Exporting CSV...');

      // Export 모드로 전체 데이터를 한 번에 가져오기
      const params = new URLSearchParams();
      params.set('export', 'true'); // Export 모드 활성화
      params.set('page', '1');
      params.set('pageSize', '10000'); // 최대 10000개까지
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

      // Generate CSV
      const csvContent = generateCSV(enrichedAllSales, dateFormat, currency);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      // FIXED: Use todayLocalYMD for consistent date format in filename
      const { todayLocalYMD } = await import('@/utils/dateParsing');
      link.setAttribute('download', `sales-history-${todayLocalYMD()}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showSuccess(`Exported ${enrichedAllSales.length} sales to CSV`);
    } catch (error) {
      handleError(error, 'Export CSV');
    }
  }, [
    from,
    to,
    search,
    hasClient,
    sortColumn,
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

            <SalesSummary totals={totals} period={periodInfo} />

            {/* Filters & Search - KPI 아래로 이동 */}
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
              hasData={enrichedSales.length > 0}
            />

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
