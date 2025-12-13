'use client';

import { useMemo, useCallback, Suspense } from 'react';
import { Instrument } from '@/types';
import { usePageFilters } from '@/hooks/usePageFilters';
import { CardSkeleton, SearchInput } from '@/components/common';
import InstrumentList from './InstrumentList';
import InstrumentFilters from './InstrumentFilters';

interface InstrumentsContentProps {
  items: Instrument[];
  loading: boolean;
  onAddInstrument: () => void;
}

function InstrumentsContentInner({
  items,
  loading,
  onAddInstrument,
}: InstrumentsContentProps) {
  // Use PageFilters hook for consistent filtering
  const {
    searchTerm,
    setSearchTerm,
    showFilters,
    setShowFilters,
    filters,
    filteredItems,
    filterOptions: baseFilterOptions,
    handleFilterChange,
    clearAllFilters,
    getActiveFiltersCount,
  } = usePageFilters<Instrument>({
    items,
    filterOptionsConfig: {
      maker: 'simple',
      status: 'simple',
    },
    searchFields: ['maker', 'type', 'subtype', 'serial_number'],
    initialSortBy: 'created_at',
    initialSortOrder: 'desc',
    debounceMs: 300,
    initialFilters: {
      maker: [],
      status: [],
    },
    resetFilters: () => ({
      maker: [],
      status: [],
    }),
    syncWithURL: true, // URL 쿼리 파라미터와 상태 동기화
    urlParamMapping: {
      searchTerm: 'search',
    },
  });

  // Convert filterOptions format for InstrumentFilters
  const filterOptions = useMemo(() => {
    return {
      makers: baseFilterOptions.maker || [],
      statuses: baseFilterOptions.status || [],
    };
  }, [baseFilterOptions]);

  // Convert filters format for InstrumentFilters
  const instrumentFilters = useMemo(() => {
    return {
      maker: (filters.maker as string[]) || [],
      status: (filters.status as string[]) || [],
    };
  }, [filters]);

  // Handle filter change - usePageFilters already handles array toggling
  const handleInstrumentFilterChange = useCallback(
    (category: 'maker' | 'status', value: string) => {
      handleFilterChange(category, value);
    },
    [handleFilterChange]
  );

  const activeFiltersCount = getActiveFiltersCount();

  return (
    <div className="p-6 space-y-4">
      {/* Search and Filters */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search instruments by maker, type, serial..."
            className="flex-1 min-w-[260px]"
            debounceMs={300}
          />

          {/* Filters Button */}
          <button
            data-filter-button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 text-sm font-medium rounded-lg border transition-colors px-3 py-1.5 ${
              showFilters || activeFiltersCount > 0
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
            aria-expanded={showFilters}
            aria-controls="instrument-filters-panel"
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
            {activeFiltersCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium text-white bg-blue-600 rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Filters Panel */}
        <InstrumentFilters
          isOpen={showFilters}
          onClose={() => setShowFilters(false)}
          filters={instrumentFilters}
          filterOptions={filterOptions}
          onFilterChange={handleInstrumentFilterChange}
          onClearAllFilters={clearAllFilters}
          activeFiltersCount={activeFiltersCount}
        />
      </div>

      {/* Instruments List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            All Instruments
          </h3>

          <InstrumentList
            items={filteredItems}
            loading={loading}
            onAddInstrument={onAddInstrument}
          />
        </div>
      </div>
    </div>
  );
}

export default function InstrumentsContent(props: InstrumentsContentProps) {
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
      <InstrumentsContentInner {...props} />
    </Suspense>
  );
}
