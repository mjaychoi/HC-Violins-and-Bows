'use client';

import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useMaintenanceTasks } from '@/hooks/useMaintenanceTasks';
import {
  useUnifiedInstruments,
  useUnifiedClients,
} from '@/hooks/useUnifiedData';
import { useModalState } from '@/hooks/useModalState';
import { usePageNotifications } from '@/hooks/usePageNotifications';
import { usePermissions } from '@/hooks/usePermissions';
// Import useAppFeedback after other hooks to avoid webpack module loading issues
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { AppLayout } from '@/components/layout';
import {
  ErrorBoundary,
  ConfirmDialog,
  NotificationBadge,
  TableSkeleton,
} from '@/components/common';
import { Button } from '@/components/common/inputs';
import type { MaintenanceTask } from '@/types';
import { toLocalYMD } from '@/utils/dateParsing';
import { getCalendarPlacementField } from '@/utils/calendar';
import { useCalendarNavigation, useCalendarView } from './hooks';
import {
  CALENDAR_MESSAGES,
  CALENDAR_WARNING_MESSAGES,
  CALENDAR_CONFIRM_MESSAGES,
} from './constants';

// Dynamic imports for large components to reduce initial bundle size
const CalendarContent = dynamic(() => import('./components/CalendarContent'), {
  loading: () => (
    <div className="p-6">
      <TableSkeleton rows={8} columns={7} />
    </div>
  ),
  ssr: false,
});

const TaskModal = dynamic(() => import('./components/TaskModal'), {
  ssr: false,
});

