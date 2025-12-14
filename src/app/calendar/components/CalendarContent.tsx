'use client';

import React, { useMemo, useCallback } from 'react';
import { format, subDays, addDays } from 'date-fns';
import { todayLocalYMD, parseYMDLocal } from '@/utils/dateParsing';
import { useCalendarFilters } from '../hooks/useCalendarFilters';
import { useCalendarTasks } from '../hooks/useCalendarTasks';
import { calculateSummaryStats } from '../utils/filterUtils';
import type { MaintenanceTask, Instrument, Client, ContactLog } from '@/types';
import {
  CalendarFilters,
  CalendarSummary,
  CalendarEmptyState,
  GroupedTaskList,
} from './';
import { getViewRangeLabel } from '../utils/viewUtils';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { TableSkeleton, Pagination } from '@/components/common';
import Button from '@/components/common/Button';
import type { ExtendedView } from './CalendarView';
import TodayFollowUps from '@/app/clients/components/TodayFollowUps';

// Dynamic import for CalendarView (includes react-big-calendar and react-dnd)
// This significantly reduces initial bundle size for calendar page
const CalendarView = dynamic(() => import('./CalendarView'), {
  ssr: false,
});

interface CalendarContentProps {
  tasks: MaintenanceTask[];
  contactLogs?: ContactLog[];
  instruments: Instrument[];
  clients: Client[];
  loading: {
    fetch: boolean;
    mutate: boolean;
  };
  navigation: {
    currentDate: Date;
    calendarView: ExtendedView;
    selectedDate: Date | null;
    handlePrevious: () => void;
    handleNext: () => void;
    handleGoToToday: () => void;
    setCurrentDate: (date: Date) => void;
    setCalendarView: (view: ExtendedView) => void;
    setSelectedDate: (date: Date | null) => void;
  };
  view: 'calendar' | 'list';
  setView: (view: 'calendar' | 'list') => void;
  onTaskClick: (task: MaintenanceTask) => void;
  onTaskDelete: (task: MaintenanceTask) => void;
  onTaskEdit?: (task: MaintenanceTask) => void;
  onSelectEvent: (task: MaintenanceTask) => void;
  onSelectSlot: (slotInfo: { start: Date; end: Date }) => void;
  onEventDrop?: (data: {
    event: { resource?: MaintenanceTask | { type: string; contactLog?: ContactLog } };
    start: Date;
    end: Date;
    isAllDay?: boolean;
  }) => Promise<void> | void;
  onEventResize?: (data: {
    event: { resource?: MaintenanceTask | { type: string; contactLog?: ContactLog } };
    start: Date;
    end: Date;
  }) => Promise<void> | void;
  draggingEventId?: string | null;
  onOpenNewTask: () => void;
}

