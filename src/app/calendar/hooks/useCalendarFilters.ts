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
  filterOptions: CalendarFilterOptions;
  pageSize?: number;
}

export const useCalendarFilters = ({
  tasks,
  instrumentsMap,
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
    customFieldFilter: (items, filters) => {
      const calendarFilters = filters as unknown as CalendarFilters;
      // Apply filters (but not search term - that's handled separately below)
      return filterCalendarTasks(
        items,
        calendarFilters,
        dateRange,
        filterOperator,
        instrumentsMap,
        '' // No search term here
      );
    },
    customFilter: () => true,
  });

  // Synchronize status filter between searchFilters.status and filterStatus
  const handleStatusFilterChange = useCallback(
    (status: string) => {
      baseFilters.setFilters(prev => {
        const filters = prev as unknown as CalendarFilters;
        return {
          ...filters,
          filterStatus: status as CalendarFilters['filterStatus'],
          status: status as CalendarFilters['status'], // Sync quick filter too
        } as unknown as Record<string, unknown>;
      });
    },
    [baseFilters]
  );

  // Handle quick filter changes (type, priority, status, owner)
  const handleSearchFilterChange = useCallback(
    (filter: 'type' | 'priority' | 'status' | 'owner', value: string) => {
      baseFilters.setFilters(prev => {
        const filters = prev as unknown as CalendarFilters;
        const updated = {
          ...filters,
          [filter]: value,
        } as CalendarFilters;

        // Sync status filter if status changed
        if (filter === 'status') {
          updated.filterStatus = value as CalendarFilters['filterStatus'];
        }
        // Sync ownership filter if owner changed
        if (filter === 'owner') {
          updated.filterOwnership = value as CalendarFilters['filterOwnership'];
        }

        return updated as unknown as Record<string, unknown>;
      });
    },
    [baseFilters]
  );

  // Apply all filters including search term
  const filteredTasks = useMemo(() => {
    const calendarFilters = baseFilters.filters as unknown as CalendarFilters;
    let filtered = filterCalendarTasks(
      tasks,
      calendarFilters,
      dateRange,
      filterOperator,
      instrumentsMap,
      baseFilters.searchTerm
    );

    // Apply sorting (use baseFilters sortBy/sortOrder, but map to calendar sort format)
    const sortBy =
      baseFilters.sortBy === 'date' ||
      baseFilters.sortBy === 'priority' ||
      baseFilters.sortBy === 'status' ||
      baseFilters.sortBy === 'type'
        ? (baseFilters.sortBy as 'date' | 'priority' | 'status' | 'type')
        : 'date';

    filtered = sortTasks(filtered, sortBy, baseFilters.sortOrder);

    return filtered;
  }, [
    tasks,
    baseFilters.filters,
    dateRange,
    filterOperator,
    instrumentsMap,
    baseFilters.searchTerm,
    baseFilters.sortBy,
    baseFilters.sortOrder,
  ]);

  // Calculate pagination
  const totalCount = filteredTasks.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // FIXED: Reset to page 1 when filters change using stable filter key (avoids expensive JSON.stringify)
  const filterKey = useMemo(() => {
    const f = baseFilters.filters as unknown as CalendarFilters;
    return [
      f.type,
      f.priority,
      f.status,
      f.owner,
      f.filterStatus,
      f.filterOwnership,
      baseFilters.searchTerm,
      dateRange?.from ?? '',
      dateRange?.to ?? '',
      filterOperator,
    ].join('|');
  }, [baseFilters.filters, baseFilters.searchTerm, dateRange, filterOperator]);

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
  const hasActiveFilters = useMemo(() => {
    const calendarFilters = baseFilters.filters as unknown as CalendarFilters;
    return (
      countActiveCalendarFilters(
        calendarFilters,
        dateRange,
        baseFilters.searchTerm
      ) > 0
    );
  }, [baseFilters.filters, dateRange, baseFilters.searchTerm]);

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
    baseFilters.sortBy === 'date' ||
    baseFilters.sortBy === 'priority' ||
    baseFilters.sortBy === 'status' ||
    baseFilters.sortBy === 'type'
      ? (baseFilters.sortBy as 'date' | 'priority' | 'status' | 'type')
      : 'date';

  const calendarFilters = baseFilters.filters as unknown as CalendarFilters;

  return {
    // State
    filterStatus: calendarFilters.filterStatus,
    filterOwnership: calendarFilters.filterOwnership,
    searchTerm: baseFilters.searchTerm,
    searchFilters: {
      type: calendarFilters.type,
      priority: calendarFilters.priority,
      status: calendarFilters.status,
      owner: calendarFilters.owner,
    },
    sortBy,
    sortOrder: baseFilters.sortOrder,
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

    // Actions
    setFilterStatus: handleStatusFilterChange,
    setFilterOwnership: (ownership: string) => {
      baseFilters.setFilters(prev => {
        const filters = prev as unknown as CalendarFilters;
        return {
          ...filters,
          filterOwnership: ownership as CalendarFilters['filterOwnership'],
          owner: ownership as CalendarFilters['owner'], // Sync quick filter
        } as unknown as Record<string, unknown>;
      });
    },
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
