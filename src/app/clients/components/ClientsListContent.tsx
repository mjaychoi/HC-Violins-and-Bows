'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useClientCollection } from '../hooks/useClientCollection';
import ClientList from './ClientList';
import ClientFilters from './ClientFilters';
import { SearchInput, CardSkeleton } from '@/components/common';
import type { Client, ClientInstrument } from '@/types';

interface ClientsListContentProps {
  clientsWithInstruments: Set<string>;
  instrumentRelationships: ClientInstrument[];
  /** Directory loading from unified data — used only as a soft signal. */
  directoryLoading?: boolean;
  onClientClick: (client: Client) => void;
  onUpdateClient: (
    clientId: string,
    updates: Partial<Client> & { expected_updated_at?: string }
  ) => Promise<void>;
  onDeleteClient: (client: Client) => void;
  newlyCreatedClientId?: string | null;
  onNewlyCreatedClientShown?: () => void;
  /** Called when the server collection finishes a successful load (for page orchestration). */
  onCollectionReady?: (meta: {
    totalCount: number;
    pageRows: Client[];
    refetch: () => Promise<void> | void;
  }) => void;
  collectionRefetchRef?: React.MutableRefObject<
    (() => Promise<void> | void) | null
  >;
}

function ClientsListContentInner({
  clientsWithInstruments,
  instrumentRelationships,
  onClientClick,
  onUpdateClient,
  onDeleteClient,
  newlyCreatedClientId,
  onNewlyCreatedClientShown,
  onCollectionReady,
  collectionRefetchRef,
}: ClientsListContentProps) {
  const searchParams = useSearchParams();
  const clientIdFromURL = searchParams.get('clientId');

  const [deepLinkIncomplete, setDeepLinkIncomplete] = useState(false);
  const deepLinkFetchRef = useRef<string | null>(null);
  const autoOpenedRef = useRef<string | null>(null);
  const deepLinkRequestRef = useRef(0);

  const {
    pageRows,
    paginatedClients,
    totalCount,
    totalPages,
    page: currentPage,
    pageSize,
    loading,
    refreshing,
    error,
    searchTerm,
    setSearchTerm,
    filters,
    showFilters,
    setShowFilters,
    filterOptions,
    handleFilterChange,
    handleHasInstrumentsChange,
    clearAllFilters,
    handleColumnSort,
    getSortArrow,
    getActiveFiltersCount,
    setPage,
    refetch,
    fetchClientById,
    cacheSelectedClient,
    clearSelectedClient,
  } = useClientCollection();

  useEffect(() => {
    if (collectionRefetchRef) {
      collectionRefetchRef.current = refetch;
    }
    onCollectionReady?.({ totalCount, pageRows, refetch });
  }, [collectionRefetchRef, onCollectionReady, totalCount, pageRows, refetch]);

  // Deep-link: secure by-ID fetch when client is not on the current page
  useEffect(() => {
    if (!clientIdFromURL) {
      autoOpenedRef.current = null;
      deepLinkFetchRef.current = null;
      setDeepLinkIncomplete(false);
      clearSelectedClient();
      return;
    }

    if (autoOpenedRef.current === clientIdFromURL) return;

    const match = pageRows.find(c => c.id === clientIdFromURL);
    if (match) {
      autoOpenedRef.current = clientIdFromURL;
      setDeepLinkIncomplete(false);
      cacheSelectedClient(match);
      onClientClick(match);
      return;
    }

    if (loading) return;
    if (deepLinkFetchRef.current === clientIdFromURL) return;
    deepLinkFetchRef.current = clientIdFromURL;
    const requestId = ++deepLinkRequestRef.current;

    void (async () => {
      const client = await fetchClientById(clientIdFromURL);
      if (requestId !== deepLinkRequestRef.current) return;
      if (client?.id === clientIdFromURL) {
        autoOpenedRef.current = clientIdFromURL;
        setDeepLinkIncomplete(false);
        onClientClick(client);
      } else {
        setDeepLinkIncomplete(true);
      }
    })();
  }, [
    clientIdFromURL,
    pageRows,
    loading,
    onClientClick,
    fetchClientById,
    cacheSelectedClient,
    clearSelectedClient,
  ]);

  const hasFetchError =
    Boolean(error) && pageRows.length === 0 && !loading && !refreshing;

  if (hasFetchError) {
    return (
      <div className="p-6">
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-6 py-8 text-center"
        >
          <p className="text-sm font-medium text-red-800">
            Could not load clients. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {Boolean(error) && pageRows.length > 0 ? (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center justify-between gap-3"
        >
          <span>
            Could not refresh the client list. Showing previously loaded data.
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="shrink-0 text-sm font-medium text-amber-900 underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {deepLinkIncomplete ? (
        <div
          role="status"
          data-testid="client-deep-link-not-found"
          className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700"
        >
          The requested client could not be found in this organization.
        </div>
      ) : null}

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            placeholder="Search by name, email, phone, or client number..."
            className="flex-1 min-w-[260px] h-10 px-4 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            value={searchTerm}
            onChange={setSearchTerm}
            aria-label="Search clients"
          />

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
        selectedClientIdFromURL={clientIdFromURL}
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={setPage}
        loading={loading}
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
