import type { MaintenanceTask } from '@/types';
import { normalizeTaskStatusKey } from '@/utils/colorTokens';

/**
 * Calendar-related utility functions
 * Centralized logic for date priority, status labels, and task grouping
 */

/**
 * Get the primary date key for a task based on priority
 * Priority: due_date > personal_due_date > scheduled_date > received_date
 *
 * This is used for grouping and sorting tasks consistently across the calendar.
 *
 * @param task - Maintenance task
 * @returns Date string (YYYY-MM-DD) or null
 */
export function getTaskDateKey(task: MaintenanceTask): string | null {
  return (
    task.due_date ||
    task.personal_due_date ||
    task.scheduled_date ||
    task.received_date ||
    null
  );
}

/**
 * Status label mapping for display
 * Maps internal status values to user-friendly labels
 *
 * For future i18n support, this can be extended to use translation functions
 */
export const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  waiting_for_parts: 'Waiting for Parts',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * ✅ FIXED: Get display label for a task status with normalization
 * Normalizes status strings (handles snake_case, cancelled/canceled, etc.)
 * Falls back to replacing underscores with spaces if no mapping exists
 *
 * @param status - Task status string (may be in various formats)
 * @returns User-friendly status label
 */
export function getStatusLabel(status: string): string {
  // Normalize status to handle variations (snake_case, cancelled/canceled, etc.)
  const normalized = normalizeTaskStatusKey(status);

  // Map normalized key back to display label
  // normalizeTaskStatusKey returns CamelCase, but STATUS_LABELS uses snake_case
  const keyMap: Record<string, string> = {
    Pending: 'pending',
    InProgress: 'in_progress',
    Completed: 'completed',
    Cancelled: 'cancelled',
  };

  const labelKey = keyMap[normalized] || status.toLowerCase();
  return STATUS_LABELS[labelKey] || status.replaceAll('_', ' ');
}

/**
 * Priority label mapping for display
 * Maps internal priority values to user-friendly labels
 */
export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

/**
 * Get display label for a task priority
 *
 * @param priority - Task priority string
 * @returns User-friendly priority label
 */
export function getPriorityLabel(priority: string): string {
  return (
    PRIORITY_LABELS[priority] ||
    priority.charAt(0).toUpperCase() + priority.slice(1)
  );
}
