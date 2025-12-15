'use client';
// src/app/clients/components/ClientFilters.tsx

import { useCallback, useMemo } from 'react';
import { ClientFilterOptions, FilterState } from '../types';
import {
  HAS_INSTRUMENTS_FILTER_OPTIONS,
  CLIENT_FILTER_LABELS,
} from '../constants';
import {
  PageFilters,
  type FilterGroupConfig,
} from '@/components/common/layout';

interface ClientFiltersProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  filterOptions: ClientFilterOptions;
  onFilterChange: (category: keyof FilterState, value: string) => void;
  onHasInstrumentsChange?: (value: string) => void; // Optional: for single-selection behavior
  onClearAllFilters?: () => void;
  activeFiltersCount?: number;
}

export default function ClientFilters({
  isOpen,
  onClose,
  filters,
  filterOptions,
  onFilterChange,
  onHasInstrumentsChange,
  onClearAllFilters,
  activeFiltersCount = 0,
}: ClientFiltersProps) {
  // Use dedicated handler if provided, otherwise fall back to regular toggle
  const handleHasInstrumentsChange = useCallback(
    (value: string) => {
      if (onHasInstrumentsChange) {
        onHasInstrumentsChange(value);
        return;
      }

      const isCurrentlySelected = filters.hasInstruments.includes(value);
      const other =
        value === HAS_INSTRUMENTS_FILTER_OPTIONS.HAS
          ? HAS_INSTRUMENTS_FILTER_OPTIONS.NO
          : HAS_INSTRUMENTS_FILTER_OPTIONS.HAS;

      if (isCurrentlySelected) {
        onFilterChange('hasInstruments', value);
        return;
      }

      if (filters.hasInstruments.includes(other)) {
        onFilterChange('hasInstruments', other);
      }
      onFilterChange('hasInstruments', value);
    },
    [filters.hasInstruments, onHasInstrumentsChange, onFilterChange]
  );

  // ✅ Has Instruments - Radio buttons for single selection (UX improvement)
  const renderHasInstruments = useCallback(() => {
    // Get current selection (single value or empty)
    const currentValue =
      filters.hasInstruments.length > 0 ? filters.hasInstruments[0] : '';

    return (
      <div className="border-b border-gray-100 pb-4 mb-4 last:border-b-0 last:mb-0 bg-gray-50/30 px-3 py-3 rounded-md">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">
          {CLIENT_FILTER_LABELS.HAS_INSTRUMENTS}
          {currentValue && (
            <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium text-white bg-blue-600 rounded-full">
              1
            </span>
          )}
        </h4>
        <div
          className="space-y-2"
          role="radiogroup"
          aria-label="Has instruments filter"
        >
          <label className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-gray-50 cursor-pointer transition-colors">
            <input
              type="radio"
              name="hasInstruments"
              value=""
              checked={currentValue === ''}
              onChange={() => {
                // Clear selection
                if (onHasInstrumentsChange) {
                  onHasInstrumentsChange('');
                } else {
                  // Clear all hasInstruments filters
                  filters.hasInstruments.forEach(val => {
                    onFilterChange('hasInstruments', val);
                  });
                }
              }}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              aria-label="All clients"
            />
            <span className="text-sm text-gray-700">All</span>
          </label>
          <label className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-gray-50 cursor-pointer transition-colors">
            <input
              type="radio"
              name="hasInstruments"
              value={HAS_INSTRUMENTS_FILTER_OPTIONS.HAS}
              checked={currentValue === HAS_INSTRUMENTS_FILTER_OPTIONS.HAS}
              onChange={() =>
                handleHasInstrumentsChange(HAS_INSTRUMENTS_FILTER_OPTIONS.HAS)
              }
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              aria-label="Filter clients with instruments"
            />
            <span className="text-sm text-gray-700">Has Instruments</span>
          </label>
          <label className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-gray-50 cursor-pointer transition-colors">
            <input
              type="radio"
              name="hasInstruments"
              value={HAS_INSTRUMENTS_FILTER_OPTIONS.NO}
              checked={currentValue === HAS_INSTRUMENTS_FILTER_OPTIONS.NO}
              onChange={() =>
                handleHasInstrumentsChange(HAS_INSTRUMENTS_FILTER_OPTIONS.NO)
              }
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              aria-label="Filter clients without instruments"
            />
            <span className="text-sm text-gray-700">No Instruments</span>
          </label>
        </div>
      </div>
    );
  }, [
    filters.hasInstruments,
    handleHasInstrumentsChange,
    onHasInstrumentsChange,
    onFilterChange,
  ]);

  // ✅ Optimized filter groups - use field-level deps instead of entire filters object
  const handleLastNameToggle = useCallback(
    (value: string) => onFilterChange('last_name', value),
    [onFilterChange]
  );
  const handleFirstNameToggle = useCallback(
    (value: string) => onFilterChange('first_name', value),
    [onFilterChange]
  );
  const handleContactNumberToggle = useCallback(
    (value: string) => onFilterChange('contact_number', value),
    [onFilterChange]
  );
  const handleEmailToggle = useCallback(
    (value: string) => onFilterChange('email', value),
    [onFilterChange]
  );
  const handleTagsToggle = useCallback(
    (value: string) => onFilterChange('tags', value),
    [onFilterChange]
  );
  const handleInterestToggle = useCallback(
    (value: string) => onFilterChange('interest', value),
    [onFilterChange]
  );

  const filterGroups: FilterGroupConfig[] = useMemo(
    () => [
      {
        key: 'last_name',
        title: CLIENT_FILTER_LABELS.LAST_NAME,
        options: filterOptions.lastNames,
        selectedValues: filters.last_name,
        onToggle: handleLastNameToggle,
        searchable: filterOptions.lastNames.length > 5,
        defaultCollapsed: false,
        variant: 'card',
        maxHeight: 'max-h-48',
      },
      {
        key: 'first_name',
        title: CLIENT_FILTER_LABELS.FIRST_NAME,
        options: filterOptions.firstNames,
        selectedValues: filters.first_name,
        onToggle: handleFirstNameToggle,
        searchable: filterOptions.firstNames.length > 5,
        defaultCollapsed: false,
        variant: 'card',
        maxHeight: 'max-h-48',
      },
      {
        key: 'contact_number',
        title: CLIENT_FILTER_LABELS.CONTACT_NUMBER,
        options: filterOptions.contactNumbers,
        selectedValues: filters.contact_number,
        onToggle: handleContactNumberToggle,
        searchable: filterOptions.contactNumbers.length > 5,
        defaultCollapsed: false,
        variant: 'card',
        maxHeight: 'max-h-48',
      },
      {
        key: 'email',
        title: CLIENT_FILTER_LABELS.EMAIL,
        options: filterOptions.emails,
        selectedValues: filters.email,
        onToggle: handleEmailToggle,
        searchable: filterOptions.emails.length > 5,
        defaultCollapsed: false,
        variant: 'card',
        maxHeight: 'max-h-48',
      },
      {
        key: 'tags',
        title: CLIENT_FILTER_LABELS.TAGS,
        options: filterOptions.tags,
        selectedValues: filters.tags,
        onToggle: handleTagsToggle,
        searchable: false,
        defaultCollapsed: false,
        variant: 'card',
        maxHeight: 'max-h-48',
      },
      {
        key: 'interest',
        title: CLIENT_FILTER_LABELS.INTEREST,
        options: filterOptions.interests,
        selectedValues: filters.interest,
        onToggle: handleInterestToggle,
        searchable: false,
        defaultCollapsed: false,
        variant: 'card',
        maxHeight: 'max-h-48',
      },
      {
        key: 'hasInstruments',
        title: CLIENT_FILTER_LABELS.HAS_INSTRUMENTS,
        options: [],
        selectedValues: filters.hasInstruments,
        onToggle: () => {},
        customRender: renderHasInstruments,
      },
    ],
    [
      // ✅ Field-level deps instead of entire filters object
      filterOptions.lastNames,
      filterOptions.firstNames,
      filterOptions.contactNumbers,
      filterOptions.emails,
      filterOptions.tags,
      filterOptions.interests,
      filters.last_name,
      filters.first_name,
      filters.contact_number,
      filters.email,
      filters.tags,
      filters.interest,
      filters.hasInstruments,
      handleLastNameToggle,
      handleFirstNameToggle,
      handleContactNumberToggle,
      handleEmailToggle,
      handleTagsToggle,
      handleInterestToggle,
      renderHasInstruments,
    ]
  );

  return (
    <PageFilters
      isOpen={isOpen}
      onClose={onClose}
      filterGroups={filterGroups}
      activeFiltersCount={activeFiltersCount}
      onClearAllFilters={onClearAllFilters}
      title={CLIENT_FILTER_LABELS.FILTER_OPTIONS}
      footerText={CLIENT_FILTER_LABELS.ACTIVE_FILTERS}
      dataTestId="filters-panel"
    />
  );
}
