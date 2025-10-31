// src/app/clients/hooks/useFilters.ts
import { useState, useMemo } from 'react';
import { Client } from '@/types';
import { filterClients } from '../utils';
import { getUniqueValues, getUniqueArrayValues } from '@/utils/uniqueValues';
import {
  toggleValue,
  countActiveFilters,
  arrowToClass,
} from '@/utils/filterHelpers';
import { useFilterSort } from '@/hooks/useFilterSort';
import { FilterState } from '../types';

export const useFilters = (
  clients: Client[],
  clientsWithInstruments?: Set<string>
) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    last_name: [],
    first_name: [],
    contact_number: [],
    email: [],
    tags: [],
    interest: [],
    hasInstruments: [],
  });

  // Get unique values for filter options
  const filterOptions = useMemo(
    () => ({
      lastNames: getUniqueValues(clients, 'last_name'),
      firstNames: getUniqueValues(clients, 'first_name'),
      contactNumbers: getUniqueValues(clients, 'contact_number'),
      emails: getUniqueValues(clients, 'email'),
      tags: getUniqueArrayValues(clients, 'tags'),
      interests: getUniqueValues(clients, 'interest'),
    }),
    [clients]
  );

  // 1) 필드 기반 필터만 적용 (텍스트 검색 제외)
  const fieldFiltered = useMemo(() => {
    return filterClients(clients, '', filters, { clientsWithInstruments });
  }, [clients, filters, clientsWithInstruments]);

  // 2) 공통 검색/정렬 훅 적용
  const {
    items: filteredClients,
    handleSort,
    getSortArrow,
    sortBy,
    sortOrder,
  } = useFilterSort<Client>(fieldFiltered, {
    searchFields: [
      'first_name',
      'last_name',
      'contact_number',
      'email',
      'interest',
      'note',
    ],
    initialSearchTerm: searchTerm,
    initialSortBy: 'created_at',
    initialSortOrder: 'desc',
    debounceMs: 300,
    customFilter: (item, term) => {
      const t = term.toLowerCase();
      const parts = [
        item.first_name,
        item.last_name,
        item.contact_number,
        item.email,
        item.interest,
        item.note,
        Array.isArray(item.tags) ? item.tags.join(' ') : '',
      ]
        .filter(Boolean)
        .map(v => String(v).toLowerCase());
      return parts.some(v => v.includes(t));
    },
  });

  const handleFilterChange = <K extends keyof FilterState>(
    category: K,
    value: string
  ) => {
    setFilters(prev => {
      const currentValues = prev[category];
      const newValues = toggleValue(currentValues, value);

      return {
        ...prev,
        [category]: newValues,
      };
    });
  };

  const clearAllFilters = () => {
    setFilters({
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    });
    setSearchTerm('');
  };

  const handleColumnSort = (column: keyof Client) => {
    handleSort(column);
  };

  const getSortArrowClass = (column: keyof Client) => {
    return arrowToClass(getSortArrow(column));
  };

  const getActiveFiltersCount = () => {
    return countActiveFilters(filters) + (searchTerm ? 1 : 0);
  };

  return {
    // State
    searchTerm,
    setSearchTerm,
    sortBy,
    sortOrder,
    showFilters,
    setShowFilters,
    filters,
    setFilters,

    // Computed values
    filteredClients,
    filterOptions,

    // Actions
    handleFilterChange,
    clearAllFilters,
    handleColumnSort,
    getSortArrow: getSortArrowClass,
    getActiveFiltersCount,
  };
};
