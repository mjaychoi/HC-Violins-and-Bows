/**
 * 범용 페이지 필터 훅
 * clients, dashboard, calendar 등 모든 페이지에서 공통으로 사용할 수 있는 필터링 패턴을 제공합니다.
 */

'use client';

import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
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
    const parts = value.split('..');
    if (parts.length === 2) {
      const from = parts[0] || undefined;
      const to = parts[1] || undefined;
      if (!from && !to) return null;
      return { from, to };
    }
  }

  return null;
}

function serializeDateRange(range: DateRange | null): string[] | null {
  if (!range?.from && !range?.to) return null;
  return [range.from ?? '', range.to ?? ''];
}

function normalizeFilterOperator(value: unknown): FilterOperator {
  return value === 'OR' ? 'OR' : 'AND';
}

function normalizeFilterStateValue(value: unknown): string | string[] | null {
  if (value == null) return null;

  if (Array.isArray(value)) {
    const sanitized = value
      .map(item => {
        if (typeof item === 'string') return item;
        if (typeof item === 'number' || typeof item === 'boolean') {
          return String(item);
        }
        return null;
      })
      .filter(
        (item): item is string => typeof item === 'string' && item !== ''
      );

    return sanitized.length > 0 ? sanitized : null;
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
    if (!arrayKeys.has(key) && isRecord(normalized[key])) {
      continue;
    }

    const value = normalizeFilterStateValue(normalized[key]);

    if (arrayKeys.has(key)) {
      if (Array.isArray(value)) {
        normalized[key] = value;
      } else if (typeof value === 'string') {
        normalized[key] = value === '' ? [] : [value];
      } else {
        normalized[key] = [];
      }
    } else if (value !== null) {
      normalized[key] = value;
    } else {
      normalized[key] = '';
    }
  }

  return normalized;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

export interface PageFiltersConfig<T extends object> {
  items: T[];
  filterOptionsConfig?: Record<string, 'simple' | 'array'>;
  searchFields?: (keyof T)[];
  customFilter?: (item: T, term: string) => boolean;
  customFieldFilter?: (
    items: T[],
    filters: Record<string, unknown>,
    meta?: { filterOperator?: FilterOperator }
  ) => T[];
  initialSortBy?: keyof T | string;
  initialSortOrder?: 'asc' | 'desc';
  debounceMs?: number;
  initialFilters?: Record<string, unknown>;
  resetFilters?: () => Record<string, unknown>;
  enableDateRange?: boolean;
  dateField?: keyof T;
  enableFilterOperator?: boolean;
  syncWithURL?: boolean;
  urlParamMapping?: Record<string, string>;
  syncOperatorWithURL?: boolean;
}

export interface UsePageFiltersReturn<T> {
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
  filteredItems: T[];
  filterOptions: Record<string, string[]>;
  getActiveFiltersCount: () => number;
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

    for (const key of filterKeys) {
      keys.push(key);
    }

    if (enableFilterOperator && syncOperatorWithURL) {
      keys.push('filterOperator');
    }

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

  const urlFilterStateKey = stableStringify(
    filterKeys.map(key => [key, urlState[key]])
  );

  const initialFiltersMerged: Record<string, unknown> = useMemo(() => {
    if (!syncWithURL) return initialFilters;

    const merged: Record<string, unknown> = { ...initialFilters };
    const urlFilterEntries = JSON.parse(urlFilterStateKey) as Array<
      [string, unknown]
    >;

    for (const [key, value] of urlFilterEntries) {
      if (value != null) {
        merged[key] = value;
      }
    }

    return merged;
  }, [syncWithURL, initialFilters, urlFilterStateKey]);

  const normalizedInitialFilters = useMemo(
    () =>
      normalizeFiltersRecord(initialFiltersMerged, filterKeys, arrayFilterKeys),
    [initialFiltersMerged, filterKeys, arrayFilterKeys]
  );
  const normalizedInitialFiltersKey = stableStringify(normalizedInitialFilters);

  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFiltersState] = useState<Record<string, unknown>>(
    normalizedInitialFilters
  );
  const filtersStateKeyRef = useRef(stableStringify(normalizedInitialFilters));
  filtersStateKeyRef.current = stableStringify(filters);
  const [dateRange, setDateRangeState] = useState<DateRange | null>(
    enableDateRange ? initialDateRange : null
  );
  const [filterOperator, setFilterOperatorState] =
    useState<FilterOperator>(initialOperator);
  const filtersUrlStateKey = stableStringify(
    filterKeys.map(key => [key, normalizeFilterStateValue(filters[key])])
  );

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

  const setDateRange = useCallback((range: DateRange | null) => {
    setDateRangeState(range);
  }, []);

  const setFilterOperator = useCallback((operator: FilterOperator) => {
    setFilterOperatorState(operator);
  }, []);

  /**
   * URL → state 역방향 동기화
   */
  useEffect(() => {
    if (!syncWithURL) return;

    const nextSearch =
      urlState.searchTerm != null ? String(urlState.searchTerm) : '';

    setSearchTerm(prev => (prev === nextSearch ? prev : nextSearch));
  }, [syncWithURL, urlState.searchTerm]);

  useEffect(() => {
    if (!syncWithURL || !enableDateRange) return;

    const nextDateRange = parseDateRange(urlState.dateRange);

    setDateRangeState(prev =>
      stableStringify(prev ?? null) === stableStringify(nextDateRange ?? null)
        ? prev
        : nextDateRange
    );
  }, [syncWithURL, enableDateRange, urlState.dateRange]);

  useEffect(() => {
    if (!syncWithURL) return;

    const nextFilters = JSON.parse(normalizedInitialFiltersKey) as Record<
      string,
      unknown
    >;

    if (filtersStateKeyRef.current === normalizedInitialFiltersKey) return;

    setFiltersState(prev =>
      stableStringify(prev) === stableStringify(nextFilters)
        ? prev
        : nextFilters
    );
  }, [syncWithURL, normalizedInitialFiltersKey]);

  useEffect(() => {
    if (!syncWithURL || !enableFilterOperator || !syncOperatorWithURL) return;

    const nextOperator = normalizeFilterOperator(urlState.filterOperator);

    setFilterOperatorState(prev =>
      prev === nextOperator ? prev : nextOperator
    );
  }, [
    syncWithURL,
    enableFilterOperator,
    syncOperatorWithURL,
    urlState.filterOperator,
  ]);

  /**
   * state → URL 동기화
   */
  const debouncedSearchTerm = useDebounce(searchTerm, debounceMs);

  useEffect(() => {
    if (!syncWithURL) return;
    updateURLState({ searchTerm: debouncedSearchTerm || null });
  }, [debouncedSearchTerm, syncWithURL, updateURLState]);

  useEffect(() => {
    if (!syncWithURL || !enableDateRange) return;
    updateURLState({ dateRange: serializeDateRange(dateRange) });
  }, [dateRange, syncWithURL, enableDateRange, updateURLState]);

  useEffect(() => {
    if (!syncWithURL) return;

    if (filtersUrlStateKey === urlFilterStateKey) return;

    const patch: Record<string, string | string[] | null> = {};

    for (const key of filterKeys) {
      patch[key] = normalizeFilterStateValue(filters[key]);
    }

    updateURLState(patch);
  }, [
    filters,
    syncWithURL,
    updateURLState,
    filterKeys,
    filtersUrlStateKey,
    urlFilterStateKey,
  ]);

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

  const filterOptions: Record<string, string[]> = useMemo(() => {
    if (!filterOptionsConfig) return {};
    return buildFilterOptionsFromFields<T>(items, filterOptionsConfig);
  }, [items, filterOptionsConfig]);

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

  const dateFiltered = useMemo(() => {
    if (!enableDateRange || !dateRange) return fieldFiltered;

    const from = dateRange.from || '1900-01-01';
    const to = dateRange.to || '9999-12-31';

    return fieldFiltered.filter((item: unknown) => {
      const itemRecord = item as Record<string, unknown>;
      const itemDate = itemRecord[dateField as string];

      if (!itemDate || typeof itemDate !== 'string') return false;

      const itemDateStr = itemDate.split('T')[0];
      return itemDateStr >= from && itemDateStr <= to;
    }) as T[];
  }, [fieldFiltered, dateRange, enableDateRange, dateField]);

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

  const clearAllFilters = useCallback(() => {
    const nextFilters = resetFilters ? resetFilters() : initialFilters;

    setFilters(nextFilters);
    setSearchTerm('');

    if (enableDateRange) {
      setDateRangeState(null);
    }

    if (enableFilterOperator) {
      setFilterOperatorState('AND');
    }

    if (syncWithURL) {
      clearURL();
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

  const handleColumnSort = useCallback(
    (column: keyof T | string) => {
      handleSort(column as string);
    },
    [handleSort]
  );

  const getActiveFiltersCount = useCallback(() => {
    let count = countActiveFilters(filters);

    if (searchTerm) count += 1;

    if (enableDateRange && (dateRange?.from || dateRange?.to)) {
      count += 1;
    }

    if (enableFilterOperator && filterOperator === 'OR') {
      count += 1;
    }

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

    filteredItems,
    filterOptions,
    getActiveFiltersCount,

    handleFilterChange,
    clearAllFilters,
    handleColumnSort,
    getSortArrow: getSortArrowWrapper,
  };
}
