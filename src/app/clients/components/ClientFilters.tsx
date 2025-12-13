'use client';
// src/app/clients/components/ClientFilters.tsx

import { useCallback, useMemo } from 'react';
import { ClientFilterOptions, FilterState } from '../types';
import {
  HAS_INSTRUMENTS_FILTER_OPTIONS,
  CLIENT_FILTER_LABELS,
} from '../constants';
import PageFilters, {
  FilterGroupConfig,
} from '@/components/common/PageFilters';

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

  // Has Instruments 커스텀 렌더링
  const renderHasInstruments = useCallback(() => {
    return (
      <div className="border-b border-gray-100 pb-3 last:border-b-0">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">
          {CLIENT_FILTER_LABELS.HAS_INSTRUMENTS}
          {filters.hasInstruments.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium text-white bg-blue-600 rounded-full">
              {filters.hasInstruments.length}
            </span>
          )}
        </h4>
        <div className="space-y-2">
          <label className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-gray-50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={filters.hasInstruments.includes(
                HAS_INSTRUMENTS_FILTER_OPTIONS.HAS
              )}
              onChange={() =>
                handleHasInstrumentsChange(HAS_INSTRUMENTS_FILTER_OPTIONS.HAS)
              }
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              aria-label="Filter clients with instruments"
            />
            <span className="text-sm text-gray-700">악기 보유</span>
          </label>
          <label className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-gray-50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={filters.hasInstruments.includes(
                HAS_INSTRUMENTS_FILTER_OPTIONS.NO
              )}
              onChange={() =>
                handleHasInstrumentsChange(HAS_INSTRUMENTS_FILTER_OPTIONS.NO)
              }
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              aria-label="Filter clients without instruments"
            />
            <span className="text-sm text-gray-700">악기 미보유</span>
          </label>
        </div>
      </div>
    );
  }, [filters.hasInstruments, handleHasInstrumentsChange]);

  // 필터 그룹 설정
  const filterGroups: FilterGroupConfig[] = useMemo(
    () => [
      {
        key: 'last_name',
        title: CLIENT_FILTER_LABELS.LAST_NAME,
        options: filterOptions.lastNames,
        selectedValues: filters.last_name,
        onToggle: value => onFilterChange('last_name', value),
        searchable: filterOptions.lastNames.length > 5,
        defaultCollapsed: false,
        maxHeight: 'max-h-48',
      },
      {
        key: 'first_name',
        title: CLIENT_FILTER_LABELS.FIRST_NAME,
        options: filterOptions.firstNames,
        selectedValues: filters.first_name,
        onToggle: value => onFilterChange('first_name', value),
        searchable: filterOptions.firstNames.length > 5,
        defaultCollapsed: false,
        maxHeight: 'max-h-48',
      },
      {
        key: 'contact_number',
        title: CLIENT_FILTER_LABELS.CONTACT_NUMBER,
        options: filterOptions.contactNumbers,
        selectedValues: filters.contact_number,
        onToggle: value => onFilterChange('contact_number', value),
        searchable: filterOptions.contactNumbers.length > 5,
        defaultCollapsed: false,
        maxHeight: 'max-h-48',
      },
      {
        key: 'email',
        title: CLIENT_FILTER_LABELS.EMAIL,
        options: filterOptions.emails,
        selectedValues: filters.email,
        onToggle: value => onFilterChange('email', value),
        searchable: filterOptions.emails.length > 5,
        defaultCollapsed: false,
        maxHeight: 'max-h-48',
      },
      {
        key: 'tags',
        title: CLIENT_FILTER_LABELS.TAGS,
        options: filterOptions.tags,
        selectedValues: filters.tags,
        onToggle: value => onFilterChange('tags', value),
        searchable: false,
        defaultCollapsed: false,
        maxHeight: 'max-h-48',
      },
      {
        key: 'interest',
        title: CLIENT_FILTER_LABELS.INTEREST,
        options: filterOptions.interests,
        selectedValues: filters.interest,
        onToggle: value => onFilterChange('interest', value),
        searchable: false,
        defaultCollapsed: false,
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
    [filterOptions, filters, onFilterChange, renderHasInstruments]
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
