// src/app/clients/hooks/useFilters.ts
import { useState, useMemo } from 'react';
import { Client } from '@/types';
import { filterClients, sortClients, getUniqueValues } from '../utils';
import { useDebounce } from '@/hooks/useDebounce';

export const useFilters = (
  clients: Client[],
  clientsWithInstruments?: Set<string>
) => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300); // 300ms 디바운싱
  const [sortBy, setSortBy] = useState<keyof Client>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    last_name: [] as string[],
    first_name: [] as string[],
    contact_number: [] as string[],
    email: [] as string[],
    tags: [] as string[],
    interest: [] as string[],
    hasInstruments: [] as string[],
  });

  // Get unique values for filter options
  const filterOptions = useMemo(
    () => ({
      lastNames: getUniqueValues(clients, 'last_name'),
      firstNames: getUniqueValues(clients, 'first_name'),
      contactNumbers: getUniqueValues(clients, 'contact_number'),
      emails: getUniqueValues(clients, 'email'),
      tags: [...new Set(clients.flatMap(client => client.tags || []))],
      interests: clients
        .map(client => client.interest)
        .filter(
          (interest): interest is string =>
            typeof interest === 'string' && interest !== null
        )
        .filter((value, index, self) => self.indexOf(value) === index),
    }),
    [clients]
  );

  // Filter and sort clients
  const filteredClients = useMemo(() => {
    const filtered = filterClients(clients, debouncedSearchTerm, filters, {
      clientsWithInstruments,
    });
    return sortClients(
      filtered as unknown as { [k: string]: unknown }[],
      sortBy,
      sortOrder
    ) as unknown as Client[];
  }, [
    clients,
    debouncedSearchTerm,
    filters,
    sortBy,
    sortOrder,
    clientsWithInstruments,
  ]);

  const handleFilterChange = (
    category: keyof typeof filters,
    value: string
  ) => {
    setFilters(prev => {
      const currentValues = prev[category];
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];

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
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const getSortArrow = (column: keyof Client) => {
    if (sortBy !== column) {
      return 'sort-neutral';
    } else if (sortOrder === 'asc') {
      return 'sort-asc';
    } else {
      return 'sort-desc';
    }
  };

  const getActiveFiltersCount = () => {
    return (
      Object.values(filters).reduce(
        (count, filterArray) => count + filterArray.length,
        0
      ) + (searchTerm ? 1 : 0)
    );
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
    getSortArrow,
    getActiveFiltersCount,
  };
};
