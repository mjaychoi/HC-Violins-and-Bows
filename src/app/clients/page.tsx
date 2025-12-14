'use client';
import { Client, ClientInstrument, Instrument } from '@/types';
import dynamic from 'next/dynamic';
import { useUnifiedClients } from '@/hooks/useUnifiedData';
import { generateClientNumber } from '@/utils/uniqueNumberGenerator';
import {
  useClientInstruments,
  useClientView,
  useInstrumentSearch,
  useOwnedItems,
} from './hooks';
import { ClientForm } from './components';
import ClientsListContent from './components/ClientsListContent';
import { TableSkeleton, CardSkeleton } from '@/components/common';
const ClientModal = dynamic(() => import('./components/ClientModal'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
        <CardSkeleton count={1} />
      </div>
    </div>
  ),
});
// Analytics components - use named imports
const CustomerList = dynamic(
  () =>
    import('./analytics/components/CustomerList').then(mod => ({
      default: mod.CustomerList,
    })),
  {
    ssr: false,
    loading: () => <TableSkeleton rows={8} columns={4} />,
  }
);
const CustomerDetail = dynamic(
  () =>
    import('./analytics/components/CustomerDetail').then(mod => ({
      default: mod.CustomerDetail,
    })),
  {
    ssr: false,
    loading: () => <CardSkeleton count={1} />,
  }
);
const PurchaseHistory = dynamic(
  () =>
    import('./analytics/components/PurchaseHistory').then(mod => ({
      default: mod.PurchaseHistory,
    })),
  {
    ssr: false,
    loading: () => <TableSkeleton rows={5} columns={5} />,
  }
);
const CustomerStats = dynamic(
  () =>
    import('./analytics/components/CustomerStats').then(mod => ({
      default: mod.CustomerStats,
    })),
  {
    ssr: false,
    loading: () => <CardSkeleton count={2} />,
  }
);
const CustomerSearch = dynamic(
  () =>
    import('./analytics/components/CustomerSearch').then(mod => ({
      default: mod.CustomerSearch,
    })),
  {
    ssr: false,
    loading: () => <CardSkeleton count={1} />,
  }
);
import { useCustomers } from './analytics/hooks/useCustomers';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useModalState } from '@/hooks/useModalState';
import { AppLayout } from '@/components/layout';
import { ErrorBoundary, ConfirmDialog, Pagination } from '@/components/common';
import { useRouter } from 'next/navigation';
import React, { useState, useMemo, useEffect } from 'react';

type ViewMode = 'list' | 'analytics';

