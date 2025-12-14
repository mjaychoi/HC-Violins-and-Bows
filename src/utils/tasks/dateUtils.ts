/**
 * Canonical date utilities for maintenance tasks
 * Single source of truth for date priority and notification classification
 */

import {
  differenceInCalendarDays,
  isSameDay,
  format,
  parseISO,
} from 'date-fns';
import type { MaintenanceTask } from '@/types';
import { parseYMDLocal, startOfDay } from '@/utils/dateParsing';

/**
 * Parse date-only strings (YYYY-MM-DD) as local dates to avoid timezone shifts
 * parseISO('2025-12-12') interprets as UTC midnight, which can render as previous day in US timezones
 * This function parses date-only strings as local dates instead
 *
 * @deprecated Use parseYMDLocal from '@/utils/dateParsing' for consistency
 */
export function parseTaskDate(dateStr: string): Date {
  const parsed = parseYMDLocal(dateStr);
  if (parsed) return parsed;
  // Fallback for non-date-only strings
  return parseISO(dateStr);
}

/**
 * Normalize date string to a stable day key (YYYY-MM-DD)
 * Handles different date formats (YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss, etc.)
 * and ensures same-day dates group together
 */
export function toDayKey(dateStr: string): string {
  const date = parseTaskDate(dateStr);
  return format(date, 'yyyy-MM-dd');
}

/**
 * Get the primary due date for a task based on priority
 * Priority: due_date > personal_due_date > scheduled_date
 *
 * @returns Date object (normalized to start of day) or null
 */
export function getTaskDueDate(task: MaintenanceTask): Date | null {
  const dateStr =
    task.due_date || task.personal_due_date || task.scheduled_date;
  if (!dateStr) return null;

  try {
    // FIXED: Use parseTaskDate to handle date-only strings correctly (avoid timezone shifts)
    const parsed = parseTaskDate(dateStr);
    return startOfDay(parsed);
  } catch {
    return null;
  }
}

/**
 * Classify a task's notification status
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
  // Skip completed/cancelled tasks
  if (task.status === 'completed' || task.status === 'cancelled') {
    return null;
  }

  const dueDate = getTaskDueDate(task);
  if (!dueDate) return null;

  const todayStart = startOfDay(today);
  const daysDiff = differenceInCalendarDays(dueDate, todayStart);

  if (daysDiff < 0) {
    // Overdue: daysDiff is negative, so abs(daysDiff) = days since due date
    return {
      type: 'overdue',
      daysUntil: Math.abs(daysDiff), // Positive number: days since due date
    };
  } else if (isSameDay(dueDate, todayStart)) {
    // Today: due date is today
    return {
      type: 'today',
      daysUntil: 0,
    };
  } else if (daysDiff <= upcomingDays) {
    // Upcoming: daysDiff is positive, meaning days until due date
    return {
      type: 'upcoming',
      daysUntil: daysDiff, // Positive number: days until due date
    };
  }

  return null;
}
