'use client';

import {
  useEffect,
  useCallback,
  useState,
  useRef,
  useMemo,
  Suspense,
} from 'react';
import { AppLayout } from '@/components/layout';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { ErrorBoundary, ConfirmDialog } from '@/components/common';
import { Invoice } from '@/types';
import type { InvoiceSortColumn, SortDirection } from '@/types/invoice';
import { INVOICE_SORT_COLUMNS } from '@/types/invoice';
import { useInvoices, useInvoiceSort } from './hooks';
import { InvoiceList } from './components';
import InvoiceFilters, {
  type InvoiceFilterStatus,
} from './components/InvoiceFilters';
import { apiFetch } from '@/utils/apiFetch';
import dynamic from 'next/dynamic';
import { useURLState } from '@/hooks/useURLState';
import { useDebounce } from '@/hooks/useDebounce';
import { logError } from '@/utils/logger';
const DEFAULT_SORT_COLUMN: InvoiceSortColumn = 'invoice_date';
const DEFAULT_SORT_DIRECTION = 'desc';
const INVOICE_SORT_COLUMNS_SET = new Set(INVOICE_SORT_COLUMNS);

// Dynamic import for InvoiceModal (modal, loaded when needed)
const InvoiceModalDynamic = dynamic(() => import('./components/InvoiceModal'), {
  ssr: false,
});

// Dynamic import for InvoiceSettingsModal
const InvoiceSettingsModalDynamic = dynamic(
  () => import('./components/InvoiceSettingsModal'),
  {
    ssr: false,
  }
);

