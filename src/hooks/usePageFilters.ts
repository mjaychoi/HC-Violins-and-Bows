/**
 * 범용 페이지 필터 훅
 * clients, dashboard, calendar 등 모든 페이지에서 공통으로 사용할 수 있는 필터링 패턴을 제공합니다.
 *
 * 업데이트 포인트(핵심):
 * - ✅ URL 동기화 키에 filters 동적 키 포함(초기/변경 모두 반영 가능)
 * - ✅ syncWithURL일 때 initialFilters도 URL 값과 머지(우선순위: URL > initialFilters)
 * - ✅ URL → state 역방향 동기화(뒤로가기/공유링크/외부 변경) 지원
 * - ✅ dateRange URL 직렬화/역직렬화 일관화 (from/to 단일값도 처리)
 * - ✅ enableFilterOperator일 때 operator도 URL 동기화 옵션 제공(기본 off, mapping 지원)
 * - ✅ clearAllFilters 시 URL/상태/정렬/검색 일관 초기화
 */

'use client';

import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  type SetStateAction,
} from 'react';
import { useFilterSort } from './useFilterSort';
import {
  countActiveFilters,
  buildFilterOptionsFromFields,
} from '@/utils/filterHelpers';
import { useURLState } from './useURLState';
import { useDebounce } from './useDebounce';
import type { FilterOperator, DateRange } from '@/types/search';

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function parseDateRange(value: unknown): DateRange | null {
  // Expected: [from, to] or {from,to} or "YYYY-MM-DD..YYYY-MM-DD" (optional)
  if (!value) return null;

  if (Array.isArray(value)) {
    const [from, to] = value as Array<string | undefined | null>;
    return {
      from: from || undefined,
      to: to || undefined,
    };
  }

  if (isRecord(value)) {
    const from = typeof value.from === 'string' ? value.from : undefined;
    const to = typeof value.to === 'string' ? value.to : undefined;
    if (!from && !to) return null;
    return { from, to };
  }

  if (typeof value === 'string') {
    // e.g., "2025-01-01..2025-01-31"
    const m = value.split('..');
    if (m.length === 2) {
      const from = m[0] || undefined;
      const to = m[1] || undefined;
      if (!from && !to) return null;
      return { from, to };
    }
  }

  return null;
}

function serializeDateRange(range: DateRange | null): string[] | null {
  if (!range?.from && !range?.to) return null;
  return [range?.from ?? '', range?.to ?? ''];
}

function normalizeFilterOperator(v: unknown): FilterOperator {
  return v === 'OR' ? 'OR' : 'AND';
}

function normalizeFilterStateValue(value: unknown): string | string[] | null {
  if (value == null) return null;

  if (Array.isArray(value)) {
    const sanitized = value
      .map(item => {
        if (typeof item === 'string') return item;
        if (typeof item === 'number' || typeof item === 'boolean')
          return String(item);
        return null;
      })
      .filter(
        (item): item is string => typeof item === 'string' && item !== ''
      );

    return sanitized;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}

function normalizeFiltersRecord(
  record: Record<string, unknown>,
  keys: string[],
  arrayKeys: ReadonlySet<string>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...record };
  for (const key of keys) {
    const value = normalizeFilterStateValue(normalized[key]);
    if (arrayKeys.has(key)) {
      if (Array.isArray(value)) {
        normalized[key] = value;
      } else if (typeof value === 'string') {
        normalized[key] = value === '' ? [] : [value];
      } else if (value == null) {
        normalized[key] = [];
      } else {
        normalized[key] = [String(value)];
      }
    } else if (value !== null) {
      normalized[key] = value;
    }
  }
  return normalized;
}

export interface PageFiltersConfig<T extends object> {
  items: T[];
  filterOptionsConfig?: Record<string, 'simple' | 'array'>;
  searchFields?: (keyof T)[];
  customFilter?: (item: T, term: string) => boolean;

  /**
   * searchTerm 제외한 필드 필터만 적용
   */
  customFieldFilter?: (
    items: T[],
    filters: Record<string, unknown>,
    meta?: { filterOperator?: FilterOperator }
  ) => T[];

  initialSortBy?: keyof T | string;
  initialSortOrder?: 'asc' | 'desc';
  debounceMs?: number;

  /**
   * 초기 필터 상태 (페이지별 기본값)
   * syncWithURL일 때 URL 값이 있으면 URL이 우선합니다.
   */
  initialFilters?: Record<string, unknown>;

  resetFilters?: () => Record<string, unknown>;

  enableDateRange?: boolean;
  dateField?: keyof T;

  enableFilterOperator?: boolean;

  syncWithURL?: boolean;
  urlParamMapping?: Record<string, string>;

