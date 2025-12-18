import { useMemo, useState, useCallback, useEffect } from 'react';
import type { DateRange, FilterOperator } from '@/types/search';
import type { MaintenanceTask } from '@/types';
import { usePageFilters } from '@/hooks/usePageFilters';
import type { CalendarFilters, CalendarFilterOptions } from '../types';
import { EMPTY_CALENDAR_FILTERS } from '../types';
import {
  filterCalendarTasks,
  countActiveCalendarFilters,
} from '../utils/calendarFilterUtils';
import { sortTasks } from '../utils/searchUtils';

const DEFAULT_PAGE_SIZE = 10;

interface UseCalendarFiltersOptions {
  tasks: MaintenanceTask[];
  instrumentsMap: Map<
    string,
    {
      type: string | null;
      maker: string | null;
      ownership: string | null;
      serial_number?: string | null;
      clientId?: string | null;
      clientName?: string | null;
    }
  >;
  ownershipMap?: Map<
    string,
    {
      ownership: string | null;
    }
  >;
  filterOptions: CalendarFilterOptions;
  pageSize?: number;
}

export const useCalendarFilters = ({
  tasks,
  instrumentsMap,
  ownershipMap,
  pageSize = DEFAULT_PAGE_SIZE,
}: UseCalendarFiltersOptions) => {
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [filterOperator, setFilterOperator] = useState<FilterOperator>('AND');
  const [currentPage, setCurrentPage] = useState(1);

  // Use shared usePageFilters hook for search, sort, and base filter state
  // Note: We use usePageFilters primarily for state management (searchTerm, sortBy, filters).
  // The customFieldFilter is provided for usePageFilters' internal flow, but we apply our own
  // filtering logic in filteredTasks useMemo below for full control over the filter pipeline
  // (including dateRange, filterOperator, and searchTerm integration).
  const baseFilters = usePageFilters<MaintenanceTask>({
    items: tasks,
    searchFields: [], // We use customFilter instead
    initialSortBy: 'date',
    initialSortOrder: 'asc',
    debounceMs: 300,
    initialFilters: EMPTY_CALENDAR_FILTERS as unknown as Record<
      string,
      unknown
    >,
    resetFilters: () =>
      EMPTY_CALENDAR_FILTERS as unknown as Record<string, unknown>,
    enableDateRange: false, // Manage separately
    enableFilterOperator: false, // Manage separately
    syncWithURL: true, // URL 쿼리 파라미터와 상태 동기화
    urlParamMapping: {
      searchTerm: 'search',
    },
    // Remove customFieldFilter - filtering is done in filteredTasks useMemo below
    customFilter: () => true,
  });

  // Handle filter changes (single source of truth - no synchronization needed)
  const handleStatusFilterChange = useCallback(
    (status: string) => {
      baseFilters.setFilters((prev: Record<string, unknown>) => {
        const filters = prev as unknown as CalendarFilters;
        return {
          ...filters,
          status: status as CalendarFilters['status'],
        } as unknown as Record<string, unknown>;
      });
    },
    [baseFilters]
  );

  const handleOwnershipFilterChange = useCallback(
    (ownership: string) => {
      baseFilters.setFilters((prev: Record<string, unknown>) => {
        const filters = prev as unknown as CalendarFilters;
        return {
          ...filters,
          owner: ownership as CalendarFilters['owner'],
        } as unknown as Record<string, unknown>;
      });
    },
    [baseFilters]
  );

  // Handle quick filter changes (type, priority, status, owner)
  const handleSearchFilterChange = useCallback(
    (filter: 'type' | 'priority' | 'status' | 'owner', value: string) => {
      baseFilters.setFilters((prev: Record<string, unknown>) => {
        const filters = prev as unknown as CalendarFilters;
        return {
          ...filters,
          [filter]: value,
        } as unknown as Record<string, unknown>;
      });
    },
    [baseFilters]
  );

  // Extract filter fields for optimized useMemo deps (avoid re-renders on unrelated changes)
  const filters = baseFilters.filters as unknown as CalendarFilters;
  const filterType = filters.type;
  const filterPriority = filters.priority;
  const filterStatus = filters.status;
  const filterOwner = filters.owner;
  const searchTerm = baseFilters.searchTerm;
  const sortByValue = baseFilters.sortBy;
  const sortOrderValue = baseFilters.sortOrder;

  // Apply all filters including search term
  // Optimized: use individual filter fields instead of entire filters object
  // Wrap resolvedOwnershipMap in useMemo to prevent dependency changes
  const resolvedOwnershipMap = useMemo(
    () => ownershipMap ?? new Map<string, { ownership: string | null }>(),
    [ownershipMap]
  );

  const filteredTasks = useMemo(() => {
    const calendarFilters: CalendarFilters = {
      type: filterType,
      priority: filterPriority,
      status: filterStatus,
      owner: filterOwner,
    };
    let filtered = filterCalendarTasks(
      tasks,
      calendarFilters,
      dateRange,
      filterOperator,
      instrumentsMap,
      searchTerm,
      resolvedOwnershipMap
    );

    // Apply sorting (use baseFilters sortBy/sortOrder, but map to calendar sort format)
    const sortBy =
      sortByValue === 'date' ||
      sortByValue === 'priority' ||
      sortByValue === 'status' ||
      sortByValue === 'type'
        ? (sortByValue as 'date' | 'priority' | 'status' | 'type')
        : 'date';

    filtered = sortTasks(filtered, sortBy, sortOrderValue);

    return filtered;
  }, [
    tasks,
    filterType,
    filterPriority,
    filterStatus,
    filterOwner,
    dateRange,
    filterOperator,
    instrumentsMap,
    searchTerm,
    resolvedOwnershipMap,
    sortByValue,
    sortOrderValue,
  ]);

  // Calculate pagination
  const totalCount = filteredTasks.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // FIXED: Reset to page 1 when filters change using stable filter key (avoids expensive JSON.stringify)
  // Use individual filter fields as dependencies instead of entire filters object for better performance
  // Note: filterType, filterPriority, filterStatus, filterOwner are already extracted above
  const filterKey = useMemo(() => {
    return [
      filterType,
      filterPriority,
      filterStatus,
      filterOwner,
      searchTerm,
      dateRange?.from ?? '',
      dateRange?.to ?? '',
      filterOperator,
    ].join('|');
  }, [
    filterType,
    filterPriority,
    filterStatus,
    filterOwner,
    searchTerm,
    dateRange?.from,
    dateRange?.to,
    filterOperator,
  ]);

  useEffect(() => {
    if (currentPage > 1) setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Get paginated tasks
  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredTasks.slice(startIndex, endIndex);
  }, [filteredTasks, currentPage, pageSize]);

  // Check if any filters are active
  // Optimized: use individual filter fields instead of entire filters object
  const hasActiveFilters = useMemo(() => {
    const calendarFilters: CalendarFilters = {
      type: filterType,
      priority: filterPriority,
      status: filterStatus,
      owner: filterOwner,
    };
    return (
      countActiveCalendarFilters(calendarFilters, dateRange, searchTerm) > 0
    );
  }, [
    filterType,
    filterPriority,
    filterStatus,
    filterOwner,
    dateRange,
    searchTerm,
  ]);

  // Reset all filters
  const resetFilters = useCallback(() => {
    baseFilters.clearAllFilters();
    setDateRange(null);
    setFilterOperator('AND');
    setCurrentPage(1);
  }, [baseFilters]);

  // Handle page change
  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    },
    [totalPages]
  );

  // Map sortBy to calendar sort format
  const sortBy =
    sortByValue === 'date' ||
    sortByValue === 'priority' ||
    sortByValue === 'status' ||
    sortByValue === 'type'
      ? (sortByValue as 'date' | 'priority' | 'status' | 'type')
      : 'date';

  return {
    // State (single source of truth)
    filterStatus: filterStatus,
    filterOwnership: filterOwner,
    searchTerm: searchTerm,
    searchFilters: {
      type: filterType,
      priority: filterPriority,
      status: filterStatus,
      owner: filterOwner,
    },
    sortBy,
    sortOrder: sortOrderValue,
    dateRange,
    filterOperator,
    hasActiveFilters,
    filteredTasks,
    paginatedTasks,

    // Pagination state
    currentPage,
    totalPages,
    totalCount,
    pageSize,

    // Actions (single source of truth - no synchronization needed)
    setFilterStatus: handleStatusFilterChange,
    setFilterOwnership: handleOwnershipFilterChange,
    setSearchTerm: baseFilters.setSearchTerm,
    setSearchFilters: handleSearchFilterChange,
    setSortBy: (sortBy: 'date' | 'priority' | 'status' | 'type') => {
      baseFilters.handleColumnSort(sortBy);
    },
    setSortOrder: () => {
      // Toggle sort order by calling handleColumnSort with current sortBy
      // handleColumnSort toggles order when same field is clicked
      const currentSortBy =
        baseFilters.sortBy === 'date' ||
        baseFilters.sortBy === 'priority' ||
        baseFilters.sortBy === 'status' ||
        baseFilters.sortBy === 'type'
          ? (baseFilters.sortBy as 'date' | 'priority' | 'status' | 'type')
          : 'date';
      baseFilters.handleColumnSort(currentSortBy);
    },
    setDateRange,
    setFilterOperator,
    resetFilters,
    setPage: handlePageChange,
  };
};
