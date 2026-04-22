import type { TaskPriority, TaskStatus } from '@/types';

/**
 * Priority order for sorting and filtering
 * Higher number = higher priority
 */
export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Status order for sorting
 * Lower number = earlier in sort order
 */
export const STATUS_ORDER: Record<TaskStatus, number> = {
  pending: 1,
  in_progress: 2,
  completed: 3,
  cancelled: 4,
};

/**
 * Get priority order value (defaults to 0 for unknown priorities)
 */
export function getPriorityOrder(
  priority: TaskPriority | string | null | undefined
): number {
  if (!priority || typeof priority !== 'string') return 0;
  return PRIORITY_ORDER[priority as TaskPriority] || 0;
}

/**
 * Get status order value (defaults to 0 for unknown statuses)
 */
export function getStatusOrder(
  status: TaskStatus | string | null | undefined
): number {
  if (!status || typeof status !== 'string') return 0;
  return STATUS_ORDER[status as TaskStatus] || 0;
}

export const CALENDAR_MESSAGES = {
  TASK_CREATED: 'Task created successfully.',
  TASK_UPDATED: 'Task updated successfully.',
  TASK_DELETED: 'Task deleted successfully.',
};

export const CALENDAR_ERROR_MESSAGES = {
  CREATE_TASK: 'Failed to create task',
  UPDATE_TASK: 'Failed to update task',
  DELETE_TASK: 'Failed to delete task',
};

export const CALENDAR_WARNING_MESSAGES = {
  CREATE_REFRESH_FAILED:
    'Task was created, but the calendar failed to refresh. Please retry.',
  UPDATE_REFRESH_FAILED:
    'Task was updated, but the calendar failed to refresh. Please retry.',
  DELETE_REFRESH_FAILED:
    'Task was deleted, but the calendar failed to refresh. Please retry.',
  DATE_REFRESH_FAILED:
    'Task date was updated, but the calendar failed to refresh. Please retry.',
  TIME_REFRESH_FAILED:
    'Task time was updated, but the calendar failed to refresh. Please retry.',
  ROLLBACK_FAILED:
    'Could not fully undo the last change. The calendar may be out of sync—please refresh the page.',
  MANUAL_REFETCH_FAILED:
    'Could not reload tasks. The list may be outdated; please try again or refresh the page.',
  CALENDAR_DATA_LOAD_FAILED:
    'Could not load tasks for this view. Please try again or refresh the page.',
};

export const CALENDAR_CONFIRM_MESSAGES = {
  DELETE_TASK_TITLE: 'Delete maintenance task',
  DELETE_TASK_MESSAGE:
    'Are you sure you want to delete this task? This cannot be undone.',
  DELETE_CONFIRM_LABEL: 'Delete',
  DELETE_CANCEL_LABEL: 'Cancel',
};
