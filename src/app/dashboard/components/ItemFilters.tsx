'use client';

import React, { useMemo, useCallback } from 'react';
import { Instrument, ClientInstrument } from '@/types';
import { getPriceRange } from '../utils/dashboardUtils';
import { DateRange, FilterOperator } from '@/types/search';
import PageFilters, {
  FilterGroupConfig,
} from '@/components/common/PageFilters';
import { DashboardFilters, DashboardArrayFilterKeys } from '../types';
import {
  DASHBOARD_FILTER_LABELS,
  DASHBOARD_FILTER_KEYS,
  DASHBOARD_FILTER_LABEL_STRINGS,
  DASHBOARD_DATE_FIELD_LABELS,
  buildDashboardFilterOptions,
} from '../constants';

// Enriched items type (Instrument with optional clients array)
type EnrichedInstrument = Instrument & {
  clients?: ClientInstrument[];
};

interface ItemFiltersProps {
  items: Instrument[] | EnrichedInstrument[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filters: DashboardFilters;
  onFilterChange: (
    filterType: DashboardArrayFilterKeys,
    value: string | boolean
  ) => void;
  onPriceRangeChange: (field: 'min' | 'max', value: string) => void;
  onClearFilters: () => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  activeFiltersCount: number;
  // 고급 검색
  dateRange?: DateRange | null;
  onDateRangeChange?: (range: DateRange | null) => void;
  filterOperator: FilterOperator; // Required - managed by parent hook
  onOperatorChange?: (operator: FilterOperator) => void;
  // 클라이언트 데이터 (ownership 필터에서 UUID를 이름으로 변환하기 위해)
  clients?: Array<{
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  }>;
}

export default function ItemFilters({
  items,
  searchTerm,
  onSearchChange,
  filters,
  onFilterChange,
  onPriceRangeChange,
  onClearFilters,
  showFilters,
  onToggleFilters,
  activeFiltersCount,
  dateRange,
  onDateRangeChange,
  filterOperator,
  onOperatorChange,
  clients = [],
}: ItemFiltersProps) {
  // filterOperator is managed by parent (useDashboardFilters) to avoid default value duplication
  // FIXED: Memoize buildDashboardFilterOptions to avoid recomputing on every render
  // buildDashboardFilterOptions only needs Instrument fields, not clients array
  const filterOptions = useMemo(
    () => buildDashboardFilterOptions(items as Instrument[]),
    [items]
  );

  // 클라이언트 ID → 이름 매핑 생성 (ownership 필터에서 사용)
  const clientsMap = useMemo(() => {
    const map = new Map<string, string>();
    if (clients && clients.length > 0) {
      clients.forEach(client => {
        if (client && client.id) {
          const name =
            `${client.first_name || ''} ${client.last_name || ''}`.trim() ||
            client.email ||
            client.id;
          map.set(client.id, name);
        }
      });
    }
    return map;
  }, [clients]);

  // UUID를 클라이언트 이름으로 변환하는 함수
  const getOwnershipLabel = useCallback(
    (uuid: string): string => {
      if (!uuid) return uuid;

      // UUID 형식인지 확인
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidPattern.test(uuid)) {
        const clientName = clientsMap.get(uuid);
        if (clientName && clientName !== uuid) {
          return clientName;
        }
        // 클라이언트를 찾을 수 없으면 UUID 반환
        return uuid;
      }
      // UUID가 아니면 그대로 반환 (문자열 ownership)
      return uuid;
    },
    [clientsMap]
  );
  const priceRange = getPriceRange(items);
  const hasActiveFilters =
    activeFiltersCount > 0 ||
    Boolean(searchTerm) ||
    Boolean(dateRange?.from) ||
    Boolean(dateRange?.to);

