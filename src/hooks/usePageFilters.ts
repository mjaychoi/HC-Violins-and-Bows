/**
 * 범용 페이지 필터 훅
 * clients, dashboard, calendar 등 모든 페이지에서 공통으로 사용할 수 있는 필터링 패턴을 제공합니다.
 */

'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useFilterSort } from './useFilterSort';
import {
  countActiveFilters,
  buildFilterOptionsFromFields,
} from '@/utils/filterHelpers';
import { useURLState } from './useURLState';
import { useDebounce } from './useDebounce';
import type { FilterOperator, DateRange } from '@/types/search';

export interface PageFiltersConfig<T extends object> {
  /**
   * 필터링할 데이터 배열
   */
  items: T[];

  /**
   * 필터 옵션 생성을 위한 필드 설정
   */
  filterOptionsConfig?: Record<string, 'simple' | 'array'>;

  /**
   * 검색 필드 목록 (useFilterSort에 전달)
   */
  searchFields?: (keyof T)[];

  /**
   * 커스텀 필터 함수 (useFilterSort에 전달)
   */
  customFilter?: (item: T, term: string) => boolean;

  /**
   * 필드 기반 필터링 함수 (searchTerm 제외한 필터만 적용)
   * 필터링 로직이 복잡한 경우 사용
   */
  customFieldFilter?: (items: T[], filters: Record<string, unknown>) => T[];

  /**
   * 초기 정렬 필드
   */
  initialSortBy?: keyof T | string;

  /**
   * 초기 정렬 순서
   */
  initialSortOrder?: 'asc' | 'desc';

  /**
   * 검색 debounce 시간 (ms)
   */
  debounceMs?: number;

  /**
   * 초기 필터 상태
   */
  initialFilters?: Record<string, unknown>;

  /**
   * 필터 초기화 함수 (EMPTY_FILTER_STATE 같은 것)
   */
  resetFilters?: () => Record<string, unknown>;

  /**
   * 날짜 범위 필터 사용 여부
   */
  enableDateRange?: boolean;

  /**
   * 날짜 범위 필터에서 사용할 필드명
   * @default 'created_at'
   */
  dateField?: keyof T;

  /**
   * 필터 연산자 사용 여부 (AND/OR)
   * NOTE: If enabled, filterOperator must be passed to customFieldFilter or useFilterSort
   * for actual filtering logic. This hook only provides the state.
   */
  enableFilterOperator?: boolean;

  /**
   * URL 쿼리 파라미터와 상태 동기화 여부
   * @default false
   */
  syncWithURL?: boolean;

  /**
   * URL 파라미터 이름 매핑 (syncWithURL이 true일 때 사용)
   * { stateKey: 'urlParamName' }
   */
  urlParamMapping?: Record<string, string>;
}

export interface UsePageFiltersReturn<T> {
  // State
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  sortBy: keyof T | string;
  sortOrder: 'asc' | 'desc';
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
  filters: Record<string, unknown>;
  setFilters: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  dateRange: DateRange | null;
  setDateRange: (range: DateRange | null) => void;
  filterOperator: FilterOperator;
  setFilterOperator: (operator: FilterOperator) => void;

  // Computed values
  filteredItems: T[];
  filterOptions: Record<string, string[]>;
  getActiveFiltersCount: () => number;

  // Actions
  handleFilterChange: (category: string, value: string) => void;
  clearAllFilters: () => void;
  handleColumnSort: (column: keyof T | string) => void;
  getSortArrow: (field: keyof T | string) => string;
}

/**
 * 범용 페이지 필터 훅
 *
 * @example
 * ```tsx
 * const {
 *   searchTerm,
 *   setSearchTerm,
 *   filteredItems,
 *   filterOptions,
 *   handleFilterChange,
 *   clearAllFilters,
 * } = usePageFilters({
 *   items: clients,
 *   filterOptionsConfig: {
 *     last_name: 'simple',
 *     first_name: 'simple',
 *     tags: 'array',
 *   },
 *   searchFields: ['first_name', 'last_name', 'email'],
 *   initialSortBy: 'created_at',
 *   initialSortOrder: 'desc',
 * });
 * ```
 */
