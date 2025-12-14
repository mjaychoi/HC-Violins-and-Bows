import { format, startOfWeek, endOfWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { ExtendedView } from '../components/CalendarView';

/**
 * Get view range label for display
 * Uses Korean locale to match CalendarView
 */
export const getViewRangeLabel = (
  view: ExtendedView,
  currentDate: Date
): string => {
  if (view === 'week') {
    return `${format(startOfWeek(currentDate, { locale: ko }), 'MMM d', { locale: ko })} - ${format(
      endOfWeek(currentDate, { locale: ko }),
      'MMM d, yyyy',
      { locale: ko }
    )}`;
  }
  if (view === 'year') {
    return format(currentDate, 'yyyy', { locale: ko });
  }
  return format(currentDate, 'MMMM yyyy', { locale: ko });
};
