// src/app/clients/hooks/useFilters.ts
import { useMemo, useState, useCallback, useEffect } from 'react';
import { Client } from '@/types';
import {
  filterClients,
  EMPTY_FILTER_STATE,
  handleFilterChange as updateFilterState,
  clearAllFilters as resetFilterState,
} from '../utils';
import { usePageFilters } from '@/hooks/usePageFilters';
import { ClientFilterOptions, FilterState } from '../types';

export const useFilters = (
  clients: Client[],
  clientsWithInstruments?: Set<string>
) => {
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20; // Clients per page
  // usePageFilters를 기반으로 필터링 로직 구현
  const baseFilters = usePageFilters<Record<string, unknown>>({
    items: clients as unknown as Record<string, unknown>[],
    filterOptionsConfig: {
      last_name: 'simple',
      first_name: 'simple',
      contact_number: 'simple',
      email: 'simple',
      tags: 'array',
      interest: 'simple',
    },
    searchFields: [
      'first_name',
      'last_name',
      'contact_number',
      'email',
      'interest',
      'note',
      'client_number',
    ] as string[],
    initialSortBy: 'created_at',
    initialSortOrder: 'desc',
    debounceMs: 300,
    initialFilters: EMPTY_FILTER_STATE as Record<string, unknown>,
    resetFilters: () => resetFilterState() as Record<string, unknown>,
    syncWithURL: true, // URL 쿼리 파라미터와 상태 동기화
    urlParamMapping: {
      searchTerm: 'search',
    },
    // ✅ FIXED: customFieldFilter는 필터만 담당, searchTerm은 usePageFilters.customFilter가 처리
    // searchTerm을 빈 문자열로 전달하는 이유: 검색은 customFilter에서 처리되므로
    // filterClients는 필터 조건만 적용하면 됨
    customFieldFilter: (items, filters) => {
      const clients = items as unknown as Client[];
      // searchTerm은 usePageFilters.customFilter가 처리하므로 여기서는 빈 문자열
      const result = filterClients(clients, '', filters as FilterState, {
        clientsWithInstruments,
      });
      return result as unknown as Record<string, unknown>[];
    },
    customFilter: (item, term) => {
      const client = item as unknown as Client;
      const t = term.toLowerCase();
      const parts = [
        client.first_name,
        client.last_name,
        client.contact_number,
        client.email,
        client.interest,
        client.note,
        client.client_number,
        Array.isArray(client.tags) ? client.tags.join(' ') : '',
      ]
        .filter(Boolean)
        .map(v => String(v).toLowerCase());
      return parts.some(v => v.includes(t));
    },
  });

  // 필터 옵션을 ClientFilterOptions 형식으로 변환
  const filterOptions: ClientFilterOptions = useMemo(() => {
    const options = baseFilters.filterOptions;
    return {
      lastNames: options.last_name || [],
      firstNames: options.first_name || [],
      contactNumbers: options.contact_number || [],
      emails: options.email || [],
      tags: options.tags || [],
      interests: options.interest || [],
    };
  }, [baseFilters.filterOptions]);

  // handleFilterChange는 updateFilterState를 사용하도록 래핑
  const handleFilterChange = <K extends keyof FilterState>(
    category: K,
    value: string
  ) => {
    baseFilters.setFilters((prev: Record<string, unknown>) => {
      return updateFilterState(
        prev as Record<string, string[]>,
        category as string,
        value
      ) as FilterState;
    });
  };

  // Special handler for hasInstruments: single-selection filter
  // Selecting one option clears the other
  const handleHasInstrumentsChange = (value: string) => {
    baseFilters.setFilters((prev: Record<string, unknown>) => {
      const prevFilters = prev as unknown as FilterState;

      // ✅ FIXED: "clear" (empty string) always clears the filter
      if (!value) {
        return { ...prevFilters, hasInstruments: [] } as unknown as Record<
          string,
          unknown
        >;
      }

      const isCurrentlySelected = prevFilters.hasInstruments.includes(value);
      // If already selected, clear it; otherwise, set it (and clear the other)
      const updated: FilterState = {
        ...prevFilters,
        hasInstruments: isCurrentlySelected ? [] : [value],
      };
      return updated as unknown as Record<string, unknown>;
    });
  };

  // Pagination calculations
  const totalCount = baseFilters.filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // ✅ FIXED: pagination reset effect 개선 - filters 참조 안정성 보장
  // baseFilters.filters가 매 렌더마다 새 객체면 페이지가 계속 1로 튈 수 있음
  const filtersKey = useMemo(
    () => JSON.stringify(baseFilters.filters),
    [baseFilters.filters]
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [baseFilters.searchTerm, filtersKey]);

  // Paginated clients
  const paginatedClients = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return baseFilters.filteredItems.slice(
      startIndex,
      endIndex
    ) as unknown as Client[];
  }, [baseFilters.filteredItems, currentPage, pageSize]);

  // Handle page change
  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    },
    [totalPages]
  );

  // ✅ FIXED: getActiveFiltersCount - hasInstruments is already counted by baseFilters
  // hasInstruments is in filters object, so countActiveFilters already counts it
  // No need to add it separately
  const getActiveFiltersCount = useCallback(() => {
    return baseFilters.getActiveFiltersCount();
  }, [baseFilters]);

  return {
    // State
    searchTerm: baseFilters.searchTerm,
    setSearchTerm: baseFilters.setSearchTerm,
    sortBy: baseFilters.sortBy,
    sortOrder: baseFilters.sortOrder,
    showFilters: baseFilters.showFilters,
    setShowFilters: baseFilters.setShowFilters,
    filters: baseFilters.filters as FilterState,
    setFilters: baseFilters.setFilters,

    // Computed values
    filteredClients: baseFilters.filteredItems as unknown as Client[],
    paginatedClients,
    filterOptions,

    // Actions
    handleFilterChange,
    handleHasInstrumentsChange,
    clearAllFilters: baseFilters.clearAllFilters,
    handleColumnSort: baseFilters.handleColumnSort,
    getSortArrow: baseFilters.getSortArrow,
    getActiveFiltersCount,

    // Pagination
    currentPage,
    totalPages,
    totalCount,
    pageSize,
    setPage: handlePageChange,
  };
};