export function usePageFilters<T extends object = Record<string, unknown>>(
  config: PageFiltersConfig<T>
): UsePageFiltersReturn<T> {
  const {
    items,
    filterOptionsConfig,
    searchFields = [],
    customFilter,
    customFieldFilter,
    initialSortBy = 'created_at',
    initialSortOrder = 'desc',
    debounceMs = 300,
    initialFilters = {},
    resetFilters,
    enableDateRange = false,
    dateField = 'created_at' as keyof T,
    enableFilterOperator = false,
    syncWithURL = false,
    urlParamMapping = {},
  } = config;

  // URL 상태 동기화 (syncWithURL이 true일 때만)
  const urlKeys = useMemo(() => {
    if (!syncWithURL) return [];
    const keys = ['searchTerm'];
    if (enableDateRange) keys.push('dateRange');
    // 필터 키는 동적으로 추가 (filters 객체의 키들)
    return keys;
  }, [syncWithURL, enableDateRange]);

  // useURLState는 항상 호출 (React Hooks 규칙 준수)
  // enabled가 false일 때는 내부에서 아무것도 하지 않음
  const {
    urlState,
    updateURLState,
    clearURLState: clearURL,
  } = useURLState({
    enabled: syncWithURL,
    keys: urlKeys,
    paramMapping: {
      searchTerm: urlParamMapping.searchTerm || 'search',
      dateRange: urlParamMapping.dateRange || 'dateRange',
      ...urlParamMapping,
    },
  });

  // URL에서 초기값 읽기 (syncWithURL이 true일 때)
  const initialSearchTerm =
    syncWithURL && urlState.searchTerm ? String(urlState.searchTerm) : '';
  const initialDateRange: DateRange | null =
    syncWithURL && enableDateRange && urlState.dateRange
      ? Array.isArray(urlState.dateRange) && urlState.dateRange.length === 2
        ? {
            from: urlState.dateRange[0] || undefined,
            to: urlState.dateRange[1] || undefined,
          }
        : null
      : null;

  // 기본 상태 (URL에서 초기값 사용)
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] =
    useState<Record<string, unknown>>(initialFilters);
  const [dateRange, setDateRange] = useState<DateRange | null>(
    enableDateRange ? initialDateRange || null : null
  );
  const [filterOperator, setFilterOperator] = useState<FilterOperator>(
    enableFilterOperator ? 'AND' : 'AND'
  );

  // URL 동기화: searchTerm 변경 시 URL 업데이트 (debounce 적용)
  // 검색어 입력 중에는 URL 업데이트를 지연시켜 불필요한 URL 변경 방지
  const debouncedSearchTerm = useDebounce(searchTerm, debounceMs);

  useEffect(() => {
    if (syncWithURL) {
      updateURLState({ searchTerm: debouncedSearchTerm || null });
    }
  }, [debouncedSearchTerm, syncWithURL, updateURLState]);

  // URL 동기화: dateRange 변경 시 URL 업데이트
  useEffect(() => {
    if (syncWithURL && enableDateRange) {
      if (dateRange?.from || dateRange?.to) {
        updateURLState({
          dateRange:
            dateRange.from && dateRange.to
              ? [dateRange.from, dateRange.to]
              : null,
        });
      } else {
        updateURLState({ dateRange: null });
      }
    }
  }, [dateRange, syncWithURL, enableDateRange, updateURLState]);

  // 필터 옵션 생성
  const filterOptions: Record<string, string[]> = useMemo(() => {
    if (!filterOptionsConfig) {
      return {};
    }
    return buildFilterOptionsFromFields<T>(items, filterOptionsConfig);
  }, [items, filterOptionsConfig]);

  // 필드 기반 필터링 (searchTerm 제외)
  // NOTE: filterOperator is available but not automatically applied here
  // If you need AND/OR logic, pass filterOperator to customFieldFilter or handle it in customFieldFilter
  const fieldFiltered = useMemo(() => {
    if (customFieldFilter) {
      // filterOperator is available but not passed by default
      // Custom filters should read filterOperator from config if needed
      return customFieldFilter(items, filters) as T[];
    }
    // 기본적으로 필드 필터가 없으면 모든 항목 반환
    return items;
  }, [items, filters, customFieldFilter]);

  // 날짜 범위 필터 적용
  const dateFiltered = useMemo(() => {
    if (!enableDateRange || !dateRange) {
      return fieldFiltered;
    }

    return fieldFiltered.filter((item: unknown) => {
      // Use dateField from config (default: 'created_at')
      const itemRecord = item as Record<string, unknown>;
      const itemDate = itemRecord[dateField as string];

      if (!itemDate || typeof itemDate !== 'string') {
        return false;
      }

      const itemDateStr = itemDate.split('T')[0]; // YYYY-MM-DD 형식으로 변환
      const from = dateRange.from || '1900-01-01';
      const to = dateRange.to || '9999-12-31';

      return itemDateStr >= from && itemDateStr <= to;
    }) as T[];
  }, [fieldFiltered, dateRange, enableDateRange, dateField]);

  // 검색 및 정렬 적용 (useFilterSort 사용)
  // Note: useFilterSort requires Record<string, unknown>, so we cast
  const filterSortResult = useFilterSort<Record<string, unknown>>(
    dateFiltered as Array<Record<string, unknown>>,
    {
      searchFields: searchFields as string[] as (keyof Record<
        string,
        unknown
      >)[],
      externalSearchTerm: searchTerm,
      initialSortBy: initialSortBy as string,
      initialSortOrder,
      debounceMs,
      customFilter: customFilter
        ? (item: Record<string, unknown>, term: string) =>
            customFilter(item as T, term)
        : undefined,
    }
  );

  const filteredItems = filterSortResult.items as T[];
  const handleSort = filterSortResult.handleSort;
  const getSortArrow = filterSortResult.getSortArrow;
  const sortBy = filterSortResult.sortBy;
  const sortOrder = filterSortResult.sortOrder;

  // 필터 변경 핸들러
  const handleFilterChange = useCallback((category: string, value: string) => {
    setFilters(prev => {
      const currentFilter = prev[category];
      if (Array.isArray(currentFilter)) {
        // 배열 타입 필터: toggleValue 로직
        const includes = currentFilter.includes(value);
        return {
          ...prev,
          [category]: includes
            ? currentFilter.filter((v: unknown) => v !== value)
            : [...currentFilter, value],
        };
      }
      // 단일 값 필터: 교체
      return {
        ...prev,
        [category]: value,
      };
    });
  }, []);

  // 모든 필터 초기화
  const clearAllFilters = useCallback(() => {
    if (resetFilters) {
      setFilters(resetFilters());
    } else {
      setFilters(initialFilters);
    }
    setSearchTerm('');
    if (enableDateRange) {
      setDateRange(null);
    }
    // URL도 초기화
    if (syncWithURL) {
      clearURL();
    }
  }, [resetFilters, initialFilters, enableDateRange, syncWithURL, clearURL]);

  // 컬럼 정렬 핸들러
  const handleColumnSort = useCallback(
    (column: keyof T | string) => {
      handleSort(column as string);
    },
    [handleSort]
  );

  // 활성 필터 수 계산
  const getActiveFiltersCount = useCallback(() => {
    let count = countActiveFilters(filters);
    if (searchTerm) count++;
    if (enableDateRange && (dateRange?.from || dateRange?.to)) count++;
    return count;
  }, [filters, searchTerm, dateRange, enableDateRange]);

  // getSortArrow 래퍼 (타입 맞추기)
  const getSortArrowWrapper = useCallback(
    (field: keyof T | string) => {
      return getSortArrow(field as string);
    },
    [getSortArrow]
  );

  return {
    // State
    searchTerm,
    setSearchTerm,
    sortBy: sortBy as keyof T | string,
    sortOrder,
    showFilters,
    setShowFilters,
    filters,
    setFilters,
    dateRange: enableDateRange ? dateRange : null,
    setDateRange: enableDateRange ? setDateRange : () => {},
    filterOperator: enableFilterOperator ? filterOperator : 'AND',
    setFilterOperator: enableFilterOperator ? setFilterOperator : () => {},

    // Computed values
    filteredItems,
    filterOptions,
    getActiveFiltersCount,

    // Actions
    handleFilterChange,
    clearAllFilters,
    handleColumnSort,
    getSortArrow: getSortArrowWrapper,
  };
}
