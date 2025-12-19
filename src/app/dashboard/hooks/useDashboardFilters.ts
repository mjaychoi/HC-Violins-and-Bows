import { useMemo, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Instrument, ClientInstrument } from '@/types';
import {
  DashboardFilters,
  DashboardFilterOptions,
  DashboardSortField,
  DashboardArrayFilterKeys,
} from '../types';
import { buildDashboardFilterOptions } from '../constants';
import { usePageFilters } from '@/hooks/usePageFilters';
import { DateRange } from '@/types/search';
import {
  filterDashboardItems,
  EMPTY_DASHBOARD_FILTERS,
} from '../utils/filterUtils';
import { logDebug } from '@/utils/logger';

// FIXED: Accept enriched items (Instrument with clients array) for HAS_CLIENTS filter
// FIXED: Use explicit ClientInstrument[] type (not optional, always present even if empty)
type EnrichedInstrument = Instrument & {
  clients: ClientInstrument[];
};

export function useDashboardFilters(
  items: EnrichedInstrument[] | Instrument[]
) {
  const searchParams = useSearchParams();
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20; // Items per page

  // URL 쿼리 파라미터에서 instrumentId와 clientId 읽기
  const instrumentIdFromURL = searchParams.get('instrumentId');
  const clientIdFromURL = searchParams.get('clientId');

  // FIXED: Normalize items to ensure all have clients array (even if empty)
  // This prevents runtime issues when filterDashboardItems expects clients for HAS_CLIENTS logic
  const normalizedItems = useMemo<EnrichedInstrument[]>(
    () =>
      (items as Array<Instrument | EnrichedInstrument>).map(it => ({
        ...it,
        clients: (it as EnrichedInstrument).clients ?? [],
      })),
    [items]
  );

  // 기본 필터/검색/정렬은 공용 훅을 사용한다.
  // dateRange를 customFieldFilter에서 직접 사용하도록 개선
  // FIXED: Type the hook to accept EnrichedInstrument for better type safety
  const baseFilters = usePageFilters<EnrichedInstrument>({
    items: normalizedItems,
    filterOptionsConfig: {
      status: 'simple',
      maker: 'simple',
      type: 'simple',
      subtype: 'simple',
      ownership: 'simple',
    },
    searchFields: ['maker', 'type', 'subtype'],
    initialSortBy: 'created_at',
    initialSortOrder: 'desc',
    debounceMs: 200,
    initialFilters: EMPTY_DASHBOARD_FILTERS,
    resetFilters: () => EMPTY_DASHBOARD_FILTERS,
    enableDateRange: false, // 직접 관리
    syncWithURL: true, // URL 쿼리 파라미터와 상태 동기화
    urlParamMapping: {
      searchTerm: 'search',
    },
    // FIXED: Don't rely on customFieldFilter closure for dateRange - apply it outside
    customFieldFilter: (items, filters) => {
      const dashboardFilters = filters as DashboardFilters;
      // Apply filters except dateRange (dateRange applied outside)
      return filterDashboardItems(
        items as Instrument[],
        dashboardFilters,
        null // dateRange is applied outside customFieldFilter
      ) as EnrichedInstrument[];
    },
    customFilter: (item, term) => {
      const lowerTerm = term.toLowerCase();
      return (
        item.maker?.toLowerCase().includes(lowerTerm) ||
        item.type?.toLowerCase().includes(lowerTerm) ||
        item.subtype?.toLowerCase().includes(lowerTerm) ||
        false
      );
    },
  });

  // FIXED: Apply dateRange outside customFieldFilter to ensure re-filtering when dateRange changes
  // This ensures React dependency graph is clear and dateRange changes trigger re-filtering
  const filteredItems = useMemo(() => {
    // Apply dateRange filter after baseFilters.filteredItems
    let items = baseFilters.filteredItems;

    if (dateRange?.from || dateRange?.to) {
      items = filterDashboardItems(
        items as Instrument[],
        baseFilters.filters as DashboardFilters,
        dateRange
      ) as EnrichedInstrument[];
    }

    // URL 쿼리 파라미터 기반 필터링: instrumentId
    if (instrumentIdFromURL) {
      items = items.filter(item => item.id === instrumentIdFromURL);
    }

    // URL 쿼리 파라미터 기반 필터링: clientId
    if (clientIdFromURL) {
      items = items.filter(item => {
        const enrichedItem = item as EnrichedInstrument;
        return (
          enrichedItem.clients?.some(
            (rel: ClientInstrument) => rel.client_id === clientIdFromURL
          ) ?? false
        );
      });
    }

    return items;
  }, [
    baseFilters.filteredItems,
    baseFilters.filters,
    dateRange,
    instrumentIdFromURL,
    clientIdFromURL,
  ]);

  // Pagination calculations
  const totalCount = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [baseFilters.searchTerm, baseFilters.filters, dateRange]);

  // Paginated items
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredItems.slice(startIndex, endIndex);
  }, [filteredItems, currentPage, pageSize]);

  // Handle page change
  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    },
    [totalPages]
  );

  // 필터 옵션 변환 (buildDashboardFilterOptions only needs Instrument fields, not clients)
  const filterOptions: DashboardFilterOptions = useMemo(
    () => buildDashboardFilterOptions(items as Instrument[]),
    [items]
  );

  // handleFilterChange는 toggleValue 로직 사용 (배열 필터 전용)
  const handleFilterChange = <K extends DashboardArrayFilterKeys>(
    filterType: K,
    value: DashboardFilters[K][number]
  ) => {
    baseFilters.setFilters(prev => {
      const dashboardFilters = prev as DashboardFilters;
      const currentFilter = dashboardFilters[filterType] as DashboardFilters[K];
      const includes = (currentFilter as Array<unknown>).some(v => v === value);
      return {
        ...dashboardFilters,
        [filterType]: includes
          ? ((currentFilter as Array<unknown>).filter(
              v => v !== value
            ) as DashboardFilters[K])
          : ([
              ...(currentFilter as Array<unknown>),
              value,
            ] as DashboardFilters[K]),
      } as unknown as Record<string, unknown>;
    });
  };

  // Price range 변경 핸들러
  const handlePriceRangeChange = (field: 'min' | 'max', value: string) => {
    baseFilters.setFilters(prev => {
      const dashboardFilters = prev as DashboardFilters;
      return {
        ...dashboardFilters,
        priceRange: {
          ...dashboardFilters.priceRange,
          [field]: value,
        },
      } as unknown as Record<string, unknown>;
    });
  };

  // 활성 필터 수 계산 (dateRange 포함) - clearAllFilters보다 먼저 정의
  const getActiveFiltersCount = useCallback(() => {
    // baseFilters.getActiveFiltersCount()는 이미 searchTerm을 포함하고 있음
    let count = baseFilters.getActiveFiltersCount();
    // baseFilters의 getActiveFiltersCount에 이미 dateRange가 포함되어 있지만
    // enableDateRange가 false이므로 수동으로 추가
    if (dateRange?.from || dateRange?.to) count++;
    return count;
  }, [baseFilters, dateRange]);

  // clearAllFilters - reset all filters and close filter panel
  const clearAllFilters = useCallback(() => {
    // DEBUG: Log before clearing
    if (
      typeof window !== 'undefined' &&
      process.env.NODE_ENV === 'development'
    ) {
      const dashboardFilters = baseFilters.filters as DashboardFilters;
      const beforeCount = getActiveFiltersCount();
      logDebug('[useDashboardFilters] clearAllFilters called', {
        before: {
          searchTerm: baseFilters.searchTerm,
          dateRange,
          activeCount: beforeCount,
          filters: {
            hasClients: dashboardFilters.hasClients.length,
            status: dashboardFilters.status.length,
            maker: dashboardFilters.maker.length,
            type: dashboardFilters.type.length,
            subtype: dashboardFilters.subtype.length,
            ownership: dashboardFilters.ownership.length,
            certificate: dashboardFilters.certificate.length,
            priceRange: dashboardFilters.priceRange,
          },
        },
      });
    }

    // Reset all base filters (including searchTerm)
    // This will reset to EMPTY_DASHBOARD_FILTERS which has all arrays empty
    baseFilters.clearAllFilters();

    // Reset dateRange (managed separately)
    setDateRange(null);

    // UX: Close filter panel when clearing filters
    baseFilters.setShowFilters(false);

    // DEBUG: Log after clearing - use setTimeout to see updated state
    if (
      typeof window !== 'undefined' &&
      process.env.NODE_ENV === 'development'
    ) {
      setTimeout(() => {
        const afterFilters = baseFilters.filters as DashboardFilters;
        const afterCount = getActiveFiltersCount();
        logDebug('[useDashboardFilters] clearAllFilters completed', {
          after: {
            searchTerm: baseFilters.searchTerm || '(empty)',
            dateRange: null,
            activeCount: afterCount,
            filters: {
              hasClients: afterFilters.hasClients.length,
              status: afterFilters.status.length,
              maker: afterFilters.maker.length,
              type: afterFilters.type.length,
              subtype: afterFilters.subtype.length,
              ownership: afterFilters.ownership.length,
              certificate: afterFilters.certificate.length,
              priceRange: afterFilters.priceRange,
            },
          },
        });
      }, 100);
    }
  }, [baseFilters, dateRange, getActiveFiltersCount]);

  // handleSort와 getSortArrow는 그대로 사용
  const handleSortProxy = (field: DashboardSortField | string) => {
    baseFilters.handleColumnSort(field);
  };

  const getSortArrowProxy = (field: DashboardSortField | string) =>
    baseFilters.getSortArrow(field);

  return {
    searchTerm: baseFilters.searchTerm,
    setSearchTerm: baseFilters.setSearchTerm,
    sortBy: baseFilters.sortBy as DashboardSortField,
    sortOrder: baseFilters.sortOrder,
    showFilters: baseFilters.showFilters,
    setShowFilters: baseFilters.setShowFilters,
    filters: baseFilters.filters as DashboardFilters,
    filteredItems,
    paginatedItems,
    filterOptions,
    handleFilterChange,
    handlePriceRangeChange,
    clearAllFilters,
    handleSort: handleSortProxy,
    getSortArrow: getSortArrowProxy,
    getActiveFiltersCount,
    // 고급 검색 (날짜 범위만)
    dateRange,
    setDateRange,
    // Pagination
    currentPage,
    totalPages,
    totalCount,
    pageSize,
    setPage: handlePageChange,
  };
}
