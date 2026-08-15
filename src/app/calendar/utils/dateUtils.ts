import {
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

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
 * Date range fetched for the production Month calendar.
 */
export const getDateRangeForView = (
  date: Date
): { startDate: string; endDate: string } => {
  return getMonthVisibleGridRange(date);
};

/**
 * Navigate to the previous month.
 */
export const navigatePrevious = (currentDate: Date): Date => {
  const newDate = new Date(currentDate);
  newDate.setMonth(newDate.getMonth() - 1);
  return newDate;
};

/**
 * Navigate to the next month.
 */
export const navigateNext = (currentDate: Date): Date => {
  const newDate = new Date(currentDate);
  newDate.setMonth(newDate.getMonth() + 1);
  return newDate;
};
