'use client';

import React from 'react';
import SearchInput from '@/components/common/SearchInput';

interface CalendarSearchProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  debounceMs?: number;
}

/**
 * Calendar page search input component.
 * Uses shared SearchInput component for consistency.
 */
export default function CalendarSearch({
  searchTerm,
  onSearchChange,
  debounceMs = 300,
}: CalendarSearchProps) {
  return (
    <SearchInput
      value={searchTerm}
      onChange={onSearchChange}
      placeholder="Search by item name, serial number, type, owner..."
      debounceMs={debounceMs}
      variant="filled"
      size="md"
      className="h-10"
      aria-label="Search maintenance tasks"
    />
  );
}
