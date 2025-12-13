'use client';

import React, { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { useMaintenanceTasks } from '@/hooks/useMaintenanceTasks';
import {
  useUnifiedInstruments,
  useUnifiedClients,
} from '@/hooks/useUnifiedData';
import { useModalState } from '@/hooks/useModalState';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { usePageNotifications } from '@/hooks/usePageNotifications';
import { AppLayout } from '@/components/layout';
import {
  ErrorBoundary,
  ConfirmDialog,
  NotificationBadge,
} from '@/components/common';
import { TaskModal } from './components';
import CalendarContent from './components/CalendarContent';
import Button from '@/components/common/Button';
import type { MaintenanceTask } from '@/types';
import { useCalendarNavigation, useCalendarView } from './hooks';
import { getDateRangeForView } from './utils';
import {
  CALENDAR_MESSAGES,
  CALENDAR_ERROR_MESSAGES,
  CALENDAR_CONFIRM_MESSAGES,
} from './constants';

export default function CalendarPage() {
  const { ErrorToasts, SuccessToasts, handleError, showSuccess } =
    useAppFeedback();

  // FIXED: useUnifiedData is now called at root layout level
  // Use specific hooks to read data (they don't trigger fetches)
  const { instruments } = useUnifiedInstruments();
  const { clients } = useUnifiedClients();
  const [hasTableError, setHasTableError] = useState(false);
  const [confirmDeleteTask, setConfirmDeleteTask] =
    useState<MaintenanceTask | null>(null);
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
    const hasNotifications =
      notificationBadge.overdue +
        notificationBadge.upcoming +
        notificationBadge.today >
      0;
    if (hasNotifications) {
      notificationBadge.onClick();
      navigation.handleGoToToday();
    }
  };

  // Calendar view (calendar/list toggle)
  const { view, setView } = useCalendarView();

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
    [
      createTask,
      closeModal,
      navigation.calendarView,
      navigation.currentDate,
      fetchTasksByDateRange,
      showSuccess,
      handleError,
    ]
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
    [
      selectedTask,
      updateTask,
      closeModal,
      navigation.calendarView,
      navigation.currentDate,
      fetchTasksByDateRange,
      showSuccess,
      handleError,
    ]
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
  }, [
    confirmDeleteTask,
    deleteTask,
    navigation.calendarView,
    navigation.currentDate,
    fetchTasksByDateRange,
    showSuccess,
    handleError,
  ]);

  const handleSelectEvent = (task: MaintenanceTask) => {
    openEditModal(task);
  };

  const handleSelectSlot = useCallback(
    (slotInfo: { start: Date; end: Date }) => {
      navigation.setSelectedDate(slotInfo.start);
      setModalDefaultDate(format(slotInfo.start, 'yyyy-MM-dd'));
      openModal();
    },
    [navigation, openModal]
  );

  const handleTaskClick = (task: MaintenanceTask) => {
    openEditModal(task);
  };

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
          notificationBadge.overdue +
            notificationBadge.upcoming +
            notificationBadge.today >
          0 ? (
            <NotificationBadge
              overdue={notificationBadge.overdue}
              upcoming={notificationBadge.upcoming}
              today={notificationBadge.today}
              onClick={handleNotificationBadgeClick}
            />
          ) : null
        }
      >
        <CalendarContent
          tasks={tasks}
          instruments={instruments}
          clients={clients}
          loading={loading}
          navigation={navigation}
          view={view}
          setView={setView}
          onTaskClick={handleTaskClick}
          onTaskDelete={handleDeleteTaskRequest}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          onOpenNewTask={handleOpenNewTask}
        />

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
      </AppLayout>
    </ErrorBoundary>
  );
}
