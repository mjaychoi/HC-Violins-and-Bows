import { useState, useCallback } from 'react';
import { SalesFilters, DatePreset } from '../types';
import { getDateRangeFromPreset } from '../utils/salesUtils';

export function useSalesFilters(initialFilters?: Partial<SalesFilters>) {
  const [showFilters, setShowFilters] = useState(true);
  const [from, setFrom] = useState(initialFilters?.from || '');
  const [to, setTo] = useState(initialFilters?.to || '');
  const [search, setSearch] = useState(initialFilters?.search || '');
  const [hasClient, setHasClient] = useState<boolean | null>(
    initialFilters?.hasClient ?? null
  );
  const [sortColumn, setSortColumn] = useState<SalesFilters['sortColumn']>(
    initialFilters?.sortColumn || 'sale_date'
  );
  const [sortDirection, setSortDirection] = useState<
    SalesFilters['sortDirection']
  >(initialFilters?.sortDirection || 'desc');

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
