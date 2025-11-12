import { useState, useMemo } from 'react';
import { Instrument } from '@/types';
import { useFilterSort } from '@/hooks/useFilterSort';
import { toggleValue, countActiveFilters } from '@/utils/filterHelpers';

export function useDashboardFilters(items: Instrument[]) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy] = useState('created_at');
  const [sortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState({
    status: [] as string[],
    maker: [] as string[],
    type: [] as string[],
    subtype: [] as string[],
    ownership: [] as string[],
    certificate: [] as boolean[],
    priceRange: {
      min: '',
      max: '',
    },
    hasClients: [] as string[],
  });

  const filteredItems = useMemo(() => {
    let filtered = items;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        item =>
          item.maker?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.subtype?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (filters.status.length > 0) {
      filtered = filtered.filter(item => filters.status.includes(item.status));
    }

    // Maker filter
    if (filters.maker.length > 0) {
      filtered = filtered.filter(
        item => item.maker && filters.maker.includes(item.maker)
      );
    }

    // Type filter
    if (filters.type.length > 0) {
      filtered = filtered.filter(
        item => item.type && filters.type.includes(item.type)
      );
    }

    // Subtype filter
    if (filters.subtype.length > 0) {
      filtered = filtered.filter(
        item => item.subtype && filters.subtype.includes(item.subtype)
      );
    }

    // Ownership filter
    if (filters.ownership.length > 0) {
      filtered = filtered.filter(
        item => item.ownership && filters.ownership.includes(item.ownership)
      );
    }

    // Certificate filter
    if (filters.certificate.length > 0) {
      filtered = filtered.filter(item =>
        filters.certificate.includes(item.certificate)
      );
    }

    // Price range filter
    if (filters.priceRange.min || filters.priceRange.max) {
      filtered = filtered.filter(item => {
        if (item.price === null || item.price === undefined) return false;
        const priceNum =
          typeof item.price === 'string' ? parseFloat(item.price) : item.price;
        if (Number.isNaN(priceNum)) return false;

        const min = filters.priceRange.min
          ? parseFloat(filters.priceRange.min)
          : 0;
        const max = filters.priceRange.max
          ? parseFloat(filters.priceRange.max)
          : Infinity;

        return priceNum >= min && priceNum <= max;
      });
    }

    return filtered;
  }, [items, searchTerm, filters]);

  const {
    items: sortedItems,
    handleSort,
    getSortArrow,
  } = useFilterSort<Instrument>(filteredItems, {
    searchFields: ['maker', 'type', 'subtype'],
    initialSearchTerm: searchTerm,
    initialSortBy: sortBy,
    initialSortOrder: sortOrder,
    debounceMs: 200,
  });

  const filterOptions = useMemo(() => {
    const uniqueValues = (field: keyof (typeof items)[0]) => {
      const values = items.map(item => item[field]).filter(Boolean) as string[];
      return Array.from(new Set(values));
    };

    return {
      status: uniqueValues('status'),
      maker: uniqueValues('maker'),
      type: uniqueValues('type'),
      subtype: uniqueValues('subtype'),
      ownership: uniqueValues('ownership'),
    };
  }, [items]);

  const handleFilterChange = (
    filterType: keyof typeof filters,
    value: string | boolean
  ) => {
    setFilters((prev: typeof filters) => {
      const currentFilter = prev[filterType];
      if (Array.isArray(currentFilter)) {
        return {
          ...prev,
          [filterType]: toggleValue(
            currentFilter as (string | boolean)[],
            value
          ),
        };
      }
      return prev;
    });
  };

  const handlePriceRangeChange = (field: 'min' | 'max', value: string) => {
    setFilters(prev => ({
      ...prev,
      priceRange: {
        ...prev.priceRange,
        [field]: value,
      },
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      status: [],
      maker: [],
      type: [],
      subtype: [],
      ownership: [],
      certificate: [],
      priceRange: { min: '', max: '' },
      hasClients: [],
    });
    setSearchTerm('');
  };

  const handleSortProxy = (field: string) => {
    handleSort(field);
  };

  const getSortArrowProxy = (field: string) => getSortArrow(field);

  const getActiveFiltersCount = () => {
    return countActiveFilters(filters);
  };

  return {
    searchTerm,
    setSearchTerm,
    sortBy,
    sortOrder,
    showFilters,
    setShowFilters,
    filters,
    filteredItems: sortedItems,
    filterOptions,
    handleFilterChange,
    handlePriceRangeChange,
    clearAllFilters,
    handleSort: handleSortProxy,
    getSortArrow: getSortArrowProxy,
    getActiveFiltersCount,
  };
}
