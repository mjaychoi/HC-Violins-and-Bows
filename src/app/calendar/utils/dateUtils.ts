import {
  addWeeks,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import type { ExtendedView } from '../components/CalendarView';

/**
 * Get date range for a calendar view
 */
export const getDateRangeForView = (
  view: ExtendedView,
  date: Date
): { startDate: string; endDate: string } => {
  if (view === 'year') {
    const yearStart = startOfYear(date);
    const yearEnd = endOfYear(date);
    return {
      startDate: format(yearStart, 'yyyy-MM-dd'),
      endDate: format(yearEnd, 'yyyy-MM-dd'),
    };
  } else if (view === 'timeline') {
    // Explicitly set weekStartsOn to 0 (Sunday) for consistency
    const weekStart = startOfWeek(date, { weekStartsOn: 0 });
    const weekBefore = addWeeks(weekStart, -2);
    const weekAfter = addWeeks(weekStart, 2);
    return {
      startDate: format(weekBefore, 'yyyy-MM-dd'),
      endDate: format(endOfWeek(weekAfter, { weekStartsOn: 0 }), 'yyyy-MM-dd'),
    };
  } else if (view === 'week') {
    // Explicitly set weekStartsOn to 0 (Sunday) for consistency
    const weekStart = startOfWeek(date, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(date, { weekStartsOn: 0 });
    return {
      startDate: format(weekStart, 'yyyy-MM-dd'),
      endDate: format(weekEnd, 'yyyy-MM-dd'),
    };
  } else {
    // Default: month or agenda
    return {
      startDate: format(startOfMonth(date), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(date), 'yyyy-MM-dd'),
    };
  }
};

/**
 * Navigate to previous period based on view
 */
export const navigatePrevious = (
  view: ExtendedView,
  currentDate: Date
): Date => {
  const newDate = new Date(currentDate);
  if (view === 'month' || view === 'agenda') {
    newDate.setMonth(newDate.getMonth() - 1);
  } else if (view === 'week' || view === 'timeline') {
    newDate.setDate(newDate.getDate() - 7);
  } else if (view === 'year') {
    newDate.setFullYear(newDate.getFullYear() - 1);
  }
  return newDate;
};

/**
 * Navigate to next period based on view
 */
export const navigateNext = (view: ExtendedView, currentDate: Date): Date => {
  const newDate = new Date(currentDate);
  if (view === 'month' || view === 'agenda') {
    newDate.setMonth(newDate.getMonth() + 1);
  } else if (view === 'week' || view === 'timeline') {
    newDate.setDate(newDate.getDate() + 7);
  } else if (view === 'year') {
    newDate.setFullYear(newDate.getFullYear() + 1);
  }
  return newDate;
};