  // 활성 필터 배지
  const activeBadges = useMemo(() => {
    const badges = [
      ...filters.status.map(value => ({
        key: `${DASHBOARD_FILTER_KEYS.STATUS}-${value}`,
        label: `${DASHBOARD_FILTER_LABELS.status}: ${value}`,
        remove: () => onFilterChange(DASHBOARD_FILTER_KEYS.STATUS, value),
      })),
      ...filters.maker.map(value => ({
        key: `${DASHBOARD_FILTER_KEYS.MAKER}-${value}`,
        label: `${DASHBOARD_FILTER_LABELS.maker}: ${value}`,
        remove: () => onFilterChange(DASHBOARD_FILTER_KEYS.MAKER, value),
      })),
      ...filters.type.map(value => ({
        key: `${DASHBOARD_FILTER_KEYS.TYPE}-${value}`,
        label: `${DASHBOARD_FILTER_LABELS.type}: ${value}`,
        remove: () => onFilterChange(DASHBOARD_FILTER_KEYS.TYPE, value),
      })),
      ...filters.subtype.map(value => ({
        key: `${DASHBOARD_FILTER_KEYS.SUBTYPE}-${value}`,
        label: `${DASHBOARD_FILTER_LABELS.subtype}: ${value}`,
        remove: () => onFilterChange(DASHBOARD_FILTER_KEYS.SUBTYPE, value),
      })),
      ...filters.ownership.map(value => ({
        key: `${DASHBOARD_FILTER_KEYS.OWNERSHIP}-${value}`,
        label: `${DASHBOARD_FILTER_LABELS.ownership}: ${getOwnershipLabel(value)}`,
        remove: () => onFilterChange(DASHBOARD_FILTER_KEYS.OWNERSHIP, value),
      })),
    ];

    if (filters.priceRange.min || filters.priceRange.max) {
      badges.push({
        key: DASHBOARD_FILTER_KEYS.PRICE_RANGE,
        label: `${DASHBOARD_FILTER_LABEL_STRINGS.PRICE_RANGE}: ${filters.priceRange.min || '0'} - ${filters.priceRange.max || 'max'}`,
        remove: () => {
          onPriceRangeChange('min', '');
          onPriceRangeChange('max', '');
        },
      });
    }

    if (searchTerm) {
      badges.push({
        key: 'search',
        label: `${DASHBOARD_FILTER_LABEL_STRINGS.SEARCH}: ${searchTerm}`,
        remove: () => onSearchChange(''),
      });
    }

    if (dateRange?.from || dateRange?.to) {
      badges.push({
        key: 'dateRange',
        label: `${DASHBOARD_FILTER_LABEL_STRINGS.DATE_RANGE}: ${dateRange.from || '시작'} ~ ${dateRange.to || '종료'}`,
        remove: () => onDateRangeChange?.(null),
      });
    }

    return badges;
  }, [
    filters,
    searchTerm,
    dateRange,
    onFilterChange,
    onPriceRangeChange,
    onSearchChange,
    onDateRangeChange,
    getOwnershipLabel,
  ]);

