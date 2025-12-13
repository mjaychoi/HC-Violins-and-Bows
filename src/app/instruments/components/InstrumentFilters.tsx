'use client';

import { useMemo } from 'react';
import PageFilters, {
  FilterGroupConfig,
} from '@/components/common/PageFilters';

interface InstrumentFiltersProps {
  isOpen: boolean;
  onClose: () => void;
  filters: {
    maker: string[];
    status: string[];
  };
  filterOptions: {
    makers: string[];
    statuses: string[];
  };
  onFilterChange: (category: 'maker' | 'status', value: string) => void;
  onClearAllFilters: () => void;
  activeFiltersCount: number;
}

const INSTRUMENT_FILTER_LABELS = {
  FILTER_OPTIONS: '필터 옵션',
  MAKER: '제조사',
  STATUS: '상태',
  ACTIVE_FILTERS: (count: number) => `검색/필터 ${count}개 적용 중`,
  CLEAR_ALL: '전체 초기화',
} as const;

export default function InstrumentFilters({
  isOpen,
  onClose,
  filters,
  filterOptions,
  onFilterChange,
  onClearAllFilters,
  activeFiltersCount,
}: InstrumentFiltersProps) {
  const filterGroups: FilterGroupConfig[] = useMemo(
    () => [
      {
        key: 'maker',
        title: INSTRUMENT_FILTER_LABELS.MAKER,
        options: filterOptions.makers,
        selectedValues: filters.maker,
        onToggle: value => onFilterChange('maker', value),
        searchable: true,
        defaultCollapsed: false,
        variant: 'list',
        maxHeight: 'max-h-48',
      },
      {
        key: 'status',
        title: INSTRUMENT_FILTER_LABELS.STATUS,
        options: filterOptions.statuses,
        selectedValues: filters.status,
        onToggle: value => onFilterChange('status', value),
        searchable: false,
        defaultCollapsed: false,
        variant: 'list',
        maxHeight: 'max-h-48',
      },
    ],
    [filterOptions, filters, onFilterChange]
  );

  return (
    <PageFilters
      isOpen={isOpen}
      onClose={onClose}
      filterGroups={filterGroups}
      activeFiltersCount={activeFiltersCount}
      onClearAllFilters={onClearAllFilters}
      title={INSTRUMENT_FILTER_LABELS.FILTER_OPTIONS}
      footerText={INSTRUMENT_FILTER_LABELS.ACTIVE_FILTERS}
      clearButtonText={INSTRUMENT_FILTER_LABELS.CLEAR_ALL}
      dataTestId="instrument-filters-panel"
    />
  );
}
