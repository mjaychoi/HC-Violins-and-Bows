/**
 * Calendar page constants
 * Shared messages, labels, and configuration values
 */

// Success messages
export const CALENDAR_MESSAGES = {
  TASK_CREATED: 'Task created successfully.',
  TASK_UPDATED: 'Task updated successfully.',
  TASK_DELETED: 'Task deleted successfully.',
} as const;

// Error messages
export const CALENDAR_ERROR_MESSAGES = {
  CREATE_TASK: 'Failed to create task',
  UPDATE_TASK: 'Failed to update task',
  DELETE_TASK: 'Failed to delete task',
  FETCH_TASKS: 'Failed to fetch tasks',
} as const;

// Confirm dialog messages
export const CALENDAR_CONFIRM_MESSAGES = {
  DELETE_TASK_TITLE: 'Delete task?',
  DELETE_TASK_MESSAGE: 'Deleted tasks cannot be recovered.',
  DELETE_CONFIRM_LABEL: 'Delete',
  DELETE_CANCEL_LABEL: 'Cancel',
} as const;