  // Price Range 커스텀 렌더링
  const renderPriceRange = useCallback(() => {
    return (
      <div className="border-b border-gray-100 pb-3 last:border-b-0">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">
          가격 범위
          {(filters.priceRange.min || filters.priceRange.max) && (
            <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium text-white bg-blue-600 rounded-full">
              1
            </span>
          )}
        </h4>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="최소"
              value={filters.priceRange.min}
              onChange={e => onPriceRangeChange('min', e.target.value)}
              className="flex-1 h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
              aria-label="Minimum price"
            />
            <span
              className="text-sm font-medium text-gray-500"
              aria-hidden="true"
            >
              ~
            </span>
            <input
              type="number"
              placeholder="최대"
              value={filters.priceRange.max}
              onChange={e => onPriceRangeChange('max', e.target.value)}
              className="flex-1 h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
              aria-label="Maximum price"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              Range: ${priceRange.min.toLocaleString()} - $
              {priceRange.max.toLocaleString()}
            </div>
            {(filters.priceRange.min || filters.priceRange.max) && (
              <button
                onClick={() => {
                  onPriceRangeChange('min', '');
                  onPriceRangeChange('max', '');
                }}
                className="text-xs text-gray-600 hover:text-red-600 hover:underline transition-colors"
                type="button"
                aria-label="Clear price range"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }, [filters.priceRange, onPriceRangeChange, priceRange]);

  // 필터 그룹 설정
  const filterGroups: FilterGroupConfig[] = useMemo(
    () => [
      {
        key: DASHBOARD_FILTER_KEYS.STATUS,
        title: DASHBOARD_FILTER_LABELS.status,
        options: filterOptions.status,
        selectedValues: filters.status,
        onToggle: value => onFilterChange(DASHBOARD_FILTER_KEYS.STATUS, value),
        searchable: filterOptions.status.length > 10,
        defaultCollapsed: false,
        variant: 'card',
        maxHeight: 'max-h-[160px]', // 5개 항목 높이 (약 32px * 5)
      },
      {
        key: DASHBOARD_FILTER_KEYS.MAKER,
        title: DASHBOARD_FILTER_LABELS.maker,
        options: filterOptions.maker,
        selectedValues: filters.maker,
        onToggle: value => onFilterChange(DASHBOARD_FILTER_KEYS.MAKER, value),
        searchable: true,
        defaultCollapsed: false,
        variant: 'card',
        maxHeight: 'max-h-[160px]', // 5개 항목 높이 (약 32px * 5)
      },
      {
        key: DASHBOARD_FILTER_KEYS.TYPE,
        title: DASHBOARD_FILTER_LABELS.type,
        options: filterOptions.type,
        selectedValues: filters.type,
        onToggle: value => onFilterChange(DASHBOARD_FILTER_KEYS.TYPE, value),
        searchable: filterOptions.type.length > 10,
        defaultCollapsed: false,
        variant: 'card',
        maxHeight: 'max-h-[160px]', // 5개 항목 높이 (약 32px * 5)
      },
      {
        key: DASHBOARD_FILTER_KEYS.SUBTYPE,
        title: DASHBOARD_FILTER_LABELS.subtype,
        options: filterOptions.subtype,
        selectedValues: filters.subtype,
        onToggle: value => onFilterChange(DASHBOARD_FILTER_KEYS.SUBTYPE, value),
        searchable: filterOptions.subtype.length > 10,
        defaultCollapsed: false,
        variant: 'card',
        maxHeight: 'max-h-[160px]', // 5개 항목 높이 (약 32px * 5)
      },
      {
        key: DASHBOARD_FILTER_KEYS.OWNERSHIP,
        title: DASHBOARD_FILTER_LABELS.ownership,
        options: filterOptions.ownership,
        selectedValues: filters.ownership,
        onToggle: value =>
          onFilterChange(DASHBOARD_FILTER_KEYS.OWNERSHIP, value),
        searchable: true,
        defaultCollapsed: false,
        variant: 'card',
        maxHeight: 'max-h-[160px]', // 5개 항목 높이 (약 32px * 5)
        getLabel: getOwnershipLabel, // UUID를 클라이언트 이름으로 변환
      },
      {
        key: DASHBOARD_FILTER_KEYS.PRICE_RANGE,
        title: DASHBOARD_FILTER_LABEL_STRINGS.PRICE_RANGE,
        options: [],
        selectedValues: [],
        onToggle: () => {},
        customRender: renderPriceRange,
      },
    ],
    [
      filterOptions,
      filters,
      onFilterChange,
      renderPriceRange,
      getOwnershipLabel,
    ]
  );

  // FIXED: Change "Apply" to "Done" since filters apply immediately (live update)
  return (
    <PageFilters
      isOpen={showFilters}
      onClose={onToggleFilters}
      filterGroups={filterGroups}
      activeFiltersCount={activeFiltersCount}
      onClearAllFilters={onClearFilters}
      title={DASHBOARD_FILTER_LABEL_STRINGS.FILTER_OPTIONS}
      activeBadges={hasActiveFilters ? activeBadges : undefined}
      advancedSearchConfig={
        onDateRangeChange
          ? {
              dateRange: dateRange || null,
              onDateRangeChange,
              operator: filterOperator,
              onOperatorChange: onOperatorChange || undefined,
              dateFields: [
                {
                  field: 'created_at',
                  label: DASHBOARD_DATE_FIELD_LABELS.CREATED_AT,
                },
                {
                  field: 'updated_at',
                  label: DASHBOARD_DATE_FIELD_LABELS.UPDATED_AT,
                },
              ],
              onReset: () => onDateRangeChange(null),
            }
          : undefined
      }
      footerText={DASHBOARD_FILTER_LABEL_STRINGS.ACTIVE_FILTERS}
      clearButtonText={DASHBOARD_FILTER_LABEL_STRINGS.CLEAR_ALL}
      applyButtonText="Done"
      showSearchBar={false}
      onToggleFilters={onToggleFilters}
      dataTestId="filters-panel"
    />
  );
}
