'use client';

import React, { Suspense } from 'react';
import { useDashboardFilters } from '../hooks';
import { ItemList, ItemFilters } from './';
import { CardSkeleton, SearchInput } from '@/components/common';
import type { Instrument, Client, ClientInstrument } from '@/types';

interface DashboardContentProps {
  enrichedItems: (Instrument & { clients?: ClientInstrument[] })[];
  instruments: Instrument[];
  clients: Client[];
  clientRelationships: ClientInstrument[];
  clientsLoading: boolean;
  loading: {
    any: boolean;
  };
  onDeleteClick: (item: Instrument) => void;
  onUpdateItemInline: (
    id: string,
    updates: Partial<Instrument>
  ) => Promise<void>;
  onAddClick: () => void;
  onSellClick: (item: Instrument) => void;
}

function DashboardContentInner({
  enrichedItems,
  instruments,
  clients,
  clientRelationships,
  clientsLoading,
  loading,
  onDeleteClick,
  onUpdateItemInline,
  onAddClick,
  onSellClick,
}: DashboardContentProps) {
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

  return (
    <div className="p-6 space-y-4">
      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="flex-1 min-w-[260px]">
            <SearchInput
              placeholder="Search items by maker, type, serial..."
              value={searchTerm}
              onChange={setSearchTerm}
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
            clients={clients}
          />
        )}

        {/* Items List */}
        <ItemList
          items={paginatedItems}
          loading={loading.any}
          onDeleteClick={onDeleteClick}
          onUpdateItem={onUpdateItemInline}
          clientRelationships={clientRelationships}
          allClients={clients}
          clientsLoading={clientsLoading}
          getSortArrow={getSortArrow}
          onSort={handleSort}
          onAddClick={onAddClick}
          onSellClick={onSellClick}
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
    </div>
  );
}

export default function DashboardContent(props: DashboardContentProps) {
  return (
    <Suspense
      fallback={
        <div className="p-6 space-y-4">
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[260px] h-10 bg-gray-200 rounded animate-pulse" />
              <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
          <div className="bg-white shadow rounded-lg p-6">
            <CardSkeleton count={5} />
          </div>
        </div>
      }
    >
      <DashboardContentInner {...props} />
    </Suspense>
  );
}
