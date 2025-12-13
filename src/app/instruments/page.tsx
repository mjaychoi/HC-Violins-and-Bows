'use client';

import { useMemo, useCallback } from 'react';
import { Instrument } from '@/types';
import dynamic from 'next/dynamic';
import {
  useUnifiedDashboard,
  useUnifiedInstruments,
} from '@/hooks/useUnifiedData';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useModalState } from '@/hooks/useModalState';
import { useLoadingState } from '@/hooks/useLoadingState';
import { usePageFilters } from '@/hooks/usePageFilters';
import { AppLayout } from '@/components/layout';
import { ErrorBoundary, CardSkeleton, SearchInput } from '@/components/common';
import InstrumentList from './components/InstrumentList';
import InstrumentFilters from './components/InstrumentFilters';
import { generateInstrumentSerialNumber } from '@/utils/uniqueNumberGenerator';

// Dynamic import for InstrumentForm to reduce initial bundle size
// This component uses Supabase client directly, so it's isolated from the main bundle
const InstrumentForm = dynamic(() => import('./components/InstrumentForm'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
        <CardSkeleton count={1} />
      </div>
    </div>
  ),
});

export default function InstrumentsPage() {
  // Error/Success handling
  const { ErrorToasts, SuccessToasts, handleError, showSuccess } = useAppFeedback();

  // FIXED: useUnifiedData is now called at root layout level
  // No need to call it here - data is already fetched

  // Use unified data hook (same as dashboard)
  const {
    instruments: items,
    loading,
    submitting,
    createInstrument,
  } = useUnifiedDashboard();

  const { instruments: allInstruments } = useUnifiedInstruments();

  const { isOpen: showModal, openModal, closeModal } = useModalState();
  const { withSubmitting } = useLoadingState();

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

  const handleSubmit = async (formData: {
    maker: string;
    name: string;
    year: string;
  }) => {
    try {
      await withSubmitting(async () => {
        // Convert form data to Instrument format
        const yearStr = formData.year?.trim();
        const yearNum = yearStr ? parseInt(yearStr, 10) : null;

        if (yearStr && isNaN(yearNum!)) {
          handleError(new Error('Invalid year value'), 'Invalid input');
          return;
        }

        // 자동으로 serial number 생성
        const existingNumbers = allInstruments
          .map(i => i.serial_number)
          .filter((num): num is string => num !== null && num !== undefined);
        const autoSerialNumber = generateInstrumentSerialNumber(
          formData.name?.trim() || null,
          existingNumbers
        );

        const instrumentData: Omit<Instrument, 'id' | 'created_at'> = {
          status: 'Available',
          maker: formData.maker?.trim() || null,
          type: formData.name?.trim() || null,
          subtype: null,
          year: yearNum,
          certificate: false,
          size: null,
          weight: null,
          price: null,
          ownership: null,
          note: null,
          serial_number: autoSerialNumber,
        };

        await createInstrument(instrumentData);
        closeModal();
        showSuccess('악기가 성공적으로 추가되었습니다.');
      });
    } catch (error) {
      handleError(error, 'Failed to create instrument');
    }
  };

  const activeFiltersCount = getActiveFiltersCount();

  return (
    <ErrorBoundary>
      <AppLayout
        title="Instruments"
        actionButton={{
          label: 'Add New Instrument',
          onClick: openModal,
          icon: (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          ),
        }}
      >
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
                loading={loading.any}
                onAddInstrument={openModal}
              />
            </div>
          </div>
        </div>

        {/* Instrument Form Modal */}
        <InstrumentForm
          isOpen={showModal}
          onClose={closeModal}
          onSubmit={handleSubmit}
          submitting={submitting.any}
        />

        {/* Error Toasts */}
        <ErrorToasts />
        {/* Success Toasts */}
        <SuccessToasts />
      </AppLayout>
    </ErrorBoundary>
  );
}
