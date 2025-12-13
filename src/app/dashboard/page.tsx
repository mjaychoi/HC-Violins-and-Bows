'use client';

import { useDashboardFilters } from './hooks';
import { useDashboardModal } from './hooks/useDashboardModal';
import { useDashboardData } from './hooks/useDashboardData';
import { ItemForm, ItemList, ItemFilters } from './components';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { AppLayout } from '@/components/layout';
import {
  ErrorBoundary,
  ConfirmDialog,
  NotificationBadge,
} from '@/components/common';
import { usePageNotifications } from '@/hooks/usePageNotifications';
import React, { useCallback, useMemo, useEffect } from 'react';
import { Instrument } from '@/types';

export default function DashboardPage() {
  const { ErrorToasts, SuccessToasts, showSuccess } = useAppFeedback();

  // FIXED: useUnifiedData is now called at root layout level
  // No need to call it here - data is already fetched

  // Page notifications (badge with click handler)
  // NOTE: Dashboard doesn't use maintenance tasks, so we pass empty array
  // Consider removing usePageNotifications from dashboard if notifications are not needed
  const { notificationBadge } = usePageNotifications({
    tasks: [], // Dashboard doesn't use maintenance tasks
    navigateTo: '/calendar',
    showToastOnClick: true,
    showSuccess,
  });

  // Dashboard data and CRUD operations
  const {
    instruments,
    clientRelationships,
    clients,
    loading,
    submitting,
    handleCreateItem,
    handleUpdateItem,
    handleUpdateItemInline,
    handleDeleteItem,
  } = useDashboardData();

  // Track clients loading state separately
  const clientsLoading = useMemo(() => {
    // Check if clients array is empty but we're still loading
    return clients.length === 0 && loading.any;
  }, [clients.length, loading.any]);

  // FIXED: Enrich items with clients array for HAS_CLIENTS filter
  // This ensures filterDashboardItems can properly check hasClients without type casting
  type EnrichedInstrument = Instrument & {
    clients: typeof clientRelationships;
  };
  const enrichedItems = useMemo<EnrichedInstrument[]>(() => {
    // Group relationships by instrument_id for O(1) lookup
    type RelationshipType = (typeof clientRelationships)[number];
    const relationshipsByInstrument = new Map<string, RelationshipType[]>();
    clientRelationships.forEach((rel: RelationshipType) => {
      if (rel.instrument_id) {
        const existing = relationshipsByInstrument.get(rel.instrument_id) || [];
        existing.push(rel);
        relationshipsByInstrument.set(rel.instrument_id, existing);
      }
    });

    // Map instruments with their clients
    return instruments.map((item: Instrument) => ({
      ...item,
      clients: relationshipsByInstrument.get(item.id) || [],
    })) as EnrichedInstrument[];
  }, [instruments, clientRelationships]);

  // Debug: Log clients loading state
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      process.env.NODE_ENV === 'development'
    ) {
      console.log('[Dashboard] Clients state:', {
        clientsCount: clients?.length ?? 0,
        loading: loading.any,
        sampleClientIds:
          clients?.slice(0, 3).map((c: { id: string }) => c.id) ?? [],
        clientRelationshipsCount: clientRelationships?.length ?? 0,
        sampleRelationships:
          clientRelationships
            ?.slice(0, 3)
            .map((rel: (typeof clientRelationships)[number]) => ({
              instrument_id: rel.instrument_id,
              client_id: rel.client_id,
              relationship_type: rel.relationship_type,
              hasClient: !!rel.client,
              hasInstrument: !!rel.instrument,
            })) ?? [],
        enrichedItemsCount: enrichedItems.length,
        itemsWithClients: enrichedItems.filter(
          (i: EnrichedInstrument) => i.clients.length > 0
        ).length,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clients?.length,
    loading.any,
    clientRelationships?.length,
    enrichedItems.length,
  ]);

  // Dashboard filters - use enrichedItems instead of instruments
  const {
    searchTerm,
    setSearchTerm,
    showFilters,
    setShowFilters,
    filters,
    paginatedItems,
    handleFilterChange,
    handlePriceRangeChange,
    clearAllFilters,
    handleSort,
    getSortArrow,
    getActiveFiltersCount,
    dateRange,
    setDateRange,
    filterOperator,
    setFilterOperator,
    // Pagination
    currentPage,
    totalPages,
    totalCount,
    pageSize,
    setPage,
  } = useDashboardFilters(enrichedItems);

  // Dashboard modal state
  const {
    showModal,
    isEditing,
    selectedItem,
    closeModal,
    handleAddItem,
    confirmItem,
    isConfirmDialogOpen,
    handleRequestDelete,
    handleCancelDelete,
  } = useDashboardModal();

  // Calculate existing serial numbers for ItemForm validation
  // This avoids duplicate data fetching in ItemForm (DashboardPage already has instruments)
  const existingSerialNumbers = useMemo(
    () =>
      instruments
        .map((i: Instrument) => i.serial_number)
        .filter(
          (num: string | null | undefined): num is string =>
            num !== null && num !== undefined
        ),
    [instruments]
  );

  // Handle confirmed deletion
  const handleConfirmDelete = useCallback(async () => {
    if (!confirmItem) return;
    try {
      await handleDeleteItem(confirmItem.id);
      handleCancelDelete();
    } catch {
      // Error already handled in handleDeleteItem
    }
  }, [confirmItem, handleDeleteItem, handleCancelDelete]);

  return (
    <ErrorBoundary>
      <AppLayout
        title="Items"
        actionButton={{
          label: 'Add Item',
          onClick: handleAddItem,
        }}
        headerActions={
          <NotificationBadge
            overdue={notificationBadge.overdue}
            upcoming={notificationBadge.upcoming}
            today={notificationBadge.today}
            onClick={notificationBadge.onClick}
          />
        }
      >
        <div className="p-6 space-y-4">
          {/* UX: Quick Filters - Always visible for common use cases */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search items by maker, type, serial..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full h-10 px-4 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                aria-label="Search items"
              />
            </div>

            {/* UX: Quick Filter Pills - Common use cases */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* UX: Quick filter for "Has Clients" - toggle boolean filter */}
              <button
                onClick={() => {
                  // handleFilterChange toggles the value, so just call it
                  handleFilterChange('hasClients', true);
                }}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  filters.hasClients.includes(true)
                    ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                aria-pressed={filters.hasClients.includes(true)}
                type="button"
              >
                Has Clients
              </button>
              {/* UX: Quick filter for "No Clients" - toggle boolean filter */}
              <button
                onClick={() => {
                  // handleFilterChange toggles the value, so just call it
                  handleFilterChange('hasClients', false);
                }}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  filters.hasClients.includes(false)
                    ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                aria-pressed={filters.hasClients.includes(false)}
                type="button"
              >
                No Clients
              </button>

              {/* More Filters Button - Secondary action */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors flex items-center gap-2 ${
                  showFilters || getActiveFiltersCount() > 0
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
                More Filters
                {getActiveFiltersCount() > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium text-white bg-blue-600 rounded-full">
                    {getActiveFiltersCount()}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Advanced Filters Panel - Collapsible */}
          {showFilters && (
            <ItemFilters
              items={instruments}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              filters={filters}
              onFilterChange={(filterType, value) =>
                handleFilterChange(filterType, value)
              }
              onPriceRangeChange={handlePriceRangeChange}
              onClearFilters={clearAllFilters}
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters(!showFilters)}
              activeFiltersCount={getActiveFiltersCount()}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              filterOperator={filterOperator}
              onOperatorChange={setFilterOperator}
            />
          )}

          {/* Items List */}
          <ItemList
            items={paginatedItems}
            loading={loading.any}
            onDeleteClick={handleRequestDelete}
            onUpdateItem={handleUpdateItemInline}
            clientRelationships={clientRelationships}
            allClients={clients}
            clientsLoading={clientsLoading}
            getSortArrow={getSortArrow}
            onSort={handleSort}
            onAddClick={handleAddItem}
            emptyState={{
              hasActiveFilters:
                getActiveFiltersCount() > 0 ||
                Boolean(searchTerm) ||
                Boolean(dateRange?.from) ||
                Boolean(dateRange?.to),
              message:
                getActiveFiltersCount() > 0 ||
                Boolean(searchTerm) ||
                Boolean(dateRange?.from) ||
                Boolean(dateRange?.to)
                  ? 'No items found matching your filters'
                  : undefined,
            }}
            // Pagination props
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>

        {/* Item Form Modal - Show when editing or creating */}
        {/* Note: Form state management is handled internally by ItemForm via useDashboardForm.
            ItemForm handles form reset and modal close on successful submit. */}
        <ItemForm
          isOpen={showModal}
          onClose={closeModal}
          onSubmit={
            isEditing && selectedItem
              ? async formData => {
                  await handleUpdateItem(selectedItem.id, formData);
                }
              : handleCreateItem
          }
          submitting={submitting.any}
          selectedItem={selectedItem}
          isEditing={isEditing}
          existingSerialNumbers={existingSerialNumbers}
        />

        {/* Error Toasts */}
        <ErrorToasts />
        {/* Success Toasts */}
        <SuccessToasts />
        <ConfirmDialog
          isOpen={isConfirmDialogOpen}
          title="Delete item?"
          message="This item will be permanently removed. This action cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      </AppLayout>
    </ErrorBoundary>
  );
}