function InvoicesPageContent() {
  const {
    invoices,
    page,
    totalCount,
    totalPages,
    loading,
    fetchInvoices,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    setPage,
    scopeInfo,
  } = useInvoices();
  const { showSuccess, handleError } = useAppFeedback();

  const {
    sortColumn,
    sortDirection,
    handleSort,
    getSortState,
    setSortColumn,
    setSortDirection,
  } = useInvoiceSort(
    DEFAULT_SORT_COLUMN,
    DEFAULT_SORT_DIRECTION as SortDirection
  );

  const { urlState, updateURLState } = useURLState({
    enabled: true,
    keys: [
      'search',
      'fromDate',
      'toDate',
      'status',
      'sortColumn',
      'sortDirection',
      'page',
    ],
    paramMapping: {
      search: 'search',
      fromDate: 'from',
      toDate: 'to',
      status: 'status',
      sortColumn: 'sort',
      sortDirection: 'dir',
      page: 'page',
    },
  });

  // Filter states
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [status, setStatus] = useState<InvoiceFilterStatus>('');
  const [isURLSyncReady, setIsURLSyncReady] = useState(false);
  const isSyncingFromURLRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const urlStateInitializedRef = useRef(false);
  const hasFetchedRef = useRef(false);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Invoice settings state (for prefilling form)
  const [invoiceSettings, setInvoiceSettings] = useState<{
    business_name?: string;
    address?: string;
    phone?: string;
    email?: string;
    bank_account_holder?: string;
    bank_name?: string;
    bank_swift_code?: string;
    bank_account_number?: string;
    default_conditions?: string;
    default_exchange_rate?: string;
    default_currency?: string;
  } | null>(null);

  // Confirmation dialog state
  const [confirmDeleteInvoice, setConfirmDeleteInvoice] =
    useState<Invoice | null>(null);

  // 필터 변경 추적
  const prevFiltersRef = useRef({
    fromDate,
    toDate,
    debouncedSearch,
    status,
    sortColumn,
    sortDirection,
    signature: '',
  });
  const filtersChangedRef = useRef(false);

  useEffect(() => {
    // useURLState는 항상 빈 객체 {}를 초기값으로 반환하므로, urlState가 존재하면 초기화된 것
    // urlState가 undefined나 null이 아니면 초기화 완료로 간주
    if (urlState === undefined || urlState === null) {
      return;
    }

    // URL state가 한 번이라도 초기화되었으면 플래그 설정
    if (!urlStateInitializedRef.current) {
      urlStateInitializedRef.current = true;
      // 즉시 초기화 완료 표시하여 fetch가 실행되도록 함
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        setIsURLSyncReady(true);
      }
    }

    const hasUrlState = Object.keys(urlState).length > 0;

    // URL state가 없거나 빈 객체인 경우에도 초기화를 완료하여 fetch가 실행되도록 함
    if (!hasUrlState) {
      // 이미 초기화 완료 표시가 되어 있으면 추가 작업 불필요
      return;
    }

    isSyncingFromURLRef.current = true;

    const nextSearch =
      typeof urlState.search === 'string' ? urlState.search : '';
    const nextFromDate =
      typeof urlState.fromDate === 'string' ? urlState.fromDate : '';
    const nextToDate =
      typeof urlState.toDate === 'string' ? urlState.toDate : '';
    const allowedStatuses = [
      '',
      'draft',
      'sent',
      'paid',
      'overdue',
      'cancelled',
      'void',
    ] as const;
    const nextStatus: InvoiceFilterStatus =
      typeof urlState.status === 'string' &&
      (allowedStatuses as readonly string[]).includes(urlState.status)
        ? (urlState.status as InvoiceFilterStatus)
        : '';

    const nextSortColumn: InvoiceSortColumn =
      typeof urlState.sortColumn === 'string' &&
      INVOICE_SORT_COLUMNS_SET.has(urlState.sortColumn as InvoiceSortColumn)
        ? (urlState.sortColumn as InvoiceSortColumn)
        : DEFAULT_SORT_COLUMN;
    const nextSortDirection =
      urlState.sortDirection === 'asc' || urlState.sortDirection === 'desc'
        ? urlState.sortDirection
        : DEFAULT_SORT_DIRECTION;

    const nextPageRaw = typeof urlState.page === 'string' ? urlState.page : '';
    const parsedPage = Number.parseInt(nextPageRaw, 10);
    const nextPage =
      Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;

    setSearch(nextSearch);
    setFromDate(nextFromDate);
    setToDate(nextToDate);
    setStatus(nextStatus);
    setSortColumn(nextSortColumn);
    setSortDirection(nextSortDirection);
    setPage(nextPage);

    if (!isURLSyncReady) {
      setIsURLSyncReady(true);
    }

    queueMicrotask(() => {
      isSyncingFromURLRef.current = false;
    });
  }, [urlState, setPage, setSortColumn, setSortDirection, isURLSyncReady]);

  const filterSignature = useMemo(
    () =>
      [
        debouncedSearch,
        fromDate,
        toDate,
        status,
        sortColumn,
        sortDirection,
      ].join('|'),
    [debouncedSearch, fromDate, toDate, status, sortColumn, sortDirection]
  );

  // 필터 변경 감지 및 page 리셋
  useEffect(() => {
    if (!isURLSyncReady || isSyncingFromURLRef.current) return;

    const filtersChanged = prevFiltersRef.current.signature !== filterSignature;

    filtersChangedRef.current = filtersChanged;

    if (filtersChanged && page !== 1) {
      setPage(1);
    }
    prevFiltersRef.current = {
      fromDate,
      toDate,
      debouncedSearch,
      status,
      sortColumn,
      sortDirection,
      signature: filterSignature,
    };
  }, [
    fromDate,
    toDate,
    debouncedSearch,
    status,
    sortColumn,
    sortDirection,
    page,
    setPage,
    isURLSyncReady,
    filterSignature,
  ]);

  // 초기 로드 및 필터/페이지/정렬 변경 시 API 호출
  useEffect(() => {
    // 동기화 중이라면 대기
    if (isSyncingFromURLRef.current) return;

    if (filtersChangedRef.current && page !== 1) {
      return;
    }
    if (filtersChangedRef.current && page === 1) {
      filtersChangedRef.current = false;
    }

    const effectivePage = filtersChangedRef.current ? 1 : page;

    // fetch 실행
    hasFetchedRef.current = true;
    fetchInvoices({
      page: effectivePage,
      pageSize: 10,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      search: debouncedSearch || undefined,
      status: status || undefined,
      sortColumn: sortColumn || undefined,
      sortDirection: sortDirection || undefined,
    });

    // fetch 직후에 플래그를 끔
    if (filtersChangedRef.current && effectivePage === 1) {
      filtersChangedRef.current = false;
    }
  }, [
    fromDate,
    toDate,
    page,
    debouncedSearch,
    status,
    sortColumn,
    sortDirection,
    fetchInvoices,
  ]);

  // URL 동기화가 완료되었지만 아직 fetch하지 않은 경우 강제로 fetch (안전장치)
  useEffect(() => {
    if (
      isURLSyncReady &&
      urlStateInitializedRef.current &&
      !isSyncingFromURLRef.current &&
      !hasFetchedRef.current
    ) {
      // 이미 fetch가 실행되었는지 확인하기 위해 약간의 지연 후 확인
      const timeoutId = setTimeout(() => {
        // 이 시점에서 invoices가 비어있고 loading이 false면 fetch가 실행되지 않은 것
        if (invoices.length === 0 && !loading && !hasFetchedRef.current) {
          hasFetchedRef.current = true;
          fetchInvoices({
            page: 1,
            pageSize: 10,
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            search: debouncedSearch || undefined,
            status: status || undefined,
            sortColumn: sortColumn || undefined,
            sortDirection: sortDirection || undefined,
          });
        }
      }, 300);

      return () => clearTimeout(timeoutId);
    }
  }, [
    isURLSyncReady,
    invoices.length,
    loading,
    fetchInvoices,
    fromDate,
    toDate,
    debouncedSearch,
    status,
    sortColumn,
    sortDirection,
  ]);

  useEffect(() => {
    if (!isURLSyncReady || isSyncingFromURLRef.current) return;

    const shouldIncludeSort =
      sortColumn !== DEFAULT_SORT_COLUMN ||
      sortDirection !== DEFAULT_SORT_DIRECTION;

    updateURLState({
      search: debouncedSearch || null,
      fromDate: fromDate || null,
      toDate: toDate || null,
      status: status || null,
      sortColumn: shouldIncludeSort ? sortColumn : null,
      sortDirection: shouldIncludeSort ? sortDirection : null,
      page: page > 1 ? String(page) : null,
    });
  }, [
    debouncedSearch,
    fromDate,
    toDate,
    status,
    sortColumn,
    sortDirection,
    page,
    updateURLState,
    isURLSyncReady,
  ]);

  const clearFilters = useCallback(() => {
    setSearch('');
    setFromDate('');
    setToDate('');
    setStatus('');
  }, []);

  const hasActiveFilters = Boolean(search || fromDate || toDate || status);
  const orgScopeWarningActive =
    scopeInfo?.enforced && invoices.length === 0 && !hasActiveFilters;
  const orgScopeTarget = scopeInfo?.orgId
    ? `org_id ${scopeInfo.orgId}`
    : 'your organization';
  const orgScopeEmptyTitle = orgScopeWarningActive
    ? 'No invoices for this organization'
    : undefined;
  const orgScopeEmptyDescription = orgScopeWarningActive
    ? `Invoices are scoped to ${orgScopeTarget}. If you expect to see invoices, make sure your user metadata/org_id agreement matches the records (see docs/ORG_ID_SETUP.md for setup steps).${scopeInfo?.reason ? ` Reason: ${scopeInfo.reason}.` : ''}`
    : undefined;

  // Handle create/edit invoice
  const handleSubmitInvoice = useCallback(
    async (data: Parameters<typeof createInvoice>[0]) => {
      setSubmitting(true);
      try {
        if (editingInvoice) {
          await updateInvoice(editingInvoice.id, data);
          showSuccess('Invoice updated successfully.');
        } else {
          await createInvoice(data);
          showSuccess('Invoice created successfully.');
        }

        setIsModalOpen(false);
        setEditingInvoice(null);

        // Refresh list
        await fetchInvoices({
          page,
          pageSize: 10,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          search: debouncedSearch || undefined,
          status: status || undefined,
          sortColumn: sortColumn || undefined,
          sortDirection: sortDirection || undefined,
        });
      } catch (error) {
        handleError(
          error instanceof Error ? error.message : String(error),
          editingInvoice ? 'Update invoice' : 'Create invoice'
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      editingInvoice,
      createInvoice,
      updateInvoice,
      showSuccess,
      handleError,
      fetchInvoices,
      page,
      fromDate,
      toDate,
      debouncedSearch,
      status,
      sortColumn,
      sortDirection,
    ]
  );

  // Handle edit
  const handleEditInvoice = useCallback((invoice: Invoice) => {
    setEditingInvoice(invoice);
    setIsModalOpen(true);
  }, []);

  // Handle delete
  const handleDeleteInvoice = useCallback((invoice: Invoice) => {
    setConfirmDeleteInvoice(invoice);
  }, []);

  // Confirm delete
  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDeleteInvoice) return;

    try {
      await deleteInvoice(confirmDeleteInvoice.id);
      showSuccess('Invoice deleted successfully.');
      setConfirmDeleteInvoice(null);

      // Refresh list
      await fetchInvoices({
        page,
        pageSize: 10,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search: debouncedSearch || undefined,
        status: status || undefined,
        sortColumn: sortColumn || undefined,
        sortDirection: sortDirection || undefined,
      });
    } catch (error) {
      handleError(
        error instanceof Error ? error.message : String(error),
        'Delete invoice'
      );
    }
  }, [
    confirmDeleteInvoice,
    deleteInvoice,
    showSuccess,
    handleError,
    fetchInvoices,
    page,
    fromDate,
    toDate,
    debouncedSearch,
    status,
    sortColumn,
    sortDirection,
  ]);

  // Handle download PDF
  const handleDownloadInvoice = useCallback(
    async (invoice: Invoice) => {
      try {
        // Download invoice PDF using apiFetch to include authentication
        const response = await apiFetch(`/api/invoices/${invoice.id}/pdf`);

        if (!response.ok) {
          let errorMessage = 'Failed to download invoice PDF';
          try {
            // Try to read error as JSON
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const errorData = await response.json();
              errorMessage =
                errorData.message || errorData.error || errorMessage;
            } else {
              // If not JSON, try to read as text
              const errorText = await response.text();
              if (errorText) {
                try {
                  const errorData = JSON.parse(errorText);
                  errorMessage =
                    errorData.message || errorData.error || errorMessage;
                } catch {
                  errorMessage = errorText || errorMessage;
                }
              } else {
                errorMessage = `HTTP ${response.status}: ${response.statusText}`;
              }
            }
          } catch (parseError) {
            logError(
              'Failed to parse error response:',
              parseError instanceof Error
                ? parseError.message
                : String(parseError)
            );
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        // Check content type to ensure it's a PDF
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/pdf')) {
          throw new Error('Invalid response: expected PDF file');
        }

        // Get PDF as blob
        const blob = await response.blob();

        // Verify blob is not empty
        if (blob.size === 0) {
          throw new Error('Downloaded PDF file is empty');
        }

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const safeNum = invoice.invoice_number || invoice.id;
        link.download = `invoice-${safeNum}.pdf`;
        document.body.appendChild(link);
        link.click();

        // Cleanup after a short delay to ensure download starts
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
          document.body.removeChild(link);
        }, 1500);

        showSuccess('Invoice PDF downloaded.');
      } catch (error) {
        logError(
          'PDF download error:',
          error instanceof Error ? error.message : String(error)
        );
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to download invoice PDF';
        handleError(errorMessage, 'Download Invoice');
      }
    },
    [handleError, showSuccess]
  );

  // Handle modal close
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingInvoice(null);
  }, []);

  // Load invoice settings when modal opens
  useEffect(() => {
    if (isModalOpen && !editingInvoice) {
      // Load invoice settings to prefill form
      const loadSettings = async () => {
        try {
          const res = await apiFetch('/api/invoices/invoice_settings');
          if (res.ok) {
            const json = await res.json();
            const data = json.data || {};
            // Map API response to invoiceSettings format (API already maps business_address -> address, etc.)
            setInvoiceSettings({
              business_name: data.business_name,
              address: data.address,
              phone: data.phone,
              email: data.email,
              bank_account_holder: data.bank_account_holder,
              bank_name: data.bank_name,
              bank_swift_code: data.bank_swift_code,
              bank_account_number: data.bank_account_number,
              default_conditions: data.default_conditions,
              default_exchange_rate: data.default_exchange_rate,
              default_currency: data.default_currency,
            });
          }
        } catch (error) {
          // Silently fail - settings are optional
          logError(
            'Failed to load invoice settings:',
            error instanceof Error ? error.message : String(error)
          );
        }
      };
      void loadSettings();
    }
  }, [isModalOpen, editingInvoice]);

  // Handle add new invoice
  const handleAddInvoice = useCallback(() => {
    setEditingInvoice(null);
    setIsModalOpen(true);
  }, []);

  return (
    <ErrorBoundary>
      <AppLayout
        title="Invoices"
        actionButton={{
          label: 'Add Invoice',
          onClick: handleAddInvoice,
          icon: (
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          ),
        }}
      >
        <div className="p-6 space-y-6">
          {/* Filters */}
          <InvoiceFilters
            search={search}
            onSearchChange={setSearch}
            fromDate={fromDate}
            onFromDateChange={setFromDate}
            toDate={toDate}
            onToDateChange={setToDate}
            status={status}
            onStatusChange={setStatus}
            onClearFilters={clearFilters}
            hasActiveFilters={hasActiveFilters}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
          />

          {/* Invoice List */}
          <InvoiceList
            invoices={invoices}
            loading={loading}
            onSort={handleSort}
            getSortState={getSortState}
            onEdit={handleEditInvoice}
            onDelete={handleDeleteInvoice}
            onDownload={handleDownloadInvoice}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={clearFilters}
            currentPage={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={10}
            onPageChange={setPage}
            emptyTitle={orgScopeEmptyTitle}
            emptyDescription={orgScopeEmptyDescription}
          />
        </div>

        {/* Invoice Modal */}
        {isModalOpen && (
          <InvoiceModalDynamic
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            invoice={editingInvoice}
            isEditing={!!editingInvoice}
            invoiceSettings={invoiceSettings}
            onSubmit={handleSubmitInvoice}
            submitting={submitting}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={Boolean(confirmDeleteInvoice)}
          title="Delete Invoice?"
          message={
            confirmDeleteInvoice
              ? `Are you sure you want to delete invoice ${confirmDeleteInvoice.invoice_number}? This action cannot be undone.`
              : ''
          }
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDeleteInvoice(null)}
        />

        {/* Invoice Settings Modal */}
        {isSettingsModalOpen && (
          <InvoiceSettingsModalDynamic
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
          />
        )}
      </AppLayout>
    </ErrorBoundary>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-gray-600">Loading...</div>
        </div>
      }
    >
      <InvoicesPageContent />
    </Suspense>
  );
}
