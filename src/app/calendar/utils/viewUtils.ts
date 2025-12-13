import { format, startOfWeek, endOfWeek } from 'date-fns';
import type { ExtendedView } from '../components/CalendarView';

/**
 * Get view range label for display
 */
export const getViewRangeLabel = (
  view: ExtendedView,
  currentDate: Date
): string => {
  if (view === 'week') {
    return `${format(startOfWeek(currentDate), 'MMM d')} - ${format(
      endOfWeek(currentDate),
      'MMM d, yyyy'
    )}`;
  }
  if (view === 'year') {
    return format(currentDate, 'yyyy');
  }
  return format(currentDate, 'MMMM yyyy');
};
