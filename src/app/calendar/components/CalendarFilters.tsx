'use client';

import React from 'react';
import CalendarSearch from './CalendarSearch';
import { AdvancedSearch, PillSelect } from '@/components/common/inputs';
import type { TaskType, TaskStatus, TaskPriority } from '@/types';
import type { DateRange, FilterOperator } from '@/types/search';
import {
  filterToolbarClasses,
  filterButtonClasses,
  pillSelectClasses,
} from '@/utils/filterUI';
import { formatStatus } from '@/utils/formatUtils';

interface CalendarFiltersProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  searchFilters: {
    type?: TaskType | 'all';
    priority?: TaskPriority | 'all';
    // status and owner removed - use filterStatus and filterOwnership instead
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
  filterStatus: string; // Single source of truth for status filter (maps to CalendarFilters.status)
  onStatusChange: (status: string) => void;
  filterOwnership: string; // Single source of truth for ownership filter (maps to CalendarFilters.owner)
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
  showSort?: boolean; // Hide sort in calendar view
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

function CalendarFilters({
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
  showSort = true, // Default to true for list view
  searchInputRef,
}: CalendarFiltersProps) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
      {/* Search bar + Advanced Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[280px]">
          <CalendarSearch
            ref={searchInputRef}
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
      {/* ✅ FIXED: 필터들을 일렬로 정렬 (flex items-center로 수직 정렬 통일) */}
      {(filterOptions.types.length > 0 ||
        filterOptions.priorities.length > 0 ||
        filterOptions.statuses.length > 0 ||
        filterOptions.owners.length > 0) && (
        <div className="flex flex-wrap items-center gap-4">
          {/* Type Filter */}
          {filterOptions.types.length > 0 && (
            <div className="flex flex-col gap-1">
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
            </div>
          )}

          {/* Priority Filter */}
          {filterOptions.priorities.length > 0 && (
            <div className="flex flex-col gap-1">
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
            </div>
          )}

          {/* Status Filter (Quick - in pill area) */}
          {filterOptions.statuses.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className={pillSelectClasses.label}>Status</span>
              <PillSelect
                value={filterStatus}
                onChange={value => {
                  // Single source of truth: status filter (no synchronization needed)
                  onStatusChange(value);
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
            </div>
          )}

          {/* Owner Filter */}
          {filterOptions.owners.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className={pillSelectClasses.label}>Owner</span>
              <PillSelect
                value={filterOwnership}
                onChange={value => {
                  // Single source of truth: owner filter (no synchronization needed)
                  onOwnershipChange(value);
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
            </div>
          )}
        </div>
      )}

      {/* Filter toolbar - Sort only shown in list view */}
      {showSort && (
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
                  onSortByChange(
                    value as 'date' | 'priority' | 'status' | 'type'
                  )
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
      )}
    </div>
  );
}

export default React.memo(CalendarFilters);
