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
    // Explicitly set weekStartsOn to 0 (Sunday) for consistency
    return `${format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d', { locale: ko })} - ${format(
      endOfWeek(currentDate, { weekStartsOn: 0 }),
      'MMM d, yyyy',
      { locale: ko }
    )}`;
  }
  if (view === 'year') {
    return format(currentDate, 'yyyy', { locale: ko });
  }
  return format(currentDate, 'MMMM yyyy', { locale: ko });
};
