/**
 * Canonical date utilities for maintenance tasks
 * Single source of truth for date priority and notification classification
 * ✅ FIXED: Unified with getDateStatus for consistent overdue calculation
 */

import {
  differenceInCalendarDays,
  isSameDay,
  format,
  isBefore,
  endOfDay,
} from 'date-fns';
import type { MaintenanceTask } from '@/types';
import { parseYMDLocal, startOfDay } from '@/utils/dateParsing';
import { normalizeTaskStatusKey } from '@/utils/colorTokens';

/**
 * Normalize date string to a stable day key (YYYY-MM-DD)
 * Handles different date formats (YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss, etc.)
 * and ensures same-day dates group together
 * ✅ FIXED: Uses parseYMDLocal directly (parseTaskDate removed)
 */
export function toDayKey(dateStr: string): string {
  const parsed = parseYMDLocal(dateStr);
  if (!parsed) return '';
  return format(parsed, 'yyyy-MM-dd');
}

/**
 * Get the primary due date for a task based on priority
 * Priority: due_date > personal_due_date > scheduled_date
 *
 * @returns Date object (normalized to start of day) or null
 * ✅ FIXED: Uses parseYMDLocal directly with validation
 */
export function getTaskDueDate(task: MaintenanceTask): Date | null {
  const dateStr =
    task.due_date || task.personal_due_date || task.scheduled_date;
  if (!dateStr) return null;

  // ✅ FIXED: Use parseYMDLocal directly (parseTaskDate removed)
  // parseYMDLocal handles validation internally
  const parsed = parseYMDLocal(dateStr);
  if (parsed) return startOfDay(parsed);

  return null;
}

/**
 * ✅ FIXED: Classify a task's notification status
 * - Uses endOfDay-based overdue check (consistent with getDateStatus)
 * - Uses normalizeTaskStatusKey for status comparison (handles cancelled/canceled, etc.)
 * - Unified logic with calendar date status calculation
 *
 * Returns the notification type and days until/overdue
 */
export function classifyNotification(
  task: MaintenanceTask,
  today: Date,
  upcomingDays: number = 3
): {
  type: 'overdue' | 'today' | 'upcoming' | null;
  daysUntil: number;
} | null {
  // ✅ FIXED: Use normalizeTaskStatusKey for status comparison
  // Handles cancelled/canceled, completed variations consistently
  const normalizedStatus = normalizeTaskStatusKey(task.status);
  if (normalizedStatus === 'Completed' || normalizedStatus === 'Cancelled') {
    return null;
  }

  const dueDate = getTaskDueDate(task);
  if (!dueDate) return null;

  const now = new Date();
  const todayStart = startOfDay(today);

  // ✅ FIXED: Use endOfDay-based overdue check (consistent with getDateStatus)
  // This ensures "due date is today" tasks are not marked overdue until end of day
  const dueEndOfDay = endOfDay(dueDate);
  const isOverdue = isBefore(dueEndOfDay, now);

  // Calculate days difference for display
  const daysDiff = differenceInCalendarDays(dueDate, todayStart);

  if (isOverdue) {
    // Overdue: due date has passed (end of day)
    return {
      type: 'overdue',
      daysUntil: Math.abs(daysDiff), // Positive number: days since due date
    };
  } else if (isSameDay(dueDate, todayStart)) {
    // Today: due date is today (but not overdue yet)
    return {
      type: 'today',
      daysUntil: 0,
    };
  } else if (daysDiff > 0 && daysDiff <= upcomingDays) {
    // Upcoming: daysDiff is positive, meaning days until due date
    return {
      type: 'upcoming',
      daysUntil: daysDiff, // Positive number: days until due date
    };
  }

  return null;
}