  /**
   * ✅ OPTIONAL: filterOperator도 URL에 저장할지
   * @default false
   */
  syncOperatorWithURL?: boolean;
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
    syncOperatorWithURL = false,
  } = config;

  /**
   * URL 키 목록 구성:
   * - searchTerm, dateRange, operator (+ filters 동적 키)
   */
  const filterKeys = useMemo(
    () => Object.keys(initialFilters),
    [initialFilters]
  );

  const arrayFilterKeys = useMemo(
    () =>
      new Set<string>(
        filterKeys.filter(key => Array.isArray(initialFilters[key]))
      ),
    [filterKeys, initialFilters]
  );

  const urlKeys = useMemo(() => {
    if (!syncWithURL) return [];
    const keys: string[] = ['searchTerm'];

    if (enableDateRange) keys.push('dateRange');

    // ✅ filters 키들을 URL state key로 추가
    // - initialFilters 기반이 기본이지만, 필터가 동적으로 늘어나는 경우 setFilters 시에도 반영되도록
    //   아래 effect에서 동기화 처리
    for (const k of filterKeys) keys.push(k);

    if (enableFilterOperator && syncOperatorWithURL)
      keys.push('filterOperator');

    return Array.from(new Set(keys));
  }, [
    syncWithURL,
    enableDateRange,
    filterKeys,
    enableFilterOperator,
    syncOperatorWithURL,
  ]);

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
      filterOperator: urlParamMapping.filterOperator || 'op',
      ...urlParamMapping,
    },
  });

  /**
   * ✅ URL에서 초기값 파싱
   * - filters: URL이 우선, 없으면 initialFilters
   * - dateRange: URL이 있으면 우선
   * - operator: enable+sync일 때 URL 반영
   */
  const initialSearchTerm =
    syncWithURL && urlState.searchTerm != null
      ? String(urlState.searchTerm)
      : '';

  const initialDateRange: DateRange | null =
    syncWithURL && enableDateRange ? parseDateRange(urlState.dateRange) : null;

  const initialOperator: FilterOperator =
    enableFilterOperator && syncWithURL && syncOperatorWithURL
      ? normalizeFilterOperator(urlState.filterOperator)
      : 'AND';

  const initialFiltersMerged: Record<string, unknown> = useMemo(() => {
    if (!syncWithURL) return initialFilters;

    const merged: Record<string, unknown> = { ...initialFilters };

    // urlState에서 initialFilters key들만 머지(안전)
    for (const k of filterKeys) {
      if (urlState[k] !== undefined) {
        merged[k] = urlState[k];
      }
    }
    return merged;
  }, [syncWithURL, initialFilters, urlState, filterKeys]);

  // State
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [showFilters, setShowFilters] = useState(false);
  const normalizedInitialFilters = useMemo(
    () =>
      normalizeFiltersRecord(initialFiltersMerged, filterKeys, arrayFilterKeys),
    [initialFiltersMerged, filterKeys, arrayFilterKeys]
  );
  const [filters, setFiltersState] = useState<Record<string, unknown>>(
    normalizedInitialFilters
  );
  const [dateRange, setDateRange] = useState<DateRange | null>(
    enableDateRange ? initialDateRange : null
  );
  const [filterOperator, setFilterOperator] =
    useState<FilterOperator>(initialOperator);

  const setFilters = useCallback(
    (updater: SetStateAction<Record<string, unknown>>) => {
      setFiltersState(prev => {
        const next =
          typeof updater === 'function'
            ? (
                updater as (
                  prevState: Record<string, unknown>
                ) => Record<string, unknown>
              )(prev)
            : updater;
        return normalizeFiltersRecord(next, filterKeys, arrayFilterKeys);
      });
    },
    [filterKeys, arrayFilterKeys]
  );

  // 🔒 URL에서 들어온 값으로 state를 "한 번" 초기화했는데,
  // 뒤로가기/링크공유 등으로 urlState가 바뀌면 state도 맞춰야 함.
  /**
   * URL 동기화: searchTerm (debounce)
   */
  const debouncedSearchTerm = useDebounce(searchTerm, debounceMs);
  useEffect(() => {
    if (!syncWithURL) return;
    updateURLState({ searchTerm: debouncedSearchTerm || null });
  }, [debouncedSearchTerm, syncWithURL, updateURLState]);

  /**
   * URL 동기화: dateRange
   */
  useEffect(() => {
    if (!syncWithURL || !enableDateRange) return;
    updateURLState({ dateRange: serializeDateRange(dateRange) });
  }, [dateRange, syncWithURL, enableDateRange, updateURLState]);

  /**
   * URL 동기화: filters (known keys)
   * - 필터가 바뀌면 URL도 업데이트
   */
  useEffect(() => {
    if (!syncWithURL) return;

    const patch: Record<string, string | string[] | null> = {};
    for (const k of filterKeys) {
      patch[k] = normalizeFilterStateValue(filters[k]);
    }
    updateURLState(patch);
  }, [filters, syncWithURL, updateURLState, filterKeys]);

  /**
   * URL 동기화: filterOperator (옵션)
   */
  useEffect(() => {
    if (!syncWithURL || !enableFilterOperator || !syncOperatorWithURL) return;
    updateURLState({ filterOperator });
  }, [
    filterOperator,
    syncWithURL,
    enableFilterOperator,
    syncOperatorWithURL,
    updateURLState,
  ]);

  /**
   * filterOptions 생성
   */
  const filterOptions: Record<string, string[]> = useMemo(() => {
    if (!filterOptionsConfig) return {};
    return buildFilterOptionsFromFields<T>(items, filterOptionsConfig);
  }, [items, filterOptionsConfig]);

  /**
   * field filtering (searchTerm 제외)
   */
  const fieldFiltered = useMemo(() => {
    if (customFieldFilter) {
      return customFieldFilter(
        items,
        filters,
        enableFilterOperator ? { filterOperator } : undefined
      ) as T[];
    }
    return items;
  }, [items, filters, customFieldFilter, enableFilterOperator, filterOperator]);

  /**
   * date range filtering
   */
  const dateFiltered = useMemo(() => {
    if (!enableDateRange || !dateRange) return fieldFiltered;

    const from = dateRange.from || '1900-01-01';
    const to = dateRange.to || '9999-12-31';

    return fieldFiltered.filter((item: unknown) => {
      const itemRecord = item as Record<string, unknown>;
      const itemDate = itemRecord[dateField as string];

      if (!itemDate || typeof itemDate !== 'string') return false;

      const itemDateStr = itemDate.split('T')[0]; // YYYY-MM-DD
      return itemDateStr >= from && itemDateStr <= to;
    }) as T[];
  }, [fieldFiltered, dateRange, enableDateRange, dateField]);

  /**
   * useFilterSort (search + sort)
   */
  const filterSortResult = useFilterSort<UnknownRecord>(
    dateFiltered as UnknownRecord[],
    {
      searchFields:
        searchFields as unknown as string[] as (keyof UnknownRecord)[],
      externalSearchTerm: searchTerm,
      initialSortBy: initialSortBy as string,
      initialSortOrder,
      debounceMs,
      customFilter: customFilter
        ? (item: UnknownRecord, term: string) =>
            customFilter(item as unknown as T, term)
        : undefined,
    }
  );

  const filteredItems = filterSortResult.items as T[];
  const handleSort = filterSortResult.handleSort;
  const getSortArrow = filterSortResult.getSortArrow;
  const sortBy = filterSortResult.sortBy;
  const sortOrder = filterSortResult.sortOrder;

  /**
   * handleFilterChange
   * - array 필터는 toggle
   * - single 필터는 replace
   */
  const handleFilterChange = useCallback(
    (category: string, value: string) => {
      setFilters(prev => {
        const current = prev[category];
        if (Array.isArray(current)) {
          const includes = current.includes(value);
          const nextArr = includes
            ? current.filter(v => v !== value)
            : [...current, value];
          return { ...prev, [category]: nextArr };
        }
        return { ...prev, [category]: value };
      });
    },
    [setFilters]
  );

  /**
   * clearAllFilters
   */
  const clearAllFilters = useCallback(() => {
    const nextFilters = resetFilters ? resetFilters() : initialFilters;

    setFilters(nextFilters);
    setSearchTerm('');
    if (enableDateRange) setDateRange(null);
    if (enableFilterOperator) setFilterOperator('AND');

    if (syncWithURL) {
      clearURL();
      // clearURL가 내부적으로 replaceState만 하고 urlState를 즉시 반영하지 않을 수 있어
      // 이 훅의 state는 위 setX로 이미 초기화됨
    }
  }, [
    resetFilters,
    initialFilters,
    enableDateRange,
    enableFilterOperator,
    syncWithURL,
    clearURL,
    setFilters,
  ]);

  /**
   * column sort
   */
  const handleColumnSort = useCallback(
    (column: keyof T | string) => {
      handleSort(column as string);
    },
    [handleSort]
  );

  /**
   * active filters count
   */
  const getActiveFiltersCount = useCallback(() => {
    let count = countActiveFilters(filters);
    if (searchTerm) count += 1;
    if (enableDateRange && (dateRange?.from || dateRange?.to)) count += 1;
    if (enableFilterOperator && filterOperator === 'OR') count += 1; // optional: operator도 활성으로 카운트
    return count;
  }, [
    filters,
    searchTerm,
    dateRange,
    enableDateRange,
    enableFilterOperator,
    filterOperator,
  ]);

  const getSortArrowWrapper = useCallback(
    (field: keyof T | string) => getSortArrow(field as string),
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

    // Computed
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
