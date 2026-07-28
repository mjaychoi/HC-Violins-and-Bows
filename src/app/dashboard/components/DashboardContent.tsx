'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboardFilters } from '../hooks';
import { ItemList, ItemFilters } from './';
import { SearchInput } from '@/components/common';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { usePermissions } from '@/hooks/usePermissions';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';
import { downloadItemCSV } from '../utils/itemCsvExport';
import type { Instrument, Client, ClientInstrument } from '@/types';

type EnrichedInstrument = Instrument & {
  clients: ClientInstrument[];
};

interface DashboardContentProps {
  enrichedItems: EnrichedInstrument[];
  itemsTruncated?: boolean;
  clients: Client[];
  clientRelationships: ClientInstrument[];
  clientsLoading: boolean;
  loading: {
    // @deprecated Use hasAnyLoading instead
    any: boolean;
    hasAnyLoading: boolean;
  };
  onDeleteClick: (item: Instrument) => void;
  onEditClick?: (item: Instrument) => void;
  onRowClick?: (item: Instrument) => void;
  onUpdateItemInline: (
    id: string,
    updates: Partial<Instrument>
  ) => Promise<void>;
  onAddClick?: () => void;
  newlyCreatedItemId?: string | null;
  onNewlyCreatedItemShown?: () => void;
  onInstrumentCertificatesChanged?: () => void;
}

function DashboardContentInner({
  enrichedItems,
  itemsTruncated = false,
  clients,
  clientRelationships,
  clientsLoading,
  loading,
  onDeleteClick,
  onEditClick,
  onRowClick,
  onUpdateItemInline,
  onAddClick,
  newlyCreatedItemId,
  onNewlyCreatedItemShown,
  onInstrumentCertificatesChanged,
}: DashboardContentProps) {
  const { canManageInstruments } = usePermissions();
  const { tenantIdentityKey, isTenantTransitioning } = useTenantIdentity();
  const { showSuccess, showWarning, handleError } = useAppFeedback();
  const [isExporting, setIsExporting] = useState(false);
  const {
    searchTerm,
    setSearchTerm,
    showFilters,
    setShowFilters,
    filters,
    filteredItems,
    paginatedItems,
    handleFilterChange,
    handlePriceRangeChange,
    clearAllFilters,
    handleSort,
    getSortArrow,
    getActiveFiltersCount,
    dateRange,
    setDateRange,
    currentPage,
    totalPages,
    totalCount,
    pageSize,
    setPage,
  } = useDashboardFilters(enrichedItems);
  const exportItems = useMemo(() => filteredItems ?? [], [filteredItems]);

  useEffect(() => {
    setIsExporting(false);
  }, [tenantIdentityKey]);

  const handleExportCSV = useCallback(() => {
    if (
      !canManageInstruments ||
      isExporting ||
      loading.hasAnyLoading ||
      isTenantTransitioning ||
      !tenantIdentityKey ||
      itemsTruncated
    ) {
      return;
    }

    if (exportItems.length === 0) {
      showWarning('No matching Items to export.');
      return;
    }

    setIsExporting(true);
    try {
      downloadItemCSV(exportItems);
      showSuccess(
        `Exported ${exportItems.length} Item${
          exportItems.length === 1 ? '' : 's'
        } to CSV.`
      );
    } catch (error) {
      handleError(error, 'Export Item CSV');
    } finally {
      setIsExporting(false);
    }
  }, [
    canManageInstruments,
    exportItems,
    handleError,
    isExporting,
    isTenantTransitioning,
    itemsTruncated,
    loading.hasAnyLoading,
    showSuccess,
    showWarning,
    tenantIdentityKey,
  ]);

  const hasActiveFilters =
    getActiveFiltersCount() > 0 ||
    Boolean(searchTerm) ||
    Boolean(dateRange?.from) ||
    Boolean(dateRange?.to);

  return (
    <div className="p-6 space-y-4">
      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[260px] max-w-[600px]">
            <SearchInput
              placeholder="Search items by maker, type, serial..."
              value={searchTerm}
              onChange={setSearchTerm}
              className="w-full h-10 px-4 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              aria-label="Search items"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {canManageInstruments && (
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={
                  loading.hasAnyLoading ||
                  isExporting ||
                  isTenantTransitioning ||
                  !tenantIdentityKey ||
                  itemsTruncated ||
                  exportItems.length === 0
                }
                title={
                  isTenantTransitioning || !tenantIdentityKey
                    ? 'Organization context required'
                    : itemsTruncated
                      ? 'Complete Item set exceeds the dashboard export limit'
                      : exportItems.length === 0
                        ? 'No matching Items to export'
                        : undefined
                }
                className="px-3 py-1.5 text-sm font-medium rounded-lg border text-gray-700 border-gray-300 bg-white hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
              >
                {isExporting ? 'Exporting…' : 'Export CSV'}
              </button>
            )}
            {canManageInstruments && itemsTruncated && (
              <span className="text-xs text-amber-700" role="status">
                Export unavailable: the complete Item set exceeds the dashboard
                limit.
              </span>
            )}
            <button
              type="button"
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

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  clearAllFilters();
                  setShowFilters(false);
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border text-gray-700 border-gray-300 bg-white hover:bg-gray-50 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <ItemFilters
            items={enrichedItems}
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
            clients={clients}
          />
        )}

        <ItemList
          items={paginatedItems}
          loading={loading.hasAnyLoading}
          onDeleteClick={onDeleteClick}
          onEditClick={onEditClick}
          onRowClick={onRowClick}
          onUpdateItem={onUpdateItemInline}
          clientRelationships={clientRelationships}
          allClients={clients}
          clientsLoading={clientsLoading}
          getSortArrow={getSortArrow}
          onSort={handleSort}
          onAddClick={onAddClick}
          newlyCreatedItemId={newlyCreatedItemId}
          onNewlyCreatedItemShown={onNewlyCreatedItemShown}
          emptyState={{
            hasActiveFilters,
            message: hasActiveFilters
              ? 'No items found matching your filters'
              : undefined,
          }}
          onInstrumentCertificatesChanged={onInstrumentCertificatesChanged}
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}

export default function DashboardContent(props: DashboardContentProps) {
  return <DashboardContentInner {...props} />;
}