export default function ClientsPage() {
  const router = useRouter();

  // ✅ Initialize viewMode from URL to prevent flicker
  // Use null initially to detect if we need to read from URL
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);

  // ✅ Update view mode from URL on mount (prevents flicker)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      setViewMode(tab === 'analytics' ? 'analytics' : 'list');
    }
  }, []);

  // Update URL when view mode changes
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    const url = mode === 'analytics' ? '/clients?tab=analytics' : '/clients';
    router.replace(url, { scroll: false });
  };

  // Error/Success handling
  const { handleError, showSuccess } = useAppFeedback();
  const [confirmDelete, setConfirmDelete] = useState<Client | null>(null);

  // FIXED: useUnifiedData is now called at root layout level
  // No need to call it here - data is already fetched

  // Custom hooks
  const {
    clients,
    loading,
    submitting,
    createClient,
    updateClient,
    deleteClient,
  } = useUnifiedClients();

  // FIXED: useClientInstruments now uses DataContext connections internally
  // No need to fetch separately - useUnifiedData already fetches at root level
  const {
    instrumentRelationships,
    clientsWithInstruments,
    addInstrumentRelationship: addInstrumentRelationshipHook,
    removeInstrumentRelationship: removeInstrumentRelationshipHook,
    fetchInstrumentRelationships,
  } = useClientInstruments();

  // FIXED: Initialize instrumentRelationships from DataContext connections
  // This avoids duplicate API calls - connections are already fetched by useUnifiedData
  // TODO: Refactor useClientInstruments to use DataContext connections directly
  React.useEffect(() => {
    // Note: useClientInstruments maintains its own state for instrumentRelationships
    // This is a temporary solution - ideally useClientInstruments should use DataContext
    // For now, we rely on the hook's internal state which may be updated via mutations
  }, []);

  // Note: Filters are now handled in ClientsListContent component
  // to support Suspense boundary for useSearchParams()

  // 디버깅: 데이터 로딩 상태 확인 (개발 환경에서만) - 무한 루프 방지를 위해 최소화
  // useEffect(() => {
  //   console.log('[ClientsPage] Data state:', {
  //     clientsCount: clients.length,
  //     loading: loading.any,
  //     loadingClients: loading.clients,
  //     filteredClientsCount: filteredClients.length,
  //   });
  // }, [clients.length, loading.any, loading.clients, filteredClients.length]);

  // UI states using common hooks
  const { isOpen: showModal, openModal, closeModal } = useModalState();

  // Custom hooks for specific functionality
  const {
    showViewModal,
    selectedClient,
    isEditing,
    openClientView,
    closeClientView,
    startEditing,
    stopEditing,
    viewFormData,
    showInterestDropdown,
    updateViewFormData,
    handleViewInputChange,
  } = useClientView();

  const {
    showInstrumentSearch,
    instrumentSearchTerm,
    searchResults,
    isSearchingInstruments,
    openInstrumentSearch,
    closeInstrumentSearch,
    handleInstrumentSearch,
  } = useInstrumentSearch();

  const {
    // ownedItems,
    // loadingOwnedItems,
    fetchOwnedItems,
    clearOwnedItems,
  } = useOwnedItems();

  // Toggle instrument search
  const toggleInstrumentSearch = () => {
    if (showInstrumentSearch) closeInstrumentSearch();
    else openInstrumentSearch();
  };

  const handleSubmit = async (
    clientData: Omit<Client, 'id' | 'created_at'>,
    instruments?: Array<{
      instrument: Instrument;
      relationshipType: ClientInstrument['relationship_type'];
    }>
  ) => {
    try {
      // client_number가 없으면 자동 생성
      // Create new object instead of mutating parameter (immutable pattern)
      const withClientNumber: Omit<Client, 'id' | 'created_at'> = {
        ...clientData,
        client_number:
          clientData.client_number ??
          generateClientNumber(
            clients
              .map(c => c.client_number)
              .filter((num): num is string => num !== null && num !== undefined)
          ),
      };

      const newClient = await createClient(withClientNumber);

      if (newClient && instruments && instruments.length > 0) {
        // 새 클라이언트에 instrument 연결 추가
        try {
          await Promise.all(
            instruments.map(({ instrument, relationshipType }) =>
              addInstrumentRelationshipHook(
                newClient.id,
                instrument.id,
                relationshipType
              )
            )
          );
        } catch (error) {
          handleError(error, 'Failed to add instrument relationships');
          // 클라이언트는 생성되었지만 instrument 연결 실패
        }
      }

      if (newClient) {
        closeModal();
        showSuccess('고객이 성공적으로 추가되었습니다.');
      }
    } catch (error) {
      handleError(error, 'Failed to create client');
    }
  };

  const handleDeleteClient = () => {
    if (!selectedClient) return;
    setConfirmDelete(selectedClient);
  };

  const confirmDeleteClient = async () => {
    if (!confirmDelete) return;

    try {
      const success = await deleteClient(confirmDelete.id);

      if (success) {
        closeClientView();
        showSuccess('고객이 성공적으로 삭제되었습니다.');
      }
    } catch (error) {
      handleError(error, 'Failed to delete client');
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleRowClick = (client: Client) => {
    // 바로 편집 모드로 열기
    openClientView(client, true);

    // Fetch instrument relationships for this client with error handling
    fetchInstrumentRelationships(client.id).catch(error => {
      handleError(error, 'Failed to fetch instrument relationships');
    });

    // Fetch owned items if client has Owner tag with error handling
    if (client.tags?.includes('Owner')) {
      fetchOwnedItems(client).catch(error => {
        handleError(error, 'Failed to fetch owned items');
      });
    } else {
      clearOwnedItems();
    }
  };

  const addInstrumentRelationship = async (
    instrumentId: string,
    relationshipType: ClientInstrument['relationship_type'] = 'Interested'
  ) => {
    if (!selectedClient) return;

    try {
      await addInstrumentRelationshipHook(
        selectedClient.id,
        instrumentId,
        relationshipType
      );

      // Refresh relationships
      await fetchInstrumentRelationships(selectedClient.id);
      closeInstrumentSearch();
      showSuccess('악기 연결이 추가되었습니다.');
    } catch (error) {
      handleError(error, 'Failed to add instrument relationship');
    }
  };

  const removeInstrumentRelationship = async (relationshipId: string) => {
    try {
      await removeInstrumentRelationshipHook(relationshipId);

      // Refresh relationships
      if (selectedClient) {
        await fetchInstrumentRelationships(selectedClient.id);
      }
      showSuccess('악기 연결이 제거되었습니다.');
    } catch (error) {
      handleError(error, 'Failed to remove instrument relationship');
    }
  };

  // ✅ Analytics hooks (only when in analytics view) - prevent unnecessary fetch
  const analyticsData = useCustomers({ enabled: viewMode === 'analytics' });
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<
    'All' | 'Completed' | 'Pending' | 'Refunded'
  >('All');
  const [analyticsCurrentPage, setAnalyticsCurrentPage] = useState(1);
  const analyticsPageSize = 20;

  const paginatedAnalyticsCustomers = useMemo(() => {
    if (viewMode !== 'analytics') return [];
    const start = (analyticsCurrentPage - 1) * analyticsPageSize;
    const end = start + analyticsPageSize;
    return analyticsData.customers.slice(start, end);
  }, [
    analyticsData.customers,
    analyticsCurrentPage,
    analyticsPageSize,
    viewMode,
  ]);

  const analyticsTotalPages = Math.max(
    1,
    Math.ceil(analyticsData.customers.length / analyticsPageSize)
  );

  useEffect(() => {
    if (viewMode === 'analytics') {
      if (
        analyticsCurrentPage > analyticsTotalPages &&
        analyticsTotalPages > 0
      ) {
        setAnalyticsCurrentPage(1);
      }
    }
  }, [
    analyticsData.customers.length,
    analyticsTotalPages,
    analyticsCurrentPage,
    viewMode,
  ]);

  useEffect(() => {
    if (viewMode === 'analytics') {
      setAnalyticsCurrentPage(1);
    }
  }, [
    analyticsData.searchTerm,
    analyticsData.tagFilter,
    analyticsData.sortBy,
    viewMode,
  ]);

  return (
    <ErrorBoundary>
      <AppLayout
        title="Clients"
        actionButton={
          viewMode === 'list'
            ? {
                label: 'Add Client',
                onClick: openModal,
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
              }
            : undefined
        }
      >
        {/* Tabs */}
        <div className="border-b border-gray-200 bg-white">
          <div className="px-6">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              <button
                onClick={() => handleViewModeChange('list')}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${
                    viewMode === 'list'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                List
              </button>
              <button
                onClick={() => handleViewModeChange('analytics')}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${
                    viewMode === 'analytics'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                Analytics
              </button>
            </nav>
          </div>
        </div>

        {/* ✅ Show loading state while determining viewMode from URL */}
        {viewMode === null ? (
          <div className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 rounded w-1/4"></div>
              <div className="h-64 bg-gray-100 rounded"></div>
            </div>
          </div>
        ) : viewMode === 'list' ? (
          loading.any ? (
            <div className="p-6">
              <TableSkeleton rows={8} columns={7} />
            </div>
          ) : (
            <ClientsListContent
              clients={clients}
              clientsWithInstruments={clientsWithInstruments}
              instrumentRelationships={instrumentRelationships}
              loading={loading}
              onClientClick={handleRowClick}
              onUpdateClient={async (clientId, updates) => {
                try {
                  const result = await updateClient(clientId, updates);
                  if (!result) {
                    // updateClient returns null on error
                    throw new Error('Failed to update client');
                  }
                  showSuccess('고객 정보가 성공적으로 수정되었습니다.');
                } catch (error) {
                  handleError(error, 'Failed to update client');
                  throw error; // Re-throw to prevent saveEditing from closing editing mode
                }
              }}
              onDeleteClient={(client: Client) => {
                setConfirmDelete(client);
              }}
            />
          )
        ) : (
          // Analytics View
          <div className="p-6">
            {/* Search */}
            <div className="mb-6">
              <CustomerSearch
                searchTerm={analyticsData.searchTerm}
                onSearchChange={analyticsData.setSearchTerm}
                tagFilter={analyticsData.tagFilter}
                onTagFilterChange={analyticsData.setTagFilter}
                sortBy={analyticsData.sortBy}
                onSortChange={analyticsData.setSortBy}
                availableTags={analyticsData.availableTags}
              />
            </div>

            {/* Customer Stats */}
            {analyticsData.customers.length > 0 && (
              <div className="mb-6">
                <CustomerStats
                  customers={
                    analyticsData.selectedCustomer
                      ? [analyticsData.selectedCustomer]
                      : analyticsData.customers
                  }
                  hasActiveFilters={
                    Boolean(analyticsData.searchTerm) ||
                    analyticsData.tagFilter !== 'all' ||
                    analyticsData.sortBy !== 'name'
                  }
                  totalCustomers={
                    analyticsData.allCustomersCount ||
                    analyticsData.customers.length
                  }
                />
              </div>
            )}

            {/* Main Content: List + Detail */}
            <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1 order-2 lg:order-1">
                <CustomerList
                  customers={paginatedAnalyticsCustomers}
                  onSelect={analyticsData.setSelectedCustomerId}
                  selectedId={analyticsData.selectedCustomerId}
                />
                {/* Pagination */}
                {analyticsTotalPages > 1 && (
                  <div className="mt-4 border-t border-gray-200 pt-4">
                    <Pagination
                      currentPage={analyticsCurrentPage}
                      totalPages={analyticsTotalPages}
                      onPageChange={setAnalyticsCurrentPage}
                      totalCount={analyticsData.customers.length}
                      pageSize={analyticsPageSize}
                      loading={analyticsData.loading}
                    />
                  </div>
                )}
              </div>
              <div className="lg:col-span-2 space-y-4 order-1 lg:order-2">
                <CustomerDetail customer={analyticsData.selectedCustomer} />
                <PurchaseHistory
                  purchases={analyticsData.selectedCustomer?.purchases ?? []}
                  statusFilter={purchaseStatusFilter}
                  onStatusFilterChange={setPurchaseStatusFilter}
                />
              </div>
            </div>
          </div>
        )}

        {/* Add Client Form */}
        <ClientForm
          isOpen={showModal}
          onClose={closeModal}
          onSubmit={handleSubmit}
          submitting={submitting.any}
        />

        {/* View/Edit Client Modal */}
        <ClientModal
          isOpen={showViewModal}
          onClose={closeClientView}
          client={selectedClient}
          isEditing={isEditing}
          onEdit={startEditing}
          onSave={async (clientData: Partial<Client>) => {
            if (selectedClient) {
              await updateClient(selectedClient.id, clientData);
              stopEditing();
              showSuccess('고객 정보가 성공적으로 수정되었습니다.');
              // Update local view data
              // updateViewFormData(clientData)
            }
          }}
          onDelete={handleDeleteClient}
          onCancel={stopEditing}
          submitting={submitting.any}
          instrumentRelationships={instrumentRelationships}
          onAddInstrument={addInstrumentRelationship}
          onRemoveInstrument={removeInstrumentRelationship}
          searchResults={searchResults}
          isSearchingInstruments={isSearchingInstruments}
          showInstrumentSearch={showInstrumentSearch}
          onToggleInstrumentSearch={toggleInstrumentSearch}
          instrumentSearchTerm={instrumentSearchTerm}
          onInstrumentSearchTermChange={handleInstrumentSearch}
          viewFormData={viewFormData}
          showInterestDropdown={showInterestDropdown}
          onViewInputChange={handleViewInputChange}
          onUpdateViewFormData={updateViewFormData}
        />

        <ConfirmDialog
          isOpen={Boolean(confirmDelete)}
          title="고객을 삭제하시겠어요?"
          message="삭제한 고객은 복구할 수 없습니다."
          confirmLabel="삭제"
          cancelLabel="취소"
          onConfirm={confirmDeleteClient}
          onCancel={() => setConfirmDelete(null)}
        />
      </AppLayout>
    </ErrorBoundary>
  );
}