export default function CalendarPage() {
  const { handleError, showSuccess, showWarning } = useAppFeedback();
  const { canCreateTask, canManageTasks, createTaskDisabledReason } =
    usePermissions();

  // FIXED: useUnifiedData is now called at root layout level
  // Use specific hooks to read data (they don't trigger fetches)
  const { instruments } = useUnifiedInstruments();
  const { clients } = useUnifiedClients();
  const [hasTableError, setHasTableError] = useState(false);
  const [confirmDeleteTask, setConfirmDeleteTask] =
    useState<MaintenanceTask | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState<string>('');
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);

  // Calendar data hooks
  const {
    tasks,
    loading,
    error: fetchError,
    displayError: fetchDisplayError,
    createTask,
    updateTask,
    deleteTask,
    fetchTasksByDateRange,
  } = useMaintenanceTasks({ autoFetch: false });

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
    onRefetchFailure: () => {
      showWarning(CALENDAR_WARNING_MESSAGES.CALENDAR_DATA_LOAD_FAILED);
    },
  });

  const refreshCalendarAfterMutation = useCallback(
    async (warningMessage: string) => {
      try {
        await navigation.forceRefetch({ suppressErrorToast: true });
        return true;
      } catch {
        showWarning(warningMessage);
        return false;
      }
    },
    [navigation, showWarning]
  );

  // Page notifications (badge with click handler)
  // For calendar page, clicking badge should navigate to today
  // FIXED: Now passes tasks to prevent duplicate fetch
  // FIXED: Use customClickHandler to avoid double navigation
  const { notificationBadge } = usePageNotifications({
    tasks, // Use tasks from useMaintenanceTasks to avoid duplicate fetch
    navigateTo: '', // Don't navigate, use custom handler instead
    showToastOnClick: true,
    showSuccess,
    showWarning,
    customClickHandler: () => {
      navigation.handleGoToToday();
    },
    // Uses default formatter from policies/notifications.ts
  });

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
      let created: MaintenanceTask;
      try {
        created = await createTask(taskData);
      } catch (err) {
        throw err;
      }

      if (!created?.id) {
        showWarning(
          'Task could not be confirmed from the server. Please check the calendar or refresh.'
        );
        return;
      }

      closeModal();
      const refreshed = await refreshCalendarAfterMutation(
        CALENDAR_WARNING_MESSAGES.CREATE_REFRESH_FAILED
      );
      if (refreshed) {
        showSuccess(CALENDAR_MESSAGES.TASK_CREATED);
      }
    },
    [
      createTask,
      closeModal,
      refreshCalendarAfterMutation,
      showSuccess,
      showWarning,
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
      let updated: MaintenanceTask;
      try {
        updated = await updateTask(selectedTask.id, taskData);
      } catch (err) {
        throw err;
      }

      if (!updated?.id) {
        showWarning(
          'Update could not be confirmed from the server. Please try again or refresh.'
        );
        return;
      }

      closeModal();
      const refreshed = await refreshCalendarAfterMutation(
        CALENDAR_WARNING_MESSAGES.UPDATE_REFRESH_FAILED
      );
      if (refreshed) {
        showSuccess(CALENDAR_MESSAGES.TASK_UPDATED);
      }
    },
    [
      selectedTask,
      updateTask,
      closeModal,
      refreshCalendarAfterMutation,
      showSuccess,
      showWarning,
    ]
  );

  const handleDeleteTaskRequest = useCallback((task: MaintenanceTask) => {
    setConfirmDeleteTask(task);
  }, []);

  const handleConfirmDeleteTask = useCallback(async () => {
    if (!confirmDeleteTask) return;

    try {
      await deleteTask(confirmDeleteTask.id);
    } catch {
      return;
    }

    setConfirmDeleteTask(null);
    const refreshed = await refreshCalendarAfterMutation(
      CALENDAR_WARNING_MESSAGES.DELETE_REFRESH_FAILED
    );
    if (refreshed) {
      showSuccess(CALENDAR_MESSAGES.TASK_DELETED);
    }
  }, [
    confirmDeleteTask,
    deleteTask,
    refreshCalendarAfterMutation,
    showSuccess,
  ]);

  const handleSelectEvent = (task: MaintenanceTask) => {
    openEditModal(task);
  };

  const handleSelectSlot = useCallback(
    (slotInfo: { start: Date; end: Date }) => {
      navigation.setSelectedDate(slotInfo.start);
      // FIXED: Use toLocalYMD utility to convert Date to YYYY-MM-DD (single source of truth)
      setModalDefaultDate(toLocalYMD(slotInfo.start.toISOString()));
      openModal();
    },
    [navigation, openModal]
  );

  // Handle drag & drop: update task date when event is dropped
  const handleEventDrop = useCallback(
    async (data: {
      event: { resource?: unknown };
      start: Date;
      end: Date;
      isAllDay?: boolean;
    }) => {
      const { event, start } = data;
      const resource = event.resource as
        | { kind: 'task'; task: MaintenanceTask }
        | undefined;

      if (!resource || resource.kind !== 'task') {
        setDraggingEventId(null);
        return;
      }

      const task = resource.task;
      if (!task || !task.id) {
        setDraggingEventId(null);
        return;
      }

      const dateField = getCalendarPlacementField(task);
      if (!dateField) {
        setDraggingEventId(null);
        return;
      }
      const originalDate = task[dateField];
      if (!originalDate) {
        setDraggingEventId(null);
        return;
      }

      // Store backup in local variable to avoid stale state issues
      const backup = {
        originalDate,
        dateField,
      };
      setDraggingEventId(task.id);

      try {
        let updated: MaintenanceTask;
        try {
          // Convert Date to YYYY-MM-DD format (date-only, no time preserved)
          const newDate = toLocalYMD(start.toISOString());

          const updateData: Partial<MaintenanceTask> = {
            [dateField]: newDate,
          };

          updated = await updateTask(task.id, updateData);
        } catch (error) {
          // Rollback on error using local backup variable
          try {
            const rollbackData: Partial<MaintenanceTask> = {
              [backup.dateField]: backup.originalDate,
            };
            await updateTask(task.id, rollbackData);
            await navigation.forceRefetch({ suppressErrorToast: true });
          } catch {
            showWarning(CALENDAR_WARNING_MESSAGES.ROLLBACK_FAILED);
          }
          handleError(error, 'Failed to update task date');
          return;
        }

        if (!updated?.id) {
          showWarning(
            'The move could not be confirmed. Please refresh the calendar.'
          );
          return;
        }

        const refreshed = await refreshCalendarAfterMutation(
          CALENDAR_WARNING_MESSAGES.DATE_REFRESH_FAILED
        );
        if (refreshed) {
          showSuccess('Task date updated successfully.');
        }
      } finally {
        setDraggingEventId(null);
      }
    },
    [
      updateTask,
      navigation,
      refreshCalendarAfterMutation,
      showSuccess,
      showWarning,
      handleError,
    ]
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
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppLayout
        title="Calendar"
        actionButton={
          canCreateTask || createTaskDisabledReason
            ? {
                label: 'Add Task',
                onClick: canCreateTask
                  ? handleOpenNewTask
                  : () => {
                      /* disabled — see disabledReason */
                    },
                disabled: !canCreateTask || loading.mutate,
                disabledReason: !canCreateTask
                  ? createTaskDisabledReason
                  : loading.mutate
                    ? 'Please wait for the current submission to finish'
                    : undefined,
                icon: (
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
                ),
              }
            : undefined
        }
        headerActions={
          notificationBadge.overdue +
            notificationBadge.upcoming +
            notificationBadge.today >
          0 ? (
            <NotificationBadge
              overdue={notificationBadge.overdue}
              upcoming={notificationBadge.upcoming}
              today={notificationBadge.today}
              onClick={notificationBadge.onClick}
            />
          ) : null
        }
      >
        <CalendarContent
          tasks={tasks}
          instruments={instruments}
          clients={clients}
          loading={loading}
          fetchError={fetchDisplayError ?? fetchError}
          onRetry={() => {
            void navigation.forceRefetch().catch(() => {
              showWarning(CALENDAR_WARNING_MESSAGES.MANUAL_REFETCH_FAILED);
            });
          }}
          navigation={navigation}
          view={view}
          setView={setView}
          onTaskClick={handleTaskClick}
          onTaskDelete={handleDeleteTaskRequest}
          onTaskEdit={handleTaskClick}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          onEventDrop={handleEventDrop}
          draggingEventId={draggingEventId}
          onOpenNewTask={handleOpenNewTask}
          canCreateTask={canCreateTask && !loading.mutate}
          createTaskDisabledReason={
            !canCreateTask
              ? createTaskDisabledReason
              : loading.mutate
                ? 'Please wait for the current submission to finish'
                : undefined
          }
          canManageTask={canManageTasks}
          manageTaskDisabledReason="Admin only"
          onTaskUpdate={updateTask}
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

        <ConfirmDialog
          isOpen={Boolean(confirmDeleteTask)}
          title={CALENDAR_CONFIRM_MESSAGES.DELETE_TASK_TITLE}
          message={CALENDAR_CONFIRM_MESSAGES.DELETE_TASK_MESSAGE}
          confirmLabel={CALENDAR_CONFIRM_MESSAGES.DELETE_CONFIRM_LABEL}
          cancelLabel={CALENDAR_CONFIRM_MESSAGES.DELETE_CANCEL_LABEL}
          onConfirm={handleConfirmDeleteTask}
          onCancel={() => setConfirmDeleteTask(null)}
          submitting={loading.mutate}
          submittingLabel="Deleting..."
        />
      </AppLayout>
    </ErrorBoundary>
  );
}