function CalendarContentInner({
  tasks,
  contactLogs = [],
  instruments,
  clients,
  loading,
  navigation,
  view,
  setView,
  onTaskClick,
  onTaskDelete,
  onTaskEdit,
  onSelectEvent,
  onSelectSlot,
  onEventDrop,
  onEventResize,
  draggingEventId,
  onOpenNewTask,
}: CalendarContentProps) {
  // onTaskEdit is optional, so we need to handle it
  const handleTaskEdit = onTaskEdit || onTaskClick;
  // Filters drawer state for calendar view
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  // Calendar tasks (maps, filter options)
  const taskData = useCalendarTasks({
    tasks,
    instruments,
    clients,
  });

  // Calendar filters
  const {
    filteredTasks,
    paginatedTasks,
    currentPage,
    totalPages,
    totalCount,
    pageSize,
    ...filterState
  } = useCalendarFilters({
    tasks,
    instrumentsMap: taskData.instrumentsMap,
    filterOptions: taskData.filterOptions,
  });

  // Alias for cleaner code
  const {
    filterStatus,
    filterOwnership,
    searchTerm,
    searchFilters,
    sortBy,
    sortOrder,
    dateRange,
    filterOperator,
    hasActiveFilters,
    setFilterStatus,
    setFilterOwnership,
    setSearchTerm,
    setSearchFilters,
    setSortBy,
    setSortOrder,
    setDateRange,
    setFilterOperator,
    setPage,
    resetFilters,
  } = filterState;

  // Calculate summary stats with ALL tasks (not filtered)
  // FIXED: Stats should always show totals from all tasks, not filtered subset
  const summaryStats = useMemo(() => {
    return calculateSummaryStats(tasks);
  }, [tasks]);

  // Determine active filter preset based on current filter state
  const activePreset = useMemo(():
    | 'all'
    | 'overdue'
    | 'today'
    | 'upcoming'
    | null => {
    if (!dateRange) return 'all';

    const today = parseYMDLocal(todayLocalYMD())!;
    const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
    const todayStr = fmt(today);
    const yesterdayStr = fmt(subDays(today, 1));
    const tomorrowStr = fmt(addDays(today, 1));
    const nextWeekStr = fmt(addDays(today, 7));

    // Check if "all" (no filters)
    if (
      !hasActiveFilters ||
      (!dateRange.from && !dateRange.to && !filterStatus)
    ) {
      return 'all';
    }

    // Check if "today"
    if (
      dateRange.from === todayStr &&
      dateRange.to === todayStr &&
      !filterStatus
    ) {
      return 'today';
    }

    // Check if "overdue"
    if (
      dateRange.to === yesterdayStr &&
      !dateRange.from &&
      filterStatus === 'pending'
    ) {
      return 'overdue';
    }

    // Check if "upcoming" (next 7 days)
    if (
      dateRange.from === tomorrowStr &&
      dateRange.to === nextWeekStr &&
      !filterStatus
    ) {
      return 'upcoming';
    }

    return null; // Custom filter active
  }, [dateRange, filterStatus, hasActiveFilters]);

  const resetFiltersAndUpdate = useCallback(() => {
    resetFilters();
    navigation.setSelectedDate(null);
  }, [resetFilters, navigation]);

  // Apply preset filter - optimized to batch state updates
  const applyPreset = useCallback(
    (preset: 'all' | 'overdue' | 'today' | 'upcoming') => {
      const today = parseYMDLocal(todayLocalYMD())!;
      const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

      if (preset === 'all') {
        // Reset all filters in one batch
        resetFilters();
        navigation.setSelectedDate(null);
        return;
      }

      // Batch all state updates together
      if (preset === 'overdue') {
        resetFilters();
        navigation.setSelectedDate(null);
        setDateRange({ from: null, to: fmt(subDays(today, 1)) });
        setFilterStatus('pending');
        return;
      }
      if (preset === 'today') {
        const t = fmt(today);
        resetFilters();
        navigation.setSelectedDate(null);
        setDateRange({ from: t, to: t });
        return;
      }
      // upcoming
      resetFilters();
      navigation.setSelectedDate(null);
      setDateRange({
        from: fmt(addDays(today, 1)),
        to: fmt(addDays(today, 7)),
      });
    },
    [resetFilters, navigation, setDateRange, setFilterStatus]
  );

  // Handle summary card clicks to apply filters
  const handleSummaryCardClick = useCallback(
    (status: 'all' | 'overdue' | 'today' | 'upcoming') => {
      applyPreset(status);
    },
    [applyPreset]
  );

  const isEmptyState = !loading.fetch && filteredTasks.length === 0;
  const showPagination = totalPages > 1 && view === 'list';

  return (
    <div className="p-6">
      {/* Today Follow-ups */}
      <TodayFollowUps />

      {/* Compressed Header: Navigation + Summary Pills in one line */}
      <div className="mb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Left: Navigation + Date */}
          <div className="flex items-center gap-3">
            {/* Navigation buttons */}
            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-1 py-0.5">
              <button
                onClick={navigation.handlePrevious}
                className="flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Previous"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <button
                onClick={navigation.handleNext}
                className="flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Next"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>

            {/* Date label */}
            <h1 className="text-base font-semibold tracking-tight text-gray-900 whitespace-nowrap">
              {getViewRangeLabel(
                navigation.calendarView,
                navigation.currentDate
              )}
            </h1>

            {/* Divider */}
            <div className="hidden md:block h-6 w-px bg-gray-300" />

            {/* Summary Pills */}
            <CalendarSummary
              total={summaryStats.total}
              overdue={summaryStats.overdue}
              today={summaryStats.today}
              upcoming={summaryStats.upcoming}
              onFilterByStatus={handleSummaryCardClick}
              onOpenFilters={() => setFiltersOpen(v => !v)}
              hasActiveFilters={hasActiveFilters}
              activePreset={activePreset}
            />
          </div>

          {/* Right: Today / View Toggle / New Task Button */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={navigation.handleGoToToday}
              className="flex h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Go to today"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Today
            </button>

            <div className="flex gap-1 rounded-lg bg-gray-100 p-1 border border-gray-200">
              <button
                onClick={() => setView('calendar')}
                className={`flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition ${
                  view === 'calendar'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-white hover:text-gray-900'
                }`}
                aria-label="Calendar view"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Calendar
              </button>
              <button
                onClick={() => setView('list')}
                className={`flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition ${
                  view === 'list'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-white hover:text-gray-900'
                }`}
                aria-label="List view"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 10h16M4 14h16M4 18h16"
                  />
                </svg>
                List
              </button>
            </div>

            <button
              onClick={onOpenNewTask}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Add new task"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add New Task
            </button>
          </div>
        </div>
      </div>

      {/* Filters Drawer - hidden by default, shown when filtersOpen */}
      {filtersOpen && view === 'calendar' && (
        <div className="mb-4">
          <CalendarFilters
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            searchFilters={searchFilters}
            onFilterChange={setSearchFilters}
            filterOptions={taskData.filterOptions}
            filterStatus={filterStatus}
            onStatusChange={setFilterStatus}
            filterOwnership={filterOwnership}
            onOwnershipChange={setFilterOwnership}
            ownershipOptions={taskData.ownershipOptions}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            filterOperator={filterOperator}
            onFilterOperatorChange={setFilterOperator}
            taskCount={filteredTasks.length}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={resetFiltersAndUpdate}
            showSort={false}
          />
        </div>
      )}

      {/* Filters - always visible for list view */}
      {view === 'list' && (
        <div className="mb-4">
          <CalendarFilters
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            searchFilters={searchFilters}
            onFilterChange={setSearchFilters}
            filterOptions={taskData.filterOptions}
            filterStatus={filterStatus}
            onStatusChange={setFilterStatus}
            filterOwnership={filterOwnership}
            onOwnershipChange={setFilterOwnership}
            ownershipOptions={taskData.ownershipOptions}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            filterOperator={filterOperator}
            onFilterOperatorChange={setFilterOperator}
            taskCount={filteredTasks.length}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={resetFiltersAndUpdate}
          />
        </div>
      )}

      {/* Calendar or List View */}
      {loading.fetch ? (
        <div className="rounded-lg bg-white p-6 shadow-sm border border-gray-200">
          <TableSkeleton rows={8} columns={4} />
        </div>
      ) : isEmptyState ? (
        <CalendarEmptyState
          hasActiveFilters={hasActiveFilters}
          onResetFilters={resetFiltersAndUpdate}
          onOpenNewTask={onOpenNewTask}
        />
      ) : view === 'calendar' ? (
        <div
          className="rounded-lg bg-white p-6 border border-gray-200"
          style={{ minHeight: '700px', overflow: 'visible' }}
        >
          <Suspense
            fallback={
              <div className="rounded-lg bg-white p-6 border border-gray-200" style={{ minHeight: '700px' }}>
                <TableSkeleton rows={5} columns={1} />
              </div>
            }
          >
            <CalendarView
            tasks={filteredTasks}
            contactLogs={contactLogs}
            instruments={taskData.instrumentsMap}
            onSelectEvent={onSelectEvent}
            onSelectSlot={onSelectSlot}
            onEventDrop={onEventDrop}
            onEventResize={onEventResize}
            draggingEventId={draggingEventId}
            currentDate={navigation.currentDate}
            onNavigate={navigation.setCurrentDate}
            currentView={navigation.calendarView}
            onViewChange={navigation.setCalendarView}
          />
          </Suspense>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="border-b border-gray-100 p-6">
            {navigation.selectedDate ? (
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base md:text-lg font-semibold text-gray-900">
                    {format(navigation.selectedDate, 'MMMM d, yyyy')} Tasks
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    {format(navigation.selectedDate, 'EEEE')}
                  </p>
                </div>
                <Button
                  onClick={() => navigation.setSelectedDate(null)}
                  variant="primary"
                  size="sm"
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 bg-transparent border-0 shadow-none"
                  aria-label="View all tasks"
                >
                  View All Tasks
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <h2 className="text-base md:text-lg font-semibold text-gray-900">
                  All Tasks
                </h2>
                {filteredTasks.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {filteredTasks.length} tasks
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="p-6">
            <GroupedTaskList
              tasks={paginatedTasks}
              instruments={taskData.instrumentsMap}
              clients={taskData.clientsMap}
              onTaskClick={onTaskClick}
              onTaskDelete={onTaskDelete}
              onTaskEdit={handleTaskEdit}
            />
            {showPagination && (
              <div className="mt-6 border-t border-gray-200 pt-4">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  totalCount={totalCount}
                  pageSize={pageSize}
                  loading={loading.fetch}
                  data-testid="calendar-pagination"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// FIXED: Removed Suspense wrapper - using loading.fetch for skeleton display instead
// Suspense is only effective when child components actually throw promises,
// which is not the case here. The loading state is already handled by loading.fetch.
export default function CalendarContent(props: CalendarContentProps) {
  return <CalendarContentInner {...props} />;
}
