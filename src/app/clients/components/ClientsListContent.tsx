'use client';

import React, { Suspense } from 'react';
import { useFilters } from '../hooks/useFilters';
import { useClientKPIs } from '../hooks/useClientKPIs';
import ClientList from './ClientList';
import ClientFilters from './ClientFilters';
import { ClientKPISummary } from './ClientKPISummary';
import TodayFollowUps from './TodayFollowUps';
import { SearchInput, CardSkeleton } from '@/components/common';
import type { Client, ClientInstrument } from '@/types';

interface ClientsListContentProps {
  clients: Client[];
  clientsWithInstruments: Set<string>;
  instrumentRelationships: ClientInstrument[];
  loading: {
    // @deprecated Use hasAnyLoading instead
    any: boolean;
    hasAnyLoading: boolean;
  };
  onClientClick: (client: Client) => void;
  onUpdateClient: (clientId: string, updates: Partial<Client>) => Promise<void>;
  onDeleteClient: (client: Client) => void;
  newlyCreatedClientId?: string | null;
  onNewlyCreatedClientShown?: () => void;
}

function ClientsListContentInner({
  clients,
  clientsWithInstruments,
  instrumentRelationships,
  loading,
  onClientClick,
  onUpdateClient,
  onDeleteClient,
  newlyCreatedClientId,
  onNewlyCreatedClientShown,
}: ClientsListContentProps) {
  const {
    searchTerm,
    setSearchTerm,
    showFilters,
    setShowFilters,
    filters,
    paginatedClients,
    filterOptions,
    handleFilterChange,
    handleHasInstrumentsChange,
    clearAllFilters,
    handleColumnSort,
    getSortArrow,
    getActiveFiltersCount,
    // Pagination
    currentPage,
    totalPages,
    totalCount,
    pageSize,
    setPage,
  } = useFilters(clients, clientsWithInstruments);

  // Calculate KPIs for all clients
  const kpis = useClientKPIs(clients);

  return (
    <div className="p-6">
      {/* Today Follow-ups */}
      <TodayFollowUps />

      {/* KPI Summary */}
      <ClientKPISummary kpis={kpis} />

      {/* Search and Filters */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <SearchInput
            placeholder="Search clients..."
            className="flex-1 min-w-[260px] h-10 px-4 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            value={searchTerm}
            onChange={setSearchTerm}
            aria-label="Search clients"
          />

          {/* Filters Button */}
          <button
            data-filter-button
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-controls="filters-panel"
            className={`h-10 px-3 text-sm font-medium rounded-lg border transition-colors flex items-center gap-2 ${
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
            Filters
            {getActiveFiltersCount() > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium text-white bg-blue-600 rounded-full">
                {getActiveFiltersCount()}
              </span>
            )}
          </button>

          {/* Reset Filters Button */}
          {/* Note: clearAllFilters also resets searchTerm (usePageFilters implementation) */}
          {getActiveFiltersCount() > 0 || searchTerm ? (
            <button
              onClick={clearAllFilters}
              className="h-10 px-3 text-sm font-medium rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
              aria-label="Clear all filters and search"
              type="button"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <ClientFilters
            isOpen={showFilters}
            onClose={() => setShowFilters(false)}
            filters={filters}
            filterOptions={filterOptions}
            onFilterChange={handleFilterChange}
            onHasInstrumentsChange={handleHasInstrumentsChange}
            onClearAllFilters={clearAllFilters}
            activeFiltersCount={getActiveFiltersCount()}
          />
        )}
      </div>

      {/* Clients Table */}
      <ClientList
        clients={paginatedClients}
        clientInstruments={instrumentRelationships}
        clientsWithInstruments={clientsWithInstruments}
        onClientClick={onClientClick}
        onUpdateClient={onUpdateClient}
        onDeleteClient={onDeleteClient}
        onColumnSort={handleColumnSort}
        getSortArrow={getSortArrow}
        newlyCreatedClientId={newlyCreatedClientId}
        onNewlyCreatedClientShown={onNewlyCreatedClientShown}
        // Pagination props
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={setPage}
        loading={loading.hasAnyLoading}
        hasActiveFilters={getActiveFiltersCount() > 0 || !!searchTerm}
        onResetFilters={clearAllFilters}
      />
    </div>
  );
}

export default function ClientsListContent(props: ClientsListContentProps) {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[260px] h-10 bg-gray-200 rounded animate-pulse" />
              <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
          <CardSkeleton count={5} />
        </div>
      }
    >
      <ClientsListContentInner {...props} />
    </Suspense>
  );
}
