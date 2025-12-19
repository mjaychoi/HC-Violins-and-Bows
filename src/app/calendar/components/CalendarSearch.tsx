'use client';

import React, { forwardRef } from 'react';
import { SearchInput } from '@/components/common/inputs';

interface CalendarSearchProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  debounceMs?: number;
}

/**
 * Calendar page search input component.
 * Uses shared SearchInput component for consistency.
 */
const CalendarSearch = forwardRef<HTMLInputElement, CalendarSearchProps>(
  ({ searchTerm, onSearchChange, debounceMs = 300 }, ref) => {
    return (
      <SearchInput
        ref={ref}
        value={searchTerm}
        onChange={onSearchChange}
        placeholder="Search tasks, instruments, owners..."
        debounceMs={debounceMs}
        variant="filled"
        size="md"
        className="h-10"
        aria-label="Search maintenance tasks"
      />
    );
  }
);

CalendarSearch.displayName = 'CalendarSearch';

export default CalendarSearch;
