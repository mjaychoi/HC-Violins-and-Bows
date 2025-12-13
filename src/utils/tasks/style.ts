import type { TaskPriority, TaskStatus, MaintenanceTask } from '@/types';
import { parseISO, differenceInCalendarDays, isBefore, endOfDay } from 'date-fns';

export interface StatusColorOptions {
  isOverdue?: boolean;
  isUpcoming?: boolean;
  task?: MaintenanceTask;
}

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
 * FIXED: Color based on status only (Overdue=Red, In Progress=Blue, Scheduled=Green, Completed=Gray)
 */
export function getStatusPillClasses(
  status: TaskStatus,
  options?: StatusColorOptions
): string {
  const normalized = status.toLowerCase() as TaskStatus;

  // Completed/Cancelled tasks are always gray
  if (normalized === 'completed' || normalized === 'cancelled') {
    return 'bg-gray-300 text-gray-800';
  }

  // Overdue tasks are red
  if (options?.isOverdue) {
    return 'bg-red-500 text-white';
  }

  // In Progress tasks are blue
  if (normalized === 'in_progress') {
    return 'bg-blue-500 text-white';
  }

  // Scheduled/Pending tasks are green
  if (normalized === 'pending' || options?.isUpcoming) {
    return 'bg-emerald-500 text-white';
  }

  // Default: scheduled state (green)
  return 'bg-emerald-500 text-white';
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
 * Calculate date status for a task to determine if it's overdue/upcoming
 * Uses precise timestamp comparison for overdue check and calendar days for "within 3 days"
 */
export function getDateStatus(task: MaintenanceTask): {
  status: 'overdue' | 'upcoming' | 'normal';
  days: number;
} {
  const dueDate =
    task.due_date || task.personal_due_date || task.scheduled_date;
  if (!dueDate) {
    return { status: 'normal', days: 0 };
  }

  try {
    // Handle different date types: string, Date, or already parsed
    let dueDateObj: Date;
    if (typeof dueDate === 'string') {
      dueDateObj = parseISO(dueDate);
    } else if (dueDate && typeof dueDate === 'object' && 'getTime' in dueDate && typeof (dueDate as { getTime?: () => number }).getTime === 'function') {
      dueDateObj = dueDate as Date;
    } else {
      dueDateObj = parseISO(String(dueDate));
    }
    
    const now = new Date();
    
    // Use endOfDay for overdue check to treat tasks due today as not overdue until end of day
    const dueDateEndOfDay = endOfDay(dueDateObj);
    const isOverdue = isBefore(dueDateEndOfDay, now);
    
    // Use calendar days for "within 3 days" calculation
    const days = differenceInCalendarDays(dueDateObj, now);

    if (isOverdue) {
      return { status: 'overdue', days: Math.abs(days) };
    } else if (days > 0 && days <= 3) {
      return { status: 'upcoming', days };
    } else {
      return { status: 'normal', days };
    }
  } catch {
    return { status: 'normal', days: 0 };
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
 * FIXED: Color based on status only
 * - Overdue/Urgent: Red
 * - In Progress: Blue
 * - Scheduled/Pending: Green
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
  // Normalize status to handle case-sensitivity
  const status = (task.status ?? '').toLowerCase() as TaskStatus;
  
  const dateStatus = getDateStatus(task);
  const isOverdue = dateStatus.status === 'overdue';

  // 1. Completed/Cancelled: Gray
  if (status === 'completed') {
    return {
      backgroundColor: '#9ca3af', // Gray-400
      borderColor: '#6b7280', // Gray-500
      opacity: 0.7,
      textDecoration: 'line-through',
      color: '#ffffff',
    };
  }

  if (status === 'cancelled') {
    return {
      backgroundColor: '#9ca3af', // Gray-400
      borderColor: '#6b7280', // Gray-500
      opacity: 0.6,
      color: '#ffffff',
    };
  }

  // 2. Overdue: Red
  if (isOverdue) {
    return {
      backgroundColor: '#ef4444', // Red-500
      borderColor: '#dc2626', // Red-600
      opacity: 1,
      color: '#ffffff',
      border: '2px solid #dc2626',
    };
  }

  // 3. In Progress: Blue
  if (status === 'in_progress') {
    return {
      backgroundColor: '#3b82f6', // Blue-500
      borderColor: '#2563eb', // Blue-600
      opacity: 1,
      color: '#ffffff',
    };
  }

  // 4. Scheduled/Pending: Green
  if (status === 'pending' || task.scheduled_date) {
    return {
      backgroundColor: '#10b981', // Emerald-500
      borderColor: '#059669', // Emerald-600
      opacity: 1,
      color: '#ffffff',
    };
  }

  // Default: Scheduled (green)
  return {
    backgroundColor: '#10b981', // Emerald-500
    borderColor: '#059669', // Emerald-600
    opacity: 1,
    color: '#ffffff',
  };
}
