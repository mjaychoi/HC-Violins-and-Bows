import { useState, useCallback, useEffect } from 'react';
import { SalesFilters, DatePreset } from '../types';
import { getDateRangeFromPreset } from '../utils/salesUtils';
import { useURLState } from '@/hooks/useURLState';

export function useSalesFilters(initialFilters?: Partial<SalesFilters>) {
  // URL state synchronization
  const { urlState, updateURLState } = useURLState({
    enabled: true,
    keys: ['from', 'to', 'search', 'hasClient', 'sortColumn', 'sortDirection'],
    paramMapping: {
      from: 'from',
      to: 'to',
      search: 'search',
      hasClient: 'hasClient',
      sortColumn: 'sortColumn',
      sortDirection: 'sortDirection',
    },
  });

  // Initialize state from URL or initialFilters
  const initialFrom = urlState.from
    ? String(urlState.from)
    : initialFilters?.from || '';
  const initialTo = urlState.to
    ? String(urlState.to)
    : initialFilters?.to || '';
  const initialSearch = urlState.search
    ? String(urlState.search)
    : initialFilters?.search || '';
  const initialHasClient = urlState.hasClient
    ? urlState.hasClient === 'true'
      ? true
      : urlState.hasClient === 'false'
        ? false
        : null
    : (initialFilters?.hasClient ?? null);
  const initialSortColumn = urlState.sortColumn
    ? (urlState.sortColumn as SalesFilters['sortColumn'])
    : initialFilters?.sortColumn || 'sale_date';
  const initialSortDirection = urlState.sortDirection
    ? (urlState.sortDirection as SalesFilters['sortDirection'])
    : initialFilters?.sortDirection || 'desc';

  const [showFilters, setShowFilters] = useState(true);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [search, setSearch] = useState(initialSearch);
  const [hasClient, setHasClient] = useState<boolean | null>(initialHasClient);
  const [sortColumn, setSortColumn] =
    useState<SalesFilters['sortColumn']>(initialSortColumn);
  const [sortDirection, setSortDirection] =
    useState<SalesFilters['sortDirection']>(initialSortDirection);

  // Sync state changes to URL
  useEffect(() => {
    updateURLState({
      from: from || null,
      to: to || null,
      search: search || null,
      hasClient: hasClient !== null ? String(hasClient) : null,
      sortColumn: sortColumn !== 'sale_date' ? sortColumn : null,
      sortDirection: sortDirection !== 'desc' ? sortDirection : null,
    });
  }, [from, to, search, hasClient, sortColumn, sortDirection, updateURLState]);

  const handleDatePreset = useCallback((preset: DatePreset) => {
    // 현재 스크롤 위치 저장 (필터 변경 후 복원하기 위해)
    // SSR 안전성을 위해 window 체크 추가
    if (typeof window !== 'undefined' && window.scrollY > 0) {
      sessionStorage.setItem('salesScrollPosition', window.scrollY.toString());
    }

    const { from: presetFrom, to: presetTo } = getDateRangeFromPreset(preset);
    setFrom(presetFrom);
    setTo(presetTo);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setFrom('');
    setTo('');
    setHasClient(null);
    // URL will be updated automatically via useEffect
  }, []);

  const filters: SalesFilters = {
    from,
    to,
    search,
    sortColumn,
    sortDirection,
    hasClient,
  };

  return {
    showFilters,
    setShowFilters,
    from,
    setFrom,
    to,
    setTo,
    search,
    setSearch,
    hasClient,
    setHasClient,
    sortColumn,
    setSortColumn,
    sortDirection,
    setSortDirection,
    handleDatePreset,
    clearFilters,
    filters,
  };
}
