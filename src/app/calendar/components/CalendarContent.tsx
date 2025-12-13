'use client';

import React, { useMemo, useCallback, Suspense } from 'react';
import { format, startOfDay, subDays, addDays } from 'date-fns';
import { useCalendarFilters } from '../hooks/useCalendarFilters';
import { useCalendarTasks } from '../hooks/useCalendarTasks';
import { calculateSummaryStats } from '../utils/filterUtils';
import type { MaintenanceTask, Instrument, Client } from '@/types';
import {
  CalendarHeader,
  CalendarFilters,
  CalendarSummary,
  CalendarEmptyState,
  GroupedTaskList,
} from './';
import CalendarView from './CalendarView';
import { TableSkeleton, Pagination } from '@/components/common';
import Button from '@/components/common/Button';
import type { ExtendedView } from './CalendarView';

interface CalendarContentProps {
  tasks: MaintenanceTask[];
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
  onSelectEvent: (task: MaintenanceTask) => void;
  onSelectSlot: (slotInfo: { start: Date; end: Date }) => void;
  onOpenNewTask: () => void;
}

function CalendarContentInner({
  tasks,
  instruments,
  clients,
  loading,
  navigation,
  view,
  setView,
  onTaskClick,
  onTaskDelete,
  onSelectEvent,
  onSelectSlot,
  onOpenNewTask,
}: CalendarContentProps) {
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

  // Calculate summary stats with filtered tasks
  const summaryStats = useMemo(() => {
    return calculateSummaryStats(filteredTasks);
  }, [filteredTasks]);

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

  const resetFiltersAndUpdate = useCallback(() => {
    resetFilters();
    navigation.setSelectedDate(null);
  }, [resetFilters, navigation]);

  // Handle summary card clicks to apply filters
  const handleSummaryCardClick = useCallback(
    (status: 'all' | 'overdue' | 'today' | 'upcoming') => {
      const today = startOfDay(new Date());

      switch (status) {
        case 'all':
          // Reset all filters
          resetFiltersAndUpdate();
          break;
        case 'overdue':
          // Filter to overdue tasks (before today)
          setDateRange({
            from: null, // No start date
            to: format(subDays(today, 1), 'yyyy-MM-dd'), // Yesterday
          });
          // Also set status filter to exclude completed/cancelled
          setFilterStatus('pending');
          break;
        case 'today':
          // Filter to tasks due today
          const todayStr = format(today, 'yyyy-MM-dd');
          setDateRange({
            from: todayStr,
            to: todayStr,
          });
          break;
        case 'upcoming':
          // Filter to upcoming tasks (next 7 days)
          setDateRange({
            from: format(addDays(today, 1), 'yyyy-MM-dd'), // Tomorrow
            to: format(addDays(today, 7), 'yyyy-MM-dd'), // 7 days from now
          });
          break;
      }
    },
    [resetFiltersAndUpdate, setDateRange, setFilterStatus]
  );

  const isEmptyState = !loading.fetch && filteredTasks.length === 0;
  const showPagination = totalPages > 1 && view === 'list';

  return (
    <div className="p-6">
      {/* Header with Navigation */}
      <div className="mb-4">
        <CalendarHeader
          currentDate={navigation.currentDate}
          calendarView={navigation.calendarView}
          view={view}
          onPrevious={navigation.handlePrevious}
          onNext={navigation.handleNext}
          onGoToToday={navigation.handleGoToToday}
          onViewChange={setView}
          onOpenNewTask={onOpenNewTask}
        />
      </div>

      {/* Filters */}
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

      {/* Summary Cards */}
      <div className="mb-4">
        <CalendarSummary
          total={summaryStats.total}
          overdue={summaryStats.overdue}
          today={summaryStats.today}
          upcoming={summaryStats.upcoming}
          onFilterByStatus={handleSummaryCardClick}
        />
      </div>

      {/* Calendar or List View */}
      {loading.fetch ? (
        <div className="rounded-lg bg-white p-4 shadow-sm md:p-6 border border-gray-200">
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
          className="rounded-lg bg-white overflow-hidden p-4 shadow-sm md:p-6 border border-gray-200"
          style={{ minHeight: '700px' }}
        >
          <CalendarView
            tasks={filteredTasks}
            instruments={taskData.instrumentsMap}
            onSelectEvent={onSelectEvent}
            onSelectSlot={onSelectSlot}
            currentDate={navigation.currentDate}
            onNavigate={navigation.setCurrentDate}
            currentView={navigation.calendarView}
            onViewChange={navigation.setCalendarView}
          />
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="border-b border-gray-100 p-4 md:p-6">
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
          <div className="p-4 md:p-6">
            <GroupedTaskList
              tasks={paginatedTasks}
              instruments={taskData.instrumentsMap}
              clients={taskData.clientsMap}
              onTaskClick={onTaskClick}
              onTaskDelete={onTaskDelete}
              searchTerm={searchTerm}
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

export default function CalendarContent(props: CalendarContentProps) {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <div className="mb-4">
            <div className="h-16 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="mb-4">
            <div className="h-32 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm md:p-6 border border-gray-200">
            <TableSkeleton rows={8} columns={4} />
          </div>
        </div>
      }
    >
      <CalendarContentInner {...props} />
    </Suspense>
  );
}
