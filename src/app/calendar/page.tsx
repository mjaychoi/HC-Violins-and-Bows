'use client';

import React, { useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useMaintenanceTasks } from '@/hooks/useMaintenanceTasks';
import { useUnifiedInstruments, useUnifiedClients } from '@/hooks/useUnifiedData';
import { useModalState } from '@/hooks/useModalState';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { usePageNotifications } from '@/hooks/usePageNotifications';
import { AppLayout } from '@/components/layout';
import {
  ErrorBoundary,
  TableSkeleton,
  ConfirmDialog,
  NotificationBadge,
  Pagination,
} from '@/components/common';
import {
  CalendarHeader,
  CalendarFilters,
  CalendarSummary,
  CalendarEmptyState,
  TaskModal,
  GroupedTaskList,
} from './components';
import Button from '@/components/common/Button';
import type { MaintenanceTask } from '@/types';
import {
  useCalendarFilters,
  useCalendarNavigation,
  useCalendarView,
  useCalendarTasks,
} from './hooks';
import { format, startOfDay, subDays, addDays } from 'date-fns';
import { getDateRangeForView } from './utils';
import { calculateSummaryStats } from './utils/filterUtils';
import {
  CALENDAR_MESSAGES,
  CALENDAR_ERROR_MESSAGES,
  CALENDAR_CONFIRM_MESSAGES,
} from './constants';

// Dynamic import for CalendarView to reduce initial bundle size
const CalendarView = dynamic(
  () => import('./components/CalendarView').then(mod => ({ default: mod.default })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg bg-white p-4 shadow-sm md:p-6 border border-gray-200">
        <TableSkeleton rows={5} columns={4} />
      </div>
    ),
  }
);


