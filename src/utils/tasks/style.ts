import type { TaskPriority, TaskStatus, MaintenanceTask } from '@/types';
import {
  differenceInCalendarDays,
  isBefore,
  endOfDay,
  startOfDay,
} from 'date-fns';
// ✅ FIXED: Use centralized date parsing (single source of truth)
import { parseTaskDateLocal } from '@/utils/dateParsing';
// ✅ FIXED: Use centralized color tokens
import { getTaskStatusColor, getTaskStatusDotColor } from '@/utils/colorTokens';

export interface StatusColorOptions {
  isOverdue?: boolean;
  isUpcoming?: boolean;
  task?: MaintenanceTask;
}

/**
 * Normalize task status to a valid TaskStatus value
 * Uses whitelist approach for type safety
 */
function normalizeStatus(input: unknown): TaskStatus {
  const s = String(input ?? '').toLowerCase();
  if (
    s === 'pending' ||
    s === 'in_progress' ||
    s === 'completed' ||
    s === 'cancelled'
  ) {
    return s as TaskStatus;
  }
  // Safe default: pending
  return 'pending';
}

// ✅ FIXED: parseTaskDateLocal moved to @/utils/dateParsing for single source of truth
// Import from dateParsing to ensure consistent date handling across the codebase

/**
 * Get Tailwind CSS classes for priority pill styling
 * FIXED: Priority now only affects urgency, not color
 */
export function getPriorityPillClasses(priority: TaskPriority): string {
  // Priority is now only visual weight, not color
  switch (priority.toLowerCase() as TaskPriority) {
    case 'urgent':
    case 'high':
      return 'bg-gray-100 text-gray-800 font-semibold';
    case 'medium':
      return 'bg-gray-100 text-gray-700';
    case 'low':
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

/**
 * Get Tailwind CSS classes for status pill styling
 * ✅ FIXED: Use centralized color tokens
 */
export function getStatusPillClasses(
  status: TaskStatus,
  options?: StatusColorOptions
): string {
  return getTaskStatusColor(status, {
    isOverdue: options?.isOverdue,
    isUpcoming: options?.isUpcoming,
  });
}

/**
 * Get status color classes (without border) for simpler use cases
 */
export function getStatusColorClasses(
  status: TaskStatus,
  options?: StatusColorOptions
): string {
  const pillClasses = getStatusPillClasses(status, options);
  // Remove border classes if present (for simpler use cases)
  return pillClasses.replace(/\bborder-\S+\s*/g, '').trim();
}

/**
 * Get status dot color class (for small indicators)
 * ✅ FIXED: Use centralized color tokens
 */
export function getStatusDotClasses(
  status: TaskStatus,
  options?: StatusColorOptions
): string {
  return getTaskStatusDotColor(status, {
    isOverdue: options?.isOverdue,
    isUpcoming: options?.isUpcoming,
  });
}

/**
 * Calculate date status for a task to determine if it's overdue/upcoming
 * FIXED: Uses local day parsing to avoid UTC timezone issues
 * FIXED: Uses startOfDay for stable calendar day calculations
 */
export function getDateStatus(task: MaintenanceTask): {
  status: 'overdue' | 'upcoming' | 'normal';
  days: number;
} {
  const raw = task.due_date || task.personal_due_date || task.scheduled_date;
  if (!raw) {
    return { status: 'normal', days: 0 };
  }

  const due = parseTaskDateLocal(raw);
  if (!due) {
    return { status: 'normal', days: 0 };
  }

  const now = new Date();

  // FIXED: Use startOfDay for stable calendar day calculations
  // This ensures days calculation is not affected by time of day
  const dueStart = startOfDay(due);
  const nowStart = startOfDay(now);

  // Overdue check: end of due date must be before now
  const dueEndOfDay = endOfDay(due);
  const isOverdue = isBefore(dueEndOfDay, now);

  // FIXED: Calculate days using startOfDay to avoid off-by-one errors
  // Positive = future, negative = past, 0 = today
  const days = differenceInCalendarDays(dueStart, nowStart);

  if (isOverdue) {
    return { status: 'overdue', days: Math.abs(days) };
  } else if (days > 0 && days <= 3) {
    return { status: 'upcoming', days };
  } else {
    return { status: 'normal', days };
  }
}

/**
 * Get date text color classes based on date type and status
 */
export function getDateColorClasses(
  dateType: 'received' | 'due' | 'personal' | 'scheduled'
): string {
  switch (dateType) {
    case 'due':
      return 'text-blue-600';
    case 'personal':
      return 'text-slate-400';
    case 'scheduled':
      return 'text-blue-600';
    case 'received':
    default:
      return 'text-slate-600';
  }
}

/**
 * Get calendar event style (backgroundColor, borderColor, opacity, etc.)
 * for react-big-calendar Event components
 *
 * FIXED: Color based on status only (not scheduled_date presence)
 * - Overdue: Red
 * - In Progress: Blue
 * - Scheduled/Pending/Upcoming: Green
 * - Completed: Gray
 */
export function getCalendarEventStyle(task: MaintenanceTask): {
  backgroundColor: string;
  borderColor: string;
  opacity?: number;
  textDecoration?: string;
  color?: string;
  border?: string;
} {
  // ✅ FIXED: Use centralized color tokens
  const status = normalizeStatus(task.status);
  const dateStatus = getDateStatus(task);
  const isOverdue = dateStatus.status === 'overdue';
  const isUpcoming = dateStatus.status === 'upcoming';

  // Color mapping from tokens to hex values for react-big-calendar
  const colorMap: Record<string, { bg: string; border: string }> = {
    overdue: { bg: '#ef4444', border: '#dc2626' }, // Red-500, Red-600
    inProgress: { bg: '#3b82f6', border: '#2563eb' }, // Blue-500, Blue-600
    pending: { bg: '#10b981', border: '#059669' }, // Emerald-500, Emerald-600
    completed: { bg: '#9ca3af', border: '#6b7280' }, // Gray-400, Gray-500
  };

  // 1. Completed/Cancelled: Gray
  if (status === 'completed') {
    const colors = colorMap.completed;
    return {
      backgroundColor: colors.bg,
      borderColor: colors.border,
      opacity: 0.7,
      textDecoration: 'line-through',
      color: '#ffffff',
    };
  }

  if (status === 'cancelled') {
    const colors = colorMap.completed;
    return {
      backgroundColor: colors.bg,
      borderColor: colors.border,
      opacity: 0.6,
      color: '#ffffff',
    };
  }

  // 2. Overdue: Red
  if (isOverdue) {
    const colors = colorMap.overdue;
    return {
      backgroundColor: colors.bg,
      borderColor: colors.border,
      opacity: 1,
      color: '#ffffff',
      border: `2px solid ${colors.border}`,
    };
  }

  // 3. In Progress: Blue
  if (status === 'in_progress') {
    const colors = colorMap.inProgress;
    return {
      backgroundColor: colors.bg,
      borderColor: colors.border,
      opacity: 1,
      color: '#ffffff',
    };
  }

  // 4. Scheduled/Pending/Upcoming: Emerald
  if (status === 'pending' || isUpcoming) {
    const colors = colorMap.pending;
    return {
      backgroundColor: colors.bg,
      borderColor: colors.border,
      opacity: 1,
      color: '#ffffff',
    };
  }

  // Default: Scheduled (emerald)
  const colors = colorMap.pending;
  return {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    opacity: 1,
    color: '#ffffff',
  };
}
