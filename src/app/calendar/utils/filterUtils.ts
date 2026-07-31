import { addDays, isBefore } from 'date-fns';
import { format } from 'date-fns';
import type { MaintenanceTask } from '@/types';
import type { DateRange, FilterOperator } from '@/types/search';
import type { TaskType, TaskStatus, TaskPriority } from '@/types';
import { toLocalYMD, parseYMDLocal, todayLocalYMD } from '@/utils/dateParsing';
import {
  getCalendarPlacementDate,
  isCalendarPlacementInRange,
} from '@/utils/calendar';

/**
 * Filter tasks by date range using the canonical calendar placement date
 * (due → personal → scheduled → received), matching grid/summary/presets.
 *
 * Filter operator:
 * - OR / AND both evaluate the single placement date (there is only one).
 *   AND remains for API compatibility with the shared FilterOperator type.
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

  void operator;

  const fromStr = dateRange.from ? toLocalYMD(dateRange.from) : '1900-01-01';
  const toStr = dateRange.to ? toLocalYMD(dateRange.to) : '9999-12-31';

  return tasks.filter(task => isCalendarPlacementInRange(task, fromStr, toStr));
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
  ownershipMap: Map<
    string,
    {
      ownership: string | null;
    }
  >
): MaintenanceTask[] => {
  if (ownership === 'all') {
    return tasks;
  }
  return tasks.filter(task => {
    const instrument = task.instrument_id
      ? ownershipMap.get(task.instrument_id)
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
  ownershipMap: Map<
    string,
    {
      ownership: string | null;
    }
  >
): MaintenanceTask[] => {
  let filtered = tasks;

  if (searchFilters.type && searchFilters.type !== 'all') {
    filtered = filtered.filter(task => task.task_type === searchFilters.type);
  }

  if (searchFilters.priority && searchFilters.priority !== 'all') {
    filtered = filtered.filter(
      task => task.priority === searchFilters.priority
    );
  }

  if (searchFilters.owner && searchFilters.owner !== 'all') {
    filtered = filtered.filter(task => {
      const instrument = task.instrument_id
        ? ownershipMap.get(task.instrument_id)
        : undefined;
      return instrument?.ownership === searchFilters.owner;
    });
  }

  return filtered;
};

/**
 * Calculate summary statistics for tasks
 * FIXED: Use parseYMDLocal for consistent date parsing strategy
 */
export const calculateSummaryStats = (
  tasks: MaintenanceTask[]
): {
  overdue: number;
  today: number;
  upcoming: number;
  total: number;
} => {
  // Use standardized "today" source for consistency
  const todayYMD = todayLocalYMD();
  const today = parseYMDLocal(todayYMD)!;
  const todayStr = format(today, 'yyyy-MM-dd');
  let overdue = 0;
  let todayCount = 0;
  let upcoming = 0;

  tasks.forEach(task => {
    const dateStr = getCalendarPlacementDate(task);
    if (!dateStr) return;

    if (task.status === 'completed' || task.status === 'cancelled') return;

    try {
      // FIXED: Use parseYMDLocal for consistent date parsing strategy
      const taskDate = parseYMDLocal(dateStr);
      if (!taskDate) return;

      // Normalize to YYYY-MM-DD string for reliable comparison
      const taskDateStr = format(taskDate, 'yyyy-MM-dd');

      if (isBefore(taskDate, today)) {
        overdue += 1;
      } else if (taskDateStr === todayStr) {
        // Use string comparison for exact day match
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
