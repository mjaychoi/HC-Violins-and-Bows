'use client';

import React, { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useMaintenanceTasks } from '@/hooks/useMaintenanceTasks';
import {
  useUnifiedInstruments,
  useUnifiedClients,
} from '@/hooks/useUnifiedData';
import { useModalState } from '@/hooks/useModalState';
import { usePageNotifications } from '@/hooks/usePageNotifications';
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
import type { MaintenanceTask, ContactLog } from '@/types';
import { toLocalYMD } from '@/utils/dateParsing';
import { useCalendarNavigation, useCalendarView } from './hooks';
import {
  CALENDAR_MESSAGES,
  CALENDAR_ERROR_MESSAGES,
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
  const { handleError, showSuccess } = useAppFeedback();

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
    createTask,
    updateTask,
    deleteTask,
    fetchTasksByDateRange,
  } = useMaintenanceTasks();

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

  // Page notifications (badge with click handler)
  // For calendar page, clicking badge should navigate to today
  // FIXED: Now passes tasks to prevent duplicate fetch
  // FIXED: Use customClickHandler to avoid double navigation
  const { notificationBadge } = usePageNotifications({
    tasks, // Use tasks from useMaintenanceTasks to avoid duplicate fetch
    navigateTo: '', // Don't navigate, use custom handler instead
    showToastOnClick: true,
    showSuccess,
    customClickHandler: () => {
      // Custom handler: navigate to today (toast is handled by default onClick)
      navigation.handleGoToToday();
    },
    // Uses default formatter from policies/notifications.ts
  });

  // Calendar view (calendar/list toggle)
  const { view, setView } = useCalendarView();

  // Fetch contact logs for follow-ups
  const [contactLogs, setContactLogs] = useState<ContactLog[]>([]);

  const fetchContactLogs = useCallback(async () => {
    try {
      // Fetch all follow-ups (past, today, and future) for calendar display
      // hasFollowUp=true gets all logs with next_follow_up_date set (regardless of date)
      const response = await fetch(`/api/contacts?hasFollowUp=true`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch contact logs');
      }

      // Filter to only include incomplete follow-ups (not completed)
      const incompleteFollowUps = (result.data || []).filter(
        (log: ContactLog) => !log.follow_up_completed_at
      );

      setContactLogs(incompleteFollowUps);
    } catch (error) {
      handleError(error, 'Fetch follow-ups');
    }
  }, [handleError]);

  useEffect(() => {
    fetchContactLogs();
  }, [fetchContactLogs]);

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
        // Use navigation's refetchCurrentRange instead of manual range calculation
        await navigation.refetchCurrentRange();
        showSuccess(CALENDAR_MESSAGES.TASK_CREATED);
      } catch (error) {
        handleError(error, CALENDAR_ERROR_MESSAGES.CREATE_TASK);
      }
    },
    [createTask, closeModal, navigation, showSuccess, handleError]
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
        // Use navigation's refetchCurrentRange instead of manual range calculation
        await navigation.refetchCurrentRange();
        showSuccess(CALENDAR_MESSAGES.TASK_UPDATED);
      } catch (error) {
        handleError(error, CALENDAR_ERROR_MESSAGES.UPDATE_TASK);
      }
    },
    [selectedTask, updateTask, closeModal, navigation, showSuccess, handleError]
  );

  const handleDeleteTaskRequest = useCallback((task: MaintenanceTask) => {
    setConfirmDeleteTask(task);
  }, []);

  const handleConfirmDeleteTask = useCallback(async () => {
    if (!confirmDeleteTask) return;

    try {
      await deleteTask(confirmDeleteTask.id);
      // Use navigation's refetchCurrentRange instead of manual range calculation
      await navigation.refetchCurrentRange();
      showSuccess(CALENDAR_MESSAGES.TASK_DELETED);
      setConfirmDeleteTask(null);
    } catch (error) {
      handleError(error, CALENDAR_ERROR_MESSAGES.DELETE_TASK);
    }
  }, [confirmDeleteTask, deleteTask, navigation, showSuccess, handleError]);

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
        | { kind: 'follow_up'; contactLog: ContactLog }
        | undefined;

      // Only handle task events (not follow-up events)
      if (!resource || resource.kind !== 'task') {
        setDraggingEventId(null);
        return;
      }

      const task = resource.task;
      if (!task || !task.id) {
        setDraggingEventId(null);
        return;
      }

      // Store original date for rollback (use local variable to avoid stale state)
      let originalDate: string;
      let dateField: 'due_date' | 'personal_due_date' | 'scheduled_date';

      if (task.due_date) {
        originalDate = task.due_date;
        dateField = 'due_date';
      } else if (task.personal_due_date) {
        originalDate = task.personal_due_date;
        dateField = 'personal_due_date';
      } else if (task.scheduled_date) {
        originalDate = task.scheduled_date;
        dateField = 'scheduled_date';
      } else {
        setDraggingEventId(null);
        return;
      }

      // Store backup in local variable to avoid stale state issues
      const backup = {
        taskId: task.id,
        originalDate,
        dateField,
      };
      setDraggingEventId(task.id);

      try {
        // Convert Date to YYYY-MM-DD format (date-only, no time preserved)
        const newDate = toLocalYMD(start.toISOString());

        // Determine which date field to update based on task's current date priority
        // Priority: due_date > personal_due_date > scheduled_date
        const updateData: Partial<MaintenanceTask> = {};

        if (task.due_date) {
          updateData.due_date = newDate;
        } else if (task.personal_due_date) {
          updateData.personal_due_date = newDate;
        } else {
          updateData.scheduled_date = newDate;
        }

        await updateTask(task.id, updateData);
        await navigation.refetchCurrentRange();
        showSuccess('Task date updated successfully.');
      } catch (error) {
        // Rollback on error using local backup variable
        try {
          const rollbackData: Partial<MaintenanceTask> = {
            [backup.dateField]: backup.originalDate,
          };
          await updateTask(task.id, rollbackData);
          await navigation.refetchCurrentRange();
        } catch (rollbackError) {
          console.error('Failed to rollback task date:', rollbackError);
        }
        handleError(error, 'Failed to update task date');
      } finally {
        setDraggingEventId(null);
      }
    },
    [updateTask, navigation, showSuccess, handleError]
  );

  // Handle event resize: update task end time
  const handleEventResize = useCallback(
    async (data: { event: { resource?: unknown }; start: Date; end: Date }) => {
      const { event, start } = data;
      const resource = event.resource as
        | { kind: 'task'; task: MaintenanceTask }
        | { kind: 'follow_up'; contactLog: ContactLog }
        | undefined;

      // Only handle task events (not follow-up events)
      if (!resource || resource.kind !== 'task') {
        return;
      }

      const task = resource.task;
      if (!task || !task.id) {
        return;
      }

      setDraggingEventId(task.id);

      try {
        // For resize, we update the date based on the start time
        const newDate = toLocalYMD(start.toISOString());

        const updateData: Partial<MaintenanceTask> = {};

        if (task.due_date) {
          updateData.due_date = newDate;
        } else if (task.personal_due_date) {
          updateData.personal_due_date = newDate;
        } else {
          updateData.scheduled_date = newDate;
        }

        await updateTask(task.id, updateData);
        await navigation.refetchCurrentRange();
        showSuccess('Task time updated successfully.');
      } catch (error) {
        handleError(error, 'Failed to update task time');
      } finally {
        setDraggingEventId(null);
      }
    },
    [updateTask, navigation, showSuccess, handleError]
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
          contactLogs={contactLogs}
          instruments={instruments}
          clients={clients}
          loading={loading}
          navigation={navigation}
          view={view}
          setView={setView}
          onTaskClick={handleTaskClick}
          onTaskDelete={handleDeleteTaskRequest}
          onTaskEdit={handleTaskClick}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          draggingEventId={draggingEventId}
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
