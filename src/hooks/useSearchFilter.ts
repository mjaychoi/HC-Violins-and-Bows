import { useState, useCallback, useMemo } from 'react';
import { useDebounce } from './useDebounce';

interface UseSearchFilterOptions<T> {
  data: T[];
  searchFields: (keyof T)[];
  debounceMs?: number;
  initialSearchTerm?: string;
  customFilter?: (item: T, searchTerm: string) => boolean;
}

interface UseSearchFilterReturn<T> {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  debouncedSearchTerm: string;
  filteredData: T[];
  clearSearch: () => void;
  hasResults: boolean;
  resultCount: number;
}

export function useSearchFilter<T>({
  data,
  searchFields,
  debounceMs = 200,
  initialSearchTerm = '',
  customFilter,
}: UseSearchFilterOptions<T>): UseSearchFilterReturn<T> {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const debouncedSearchTerm = useDebounce(searchTerm, debounceMs);

  const filteredData = useMemo(() => {
    if (!debouncedSearchTerm.trim()) {
      return data;
    }

    const searchLower = debouncedSearchTerm.toLowerCase();

    return data.filter(item => {
      if (customFilter) {
        return customFilter(item, debouncedSearchTerm);
      }

      return searchFields.some(field => {
        const value = item[field];
        if (value === null || value === undefined) return false;

        const stringValue = String(value).toLowerCase();
        return stringValue.includes(searchLower);
      });
    });
  }, [data, debouncedSearchTerm, searchFields, customFilter]);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
  }, []);

  const hasResults = filteredData.length > 0;
  const resultCount = filteredData.length;

  return {
    searchTerm,
    setSearchTerm,
    debouncedSearchTerm,
    filteredData,
    clearSearch,
    hasResults,
    resultCount,
  };
}

// 특화된 검색 훅들
export function useClientSearch<T extends Record<string, unknown>>(
  data: T[],
  searchFields: (keyof T)[] = [
    'first_name',
    'last_name',
    'email',
  ] as (keyof T)[]
) {
  return useSearchFilter({
    data,
    searchFields,
    debounceMs: 200,
    customFilter: (item: T, searchTerm: string) => {
      const searchLower = searchTerm.toLowerCase();
      return searchFields.some(field => {
        const value = item[field];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(searchLower);
      });
    },
  });
}

export function useInstrumentSearch<T extends Record<string, unknown>>(
  data: T[],
  searchFields: (keyof T)[] = ['maker', 'type', 'name'] as (keyof T)[]
) {
  return useSearchFilter({
    data,
    searchFields,
    debounceMs: 200,
    customFilter: (item: T, searchTerm: string) => {
      const searchLower = searchTerm.toLowerCase();
      return searchFields.some(field => {
        const value = item[field];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(searchLower);
      });
    },
  });
}

export function useConnectionSearch<T extends Record<string, unknown>>(
  data: T[],
  searchFields: (keyof T)[] = ['notes'] as (keyof T)[]
) {
  return useSearchFilter({
    data,
    searchFields,
    debounceMs: 200,
    customFilter: (item: T, searchTerm: string) => {
      const searchLower = searchTerm.toLowerCase();
      return searchFields.some(field => {
        const value = item[field];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(searchLower);
      });
    },
  });
}
