'use client';

import React from 'react';
import CalendarSearch from './CalendarSearch';
import AdvancedSearch from '@/components/common/AdvancedSearch';
import type { TaskType, TaskStatus, TaskPriority } from '@/types';
import type { DateRange, FilterOperator } from '@/types/search';
import {
  filterToolbarClasses,
  filterButtonClasses,
  pillSelectClasses,
} from '@/utils/filterUI';
import { PillSelect } from '@/components/common';
import { formatStatus } from '@/utils/formatUtils';

interface CalendarFiltersProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  searchFilters: {
    type?: TaskType | 'all';
    priority?: TaskPriority | 'all';
    status?: TaskStatus | 'all'; // Quick filter pill area (combined with search/advanced filters)
    owner?: string | 'all';
  };
  onFilterChange: (
    filter: 'type' | 'priority' | 'status' | 'owner',
    value: string
  ) => void;
  filterOptions: {
    types: TaskType[];
    priorities: TaskPriority[];
    statuses: TaskStatus[];
    owners: string[];
  };
  filterStatus: string; // Global toolbar status filter (simpler options, takes precedence over searchFilters.status)
  onStatusChange: (status: string) => void;
  filterOwnership: string;
  onOwnershipChange: (ownership: string) => void;
  ownershipOptions: string[];
  sortBy: 'date' | 'priority' | 'status' | 'type';
  onSortByChange: (sortBy: 'date' | 'priority' | 'status' | 'type') => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: () => void;
  dateRange: DateRange | null;
  onDateRangeChange: (dateRange: DateRange | null) => void;
  filterOperator: FilterOperator;
  onFilterOperatorChange: (operator: FilterOperator) => void;
  taskCount: number;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}

export default function CalendarFilters({
  searchTerm,
  onSearchChange,
  searchFilters,
  onFilterChange,
  filterOptions,
  filterStatus,
  onStatusChange,
  filterOwnership,
  onOwnershipChange,
  ownershipOptions,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
  dateRange,
  onDateRangeChange,
  filterOperator,
  onFilterOperatorChange,
  taskCount,
  hasActiveFilters,
  onResetFilters,
}: CalendarFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Search bar + Advanced Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[280px]">
          <CalendarSearch
            searchTerm={searchTerm}
            onSearchChange={onSearchChange}
            debounceMs={300}
          />
        </div>
        <AdvancedSearch
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          operator={filterOperator}
          onOperatorChange={onFilterOperatorChange}
          dateFields={[
            { field: 'received_date', label: 'Received' },
            { field: 'due_date', label: 'Due' },
            { field: 'scheduled_date', label: 'Scheduled' },
            { field: 'completed_date', label: 'Completed' },
          ]}
          onReset={() => {
            // FIXED: Reset only date range and operator (as documented in AdvancedSearch)
            // Full reset should be handled by parent's onResetFilters
            onDateRangeChange(null);
            onFilterOperatorChange('AND');
          }}
        />
      </div>

      {/* Quick filter pills (Type, Priority, Status, Owner) */}
      {(filterOptions.types.length > 0 ||
        filterOptions.priorities.length > 0 ||
        filterOptions.statuses.length > 0 ||
        filterOptions.owners.length > 0) && (
        <div className={pillSelectClasses.container}>
          {/* Type Filter */}
          {filterOptions.types.length > 0 && (
            <>
              <span className={pillSelectClasses.label}>Type</span>
              <PillSelect
                value={searchFilters.type || 'all'}
                onChange={value => onFilterChange('type', value)}
                options={[
                  { value: 'all', label: 'All Types' },
                  ...filterOptions.types.map(type => ({
                    value: type,
                    label: type,
                  })),
                ]}
                aria-label="Filter by task type"
              />
            </>
          )}

          {/* Priority Filter */}
          {filterOptions.priorities.length > 0 && (
            <>
              <span className={pillSelectClasses.label}>Priority</span>
              <PillSelect
                value={searchFilters.priority || 'all'}
                onChange={value => onFilterChange('priority', value)}
                options={[
                  { value: 'all', label: 'All Priorities' },
                  ...filterOptions.priorities.map(priority => ({
                    value: priority,
                    label: priority,
                  })),
                ]}
                aria-label="Filter by priority"
              />
            </>
          )}

          {/* Status Filter (Quick - in pill area) */}
          {filterOptions.statuses.length > 0 && (
            <>
              <span className={pillSelectClasses.label}>Status</span>
              <PillSelect
                value={
                  filterStatus !== 'all'
                    ? filterStatus
                    : searchFilters.status || 'all'
                }
                onChange={value => {
                  // Use onStatusChange for global status filter
                  onStatusChange(value);
                  // Also sync to searchFilters.status if needed
                  if (value !== filterStatus) {
                    onFilterChange('status', value);
                  }
                }}
                options={[
                  { value: 'all', label: 'All Status' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'in_progress', label: 'In Progress' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'cancelled', label: 'Cancelled' },
                  ...filterOptions.statuses
                    .filter(
                      status =>
                        ![
                          'pending',
                          'in_progress',
                          'completed',
                          'cancelled',
                        ].includes(status)
                    )
                    .map(status => ({
                      value: status,
                      label: formatStatus(status),
                    })),
                ]}
                aria-label="Filter by status"
              />
            </>
          )}

          {/* Owner Filter */}
          {filterOptions.owners.length > 0 && (
            <>
              <span className={pillSelectClasses.label}>Owner</span>
              <PillSelect
                value={
                  filterOwnership !== 'all'
                    ? filterOwnership
                    : searchFilters.owner || 'all'
                }
                onChange={value => {
                  // Use onOwnershipChange for global ownership filter
                  onOwnershipChange(value);
                  // Also sync to searchFilters.owner if needed
                  if (value !== filterOwnership) {
                    onFilterChange('owner', value);
                  }
                }}
                options={[
                  { value: 'all', label: 'All Owners' },
                  ...ownershipOptions.map(owner => ({
                    value: owner,
                    label: owner,
                  })),
                ]}
                aria-label="Filter by owner"
              />
            </>
          )}
        </div>
      )}

      {/* 필터 바 - 한 줄 툴바 (Sort, Count, Reset만 표시) */}
      {/* UX: Removed duplicate Status and Owner filters - they're already in Quick filter pills above */}
      <div className={filterToolbarClasses.container}>
        <div className={filterToolbarClasses.leftSection}>
          {/* Filters label removed since no filters are shown here */}
        </div>

        {/* 오른쪽: Sort + 카운트 + Reset */}
        <div className={filterToolbarClasses.rightSection}>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-gray-600">Sort:</span>
            <PillSelect
              value={sortBy}
              onChange={value =>
                onSortByChange(value as 'date' | 'priority' | 'status' | 'type')
              }
              options={[
                { value: 'date', label: 'Date' },
                { value: 'priority', label: 'Priority' },
                { value: 'status', label: 'Status' },
                { value: 'type', label: 'Type' },
              ]}
            />
            <button
              onClick={onSortOrderChange}
              className={filterButtonClasses.sortToggle}
              aria-label={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
              title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>

          <span className={filterButtonClasses.badge}>{taskCount} tasks</span>

          {hasActiveFilters && (
            <button
              onClick={onResetFilters}
              className={filterButtonClasses.reset}
              aria-label="Reset all filters"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
