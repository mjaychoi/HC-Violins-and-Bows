import { addDays, isBefore, isSameDay, startOfDay } from 'date-fns';
import type { MaintenanceTask } from '@/types';
import type { DateRange, FilterOperator } from '@/types/search';
import type { TaskType, TaskStatus, TaskPriority } from '@/types';
import { toLocalYMD, parseTaskDateLocal } from '@/utils/dateParsing';

/**
 * Check if a date string is within the date range
 * FIXED: Use toLocalYMD for consistent normalization (avoids timezone shifts)
 */
const checkDateInRange = (dateStr: string, dateRange: DateRange): boolean => {
  const fromStr = dateRange.from ? toLocalYMD(dateRange.from) : '1900-01-01';
  const toStr = dateRange.to ? toLocalYMD(dateRange.to) : '9999-12-31';
  const taskYMD = toLocalYMD(dateStr);

  return taskYMD >= fromStr && taskYMD <= toStr;
};

/**
 * Filter tasks by date range
 * 
 * Filter operator behavior:
 * - OR: Task is included if ANY date field (received_date, due_date, personal_due_date, scheduled_date, completed_date) falls within the range.
 *       This is the more common UX pattern: "show all tasks that have any activity in this period".
 * - AND: Task is included ONLY if ALL date fields fall within the range.
 *       This is more restrictive and may exclude tasks that have some dates in range but others outside.
 *       Use case: "strictly filter to tasks that are completely contained within this date window".
 */
export const filterByDateRange = (
  tasks: MaintenanceTask[],
  dateRange: DateRange | null,
  operator: FilterOperator
): MaintenanceTask[] => {
  // Early return if no date range provided
  if (!dateRange?.from && !dateRange?.to) {
    return tasks;
  }

  return tasks.filter(task => {
    const dateFields = [
      task.received_date,
      task.due_date,
      task.personal_due_date,
      task.scheduled_date,
      task.completed_date,
    ].filter(Boolean) as string[];

    if (dateFields.length === 0) return false;

    // OR condition: at least one date must be in range
    if (operator === 'OR') {
      return dateFields.some(date => checkDateInRange(date, dateRange));
    }
    // AND condition: all dates must be in range
    // Note: This is more restrictive - all date fields must be within the range.
    // Tasks with some dates in range and others outside will be excluded.
    return dateFields.every(date => checkDateInRange(date, dateRange));
  });
};

/**
 * Filter tasks by status
 */
export const filterByStatus = (
  tasks: MaintenanceTask[],
  status: string
): MaintenanceTask[] => {
  if (status === 'all') {
    return tasks;
  }
  return tasks.filter(task => task.status === status);
};

/**
 * Filter tasks by ownership
 */
export const filterByOwnership = (
  tasks: MaintenanceTask[],
  ownership: string,
  instrumentsMap: Map<
    string,
    {
      ownership: string | null;
      [key: string]: unknown;
    }
  >
): MaintenanceTask[] => {
  if (ownership === 'all') {
    return tasks;
  }
  return tasks.filter(task => {
    const instrument = task.instrument_id
      ? instrumentsMap.get(task.instrument_id)
      : undefined;
    return instrument?.ownership === ownership;
  });
};

/**
 * Filter tasks by search filters (type, priority, owner)
 */
export const filterBySearchFilters = (
  tasks: MaintenanceTask[],
  searchFilters: {
    type?: TaskType | 'all';
    priority?: TaskPriority | 'all';
    status?: TaskStatus | 'all';
    owner?: string | 'all';
  },
  instrumentsMap: Map<
    string,
    {
      ownership: string | null;
      [key: string]: unknown;
    }
  >
): MaintenanceTask[] => {
  let filtered = tasks;

  if (searchFilters.type && searchFilters.type !== 'all') {
    filtered = filtered.filter(task => task.task_type === searchFilters.type);
  }

  if (searchFilters.priority && searchFilters.priority !== 'all') {
    filtered = filtered.filter(task => task.priority === searchFilters.priority);
  }

  if (searchFilters.owner && searchFilters.owner !== 'all') {
    filtered = filtered.filter(task => {
      const instrument = task.instrument_id
        ? instrumentsMap.get(task.instrument_id)
        : undefined;
      return instrument?.ownership === searchFilters.owner;
    });
  }

  return filtered;
};

/**
 * Calculate summary statistics for tasks
 * FIXED: Use parseTaskDateLocal to handle date-only strings correctly (avoid timezone shifts)
 */
export const calculateSummaryStats = (
  tasks: MaintenanceTask[]
): {
  overdue: number;
  today: number;
  upcoming: number;
  total: number;
} => {
  const today = startOfDay(new Date());
  let overdue = 0;
  let todayCount = 0;
  let upcoming = 0;

  tasks.forEach(task => {
    const dateStr =
      task.scheduled_date || task.due_date || task.personal_due_date;
    if (!dateStr) return;

    if (task.status === 'completed' || task.status === 'cancelled') return;

    try {
      // FIXED: Use parseTaskDateLocal to handle date-only strings correctly
      const taskDate = startOfDay(parseTaskDateLocal(dateStr));

      if (isBefore(taskDate, today)) {
        overdue += 1;
      } else if (isSameDay(taskDate, today)) {
        todayCount += 1;
      } else if (isBefore(taskDate, addDays(today, 7))) {
        upcoming += 1;
      }
    } catch {
      // Skip invalid dates
      return;
    }
  });

  return {
    overdue,
    today: todayCount,
    upcoming,
    total: tasks.length,
  };
};
