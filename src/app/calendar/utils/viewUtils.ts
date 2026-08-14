import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';

/**
 * Month range label for the production calendar header (English locale).
 */
export const getViewRangeLabel = (currentDate: Date): string => {
  return format(currentDate, 'MMMM yyyy', { locale: enUS });
};
