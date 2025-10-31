// src/app/clients/utils/filterUtils.ts
import { Client } from '@/types';
import {
  getUniqueValues as getUniqueValuesGeneric,
  getUniqueArrayValues,
} from '@/utils/uniqueValues';
import { toggleValue } from '@/utils/filterHelpers';

// Filter utility functions
export const getUniqueValues = (
  clients: Client[],
  field: keyof Client
): string[] => getUniqueValuesGeneric(clients, field);

export const getUniqueLastNames = (clients: Client[]) =>
  getUniqueValues(clients, 'last_name');
export const getUniqueFirstNames = (clients: Client[]) =>
  getUniqueValues(clients, 'first_name');
export const getUniqueContactNumbers = (clients: Client[]) =>
  getUniqueValues(clients, 'contact_number');
export const getUniqueEmails = (clients: Client[]) =>
  getUniqueValues(clients, 'email');

export const getUniqueTags = (clients: Client[]): string[] =>
  getUniqueArrayValues(clients, 'tags');

export const getUniqueInterests = (clients: Client[]): string[] =>
  getUniqueValuesGeneric(clients, 'interest');

// Filter change handler
export const handleFilterChange = (
  currentFilters: Record<string, string[]>,
  category: string,
  value: string
): Record<string, string[]> => {
  const currentValues = currentFilters[category] || [];
  const newValues = toggleValue(currentValues, value);

  return {
    ...currentFilters,
    [category]: newValues,
  };
};

// Clear all filters
export const clearAllFilters = () => ({
  last_name: [],
  first_name: [],
  contact_number: [],
  email: [],
  tags: [],
  interest: [],
  hasInstruments: [],
});

// Sort utilities
export const handleColumnSort = (
  currentSortBy: string,
  currentSortOrder: 'asc' | 'desc',
  column: string
): { sortBy: string; sortOrder: 'asc' | 'desc' } => {
  if (currentSortBy === column) {
    return {
      sortBy: column,
      sortOrder: currentSortOrder === 'asc' ? 'desc' : 'asc',
    };
  } else {
    return {
      sortBy: column,
      sortOrder: 'asc',
    };
  }
};

// Get sort arrow icon (returns JSX string for use in components)
export const getSortArrow = (
  sortBy: string,
  sortOrder: 'asc' | 'desc',
  column: string
): string => {
  if (sortBy !== column) {
    return 'sort-neutral';
  } else if (sortOrder === 'asc') {
    return 'sort-asc';
  } else {
    return 'sort-desc';
  }
};
