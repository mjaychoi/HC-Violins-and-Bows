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
 * Must match react-big-calendar month grid (culture en-US → Sunday week start).
 */
export const CALENDAR_WEEK_STARTS_ON = 0 as const;

/**
 * Inclusive YYYY-MM-DD range covering the week-aligned month grid cells
 * (leading previous-month and trailing next-month padding days).
 */
export function getMonthVisibleGridRange(date: Date): {
  startDate: string;
  endDate: string;
} {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  return {
    startDate: format(
      startOfWeek(monthStart, { weekStartsOn: CALENDAR_WEEK_STARTS_ON }),
      'yyyy-MM-dd'
    ),
    endDate: format(
      endOfWeek(monthEnd, { weekStartsOn: CALENDAR_WEEK_STARTS_ON }),
      'yyyy-MM-dd'
    ),
  };
}

/**
 * Agenda lists the calendar month only — no month-grid padding.
 */
export function getAgendaMonthRange(date: Date): {
  startDate: string;
  endDate: string;
} {
  return {
    startDate: format(startOfMonth(date), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(date), 'yyyy-MM-dd'),
  };
}

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
    const weekStart = startOfWeek(date, {
      weekStartsOn: CALENDAR_WEEK_STARTS_ON,
    });
    const weekBefore = addWeeks(weekStart, -2);
    const weekAfter = addWeeks(weekStart, 2);
    return {
      startDate: format(weekBefore, 'yyyy-MM-dd'),
      endDate: format(
        endOfWeek(weekAfter, { weekStartsOn: CALENDAR_WEEK_STARTS_ON }),
        'yyyy-MM-dd'
      ),
    };
  } else if (view === 'week') {
    const weekStart = startOfWeek(date, {
      weekStartsOn: CALENDAR_WEEK_STARTS_ON,
    });
    const weekEnd = endOfWeek(date, { weekStartsOn: CALENDAR_WEEK_STARTS_ON });
    return {
      startDate: format(weekStart, 'yyyy-MM-dd'),
      endDate: format(weekEnd, 'yyyy-MM-dd'),
    };
  } else if (view === 'month') {
    return getMonthVisibleGridRange(date);
  } else {
    // agenda (and any unknown default): calendar month only, not grid padding
    return getAgendaMonthRange(date);
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