export default function CalendarPage() {
  const { ErrorToasts, SuccessToasts, handleError, showSuccess } =
    useAppFeedback();
  
  // FIXED: useUnifiedData is now called at root layout level
  // Use specific hooks to read data (they don't trigger fetches)
  const { instruments } = useUnifiedInstruments();
  const { clients } = useUnifiedClients();
  const [hasTableError, setHasTableError] = useState(false);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState<MaintenanceTask | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState<string>('');

  // Calendar data hooks
  const {
    tasks,
    loading,
    createTask,
    updateTask,
    deleteTask,
    fetchTasksByDateRange,
  } = useMaintenanceTasks();

  // Page notifications (badge with click handler)
  // For calendar page, clicking badge should navigate to today
  // FIXED: Now passes tasks to prevent duplicate fetch
  const { notificationBadge } = usePageNotifications({
    tasks, // Use tasks from useMaintenanceTasks to avoid duplicate fetch
    navigateTo: '', // Don't navigate, use custom handler instead
    showToastOnClick: true,
    showSuccess,
    // Uses default formatter from policies/notifications.ts
  });

  const {
    isOpen: showModal,
    isEditing,
    openModal,
    closeModal,
    openEditModal,
    selectedItem: selectedTask,
  } = useModalState<MaintenanceTask>();

  // Handle table error
  const handleTableError = useCallback((error: unknown) => {
    const supabaseError = error as { code?: string; message?: string };
    const errorCode = supabaseError?.code;
    const errorMessage = supabaseError?.message || '';

    if (
      errorCode === '42P01' ||
      errorMessage.includes('does not exist') ||
      errorMessage.includes('relation')
    ) {
      setHasTableError(true);
    }
  }, []);

  // Calendar navigation
  const navigation = useCalendarNavigation({
    fetchTasksByDateRange,
    onError: handleTableError,
  });

  // Override onClick to go to today instead of navigating
  // Note: notificationBadge is a data object with { overdue, upcoming, today, onClick } structure
  // as defined by usePageNotifications hook (not a ReactNode)
  const handleNotificationBadgeClick = () => {
    const hasNotifications = notificationBadge.overdue + notificationBadge.upcoming + notificationBadge.today > 0;
    if (hasNotifications) {
      notificationBadge.onClick();
      navigation.handleGoToToday();
    }
  };

  // Calendar view (calendar/list toggle)
  const { view, setView } = useCalendarView();

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
    resetFilters,
    setPage,
  } = filterState;

  const resetFiltersAndUpdate = useCallback(() => {
    resetFilters();
    navigation.setSelectedDate(null);
  }, [resetFilters, navigation]);

  // Handle summary card clicks to apply filters
  const handleSummaryCardClick = useCallback((status: 'all' | 'overdue' | 'today' | 'upcoming') => {
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
  }, [resetFiltersAndUpdate, setDateRange, setFilterStatus]);

  const handleOpenNewTask = useCallback(() => {
    setModalDefaultDate('');
    openModal();
  }, [openModal]);

  const handleCreateTask = useCallback(
    async (
      taskData: Omit<
        MaintenanceTask,
        'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
      >
    ) => {
      try {
        await createTask(taskData);
        closeModal();
        const { startDate, endDate } = getDateRangeForView(
          navigation.calendarView,
          navigation.currentDate
        );
        await fetchTasksByDateRange(startDate, endDate);
        showSuccess(CALENDAR_MESSAGES.TASK_CREATED);
      } catch (error) {
        handleError(error, CALENDAR_ERROR_MESSAGES.CREATE_TASK);
      }
    },
    [createTask, closeModal, navigation.calendarView, navigation.currentDate, fetchTasksByDateRange, showSuccess, handleError]
  );

  const handleUpdateTask = useCallback(
    async (
      taskData: Omit<
        MaintenanceTask,
        'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
      >
    ) => {
      if (!selectedTask) return;
      try {
        await updateTask(selectedTask.id, taskData);
        closeModal();
        const { startDate, endDate } = getDateRangeForView(
          navigation.calendarView,
          navigation.currentDate
        );
        await fetchTasksByDateRange(startDate, endDate);
        showSuccess(CALENDAR_MESSAGES.TASK_UPDATED);
      } catch (error) {
        handleError(error, CALENDAR_ERROR_MESSAGES.UPDATE_TASK);
      }
    },
    [selectedTask, updateTask, closeModal, navigation.calendarView, navigation.currentDate, fetchTasksByDateRange, showSuccess, handleError]
  );

  const handleDeleteTaskRequest = useCallback((task: MaintenanceTask) => {
    setConfirmDeleteTask(task);
  }, []);

  const handleConfirmDeleteTask = useCallback(async () => {
    if (!confirmDeleteTask) return;

    try {
      await deleteTask(confirmDeleteTask.id);
      const { startDate, endDate } = getDateRangeForView(
        navigation.calendarView,
        navigation.currentDate
      );
      await fetchTasksByDateRange(startDate, endDate);
      showSuccess(CALENDAR_MESSAGES.TASK_DELETED);
      setConfirmDeleteTask(null);
    } catch (error) {
      handleError(error, CALENDAR_ERROR_MESSAGES.DELETE_TASK);
    }
  }, [confirmDeleteTask, deleteTask, navigation.calendarView, navigation.currentDate, fetchTasksByDateRange, showSuccess, handleError]);

  const handleSelectEvent = (task: MaintenanceTask) => {
    openEditModal(task);
  };

  const handleSelectSlot = (slotInfo: { start: Date; end: Date }) => {
    navigation.setSelectedDate(slotInfo.start);
    setModalDefaultDate(format(slotInfo.start, 'yyyy-MM-dd'));
    openModal();
  };

  const handleTaskClick = (task: MaintenanceTask) => {
    openEditModal(task);
  };


  const isEmptyState = !loading && filteredTasks.length === 0;
  const showPagination = totalPages > 1 && view === 'list';

  // 테이블이 없을 때 표시할 메시지
  if (hasTableError) {
    return (
      <ErrorBoundary>
        <AppLayout title="Calendar">
          <div className="p-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
              <h2 className="text-xl font-semibold text-yellow-800 mb-2">
                Database table does not exist
              </h2>
              <p className="text-yellow-700 mb-4">
                To use calendar features, the{' '}
                <code className="bg-yellow-100 px-2 py-1 rounded">
                  maintenance_tasks
                </code>{' '}
                table is required.
              </p>
              <div className="text-left bg-white p-4 rounded border border-yellow-200 mb-4">
                <p className="font-semibold mb-2">Solution:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>
                    {/* SECURITY: Don't expose internal project ID in UI */}
                    {/* Link should point to internal documentation or general Supabase docs */}
                    Access Supabase Dashboard:{' '}
                    <a
                      href="https://supabase.com/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Open SQL Editor
                    </a>
                  </li>
                  <li>
                    Copy contents from{' '}
                    <code className="bg-gray-100 px-2 py-1 rounded">
                      migration-maintenance-tasks.sql
                    </code>
                  </li>
                  <li>Paste into SQL Editor and click Run</li>
                  <li>Refresh the page</li>
                </ol>
              </div>
              <Button onClick={() => window.location.reload()} className="mt-4">
                Refresh Page
              </Button>
            </div>
          </div>
        </AppLayout>
        <ErrorToasts />
        <SuccessToasts />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppLayout
        title="Calendar"
        headerActions={
          notificationBadge.overdue + notificationBadge.upcoming + notificationBadge.today > 0 ? (
            <NotificationBadge
              overdue={notificationBadge.overdue}
              upcoming={notificationBadge.upcoming}
              today={notificationBadge.today}
              onClick={handleNotificationBadgeClick}
            />
          ) : null
        }
      >
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
              onOpenNewTask={handleOpenNewTask}
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
              onOpenNewTask={handleOpenNewTask}
            />
          ) : view === 'calendar' ? (
            <div
              className="rounded-lg bg-white overflow-hidden p-4 shadow-sm md:p-6 border border-gray-200"
              style={{ minHeight: '700px' }}
            >
              <CalendarView
                tasks={filteredTasks}
                instruments={taskData.instrumentsMap}
                onSelectEvent={handleSelectEvent}
                onSelectSlot={handleSelectSlot}
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
                  onTaskClick={handleTaskClick}
                  onTaskDelete={handleDeleteTaskRequest}
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

            {/* Task Modal */}
            <TaskModal
              isOpen={showModal}
              onClose={() => {
                closeModal();
                setModalDefaultDate('');
              }}
              onSubmit={isEditing ? handleUpdateTask : handleCreateTask}
              submitting={loading.mutate}
              selectedTask={selectedTask}
              isEditing={isEditing}
              instruments={instruments}
              clients={clients}
              defaultScheduledDate={modalDefaultDate}
            />

            {/* Error Toasts */}
            <ErrorToasts />
            {/* Success Toasts */}
            <SuccessToasts />
            <ConfirmDialog
              isOpen={Boolean(confirmDeleteTask)}
              title={CALENDAR_CONFIRM_MESSAGES.DELETE_TASK_TITLE}
              message={CALENDAR_CONFIRM_MESSAGES.DELETE_TASK_MESSAGE}
              confirmLabel={CALENDAR_CONFIRM_MESSAGES.DELETE_CONFIRM_LABEL}
              cancelLabel={CALENDAR_CONFIRM_MESSAGES.DELETE_CANCEL_LABEL}
              onConfirm={handleConfirmDeleteTask}
              onCancel={() => setConfirmDeleteTask(null)}
            />
          </div>
      </AppLayout>
    </ErrorBoundary>
  );
}
