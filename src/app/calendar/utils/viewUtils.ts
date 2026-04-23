import { format, startOfWeek, endOfWeek } from 'date-fns';
import { enUS } from 'date-fns/locale';
import type { ExtendedView } from '../components/CalendarView';

/**
 * Get view range label for display (English locale)
 */
export const getViewRangeLabel = (
  view: ExtendedView,
  currentDate: Date
): string => {
  if (view === 'week') {
    // Explicitly set weekStartsOn to 0 (Sunday) for consistency
    return `${format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d', { locale: enUS })} - ${format(
      endOfWeek(currentDate, { weekStartsOn: 0 }),
      'MMM d, yyyy',
      { locale: enUS }
    )}`;
  }
  if (view === 'year') {
    return format(currentDate, 'yyyy', { locale: enUS });
  }
  return format(currentDate, 'MMMM yyyy', { locale: enUS });
};
