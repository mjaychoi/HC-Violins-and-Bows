import { parseYMDUTC, formatDisplayDate } from '@/utils/dateParsing';

export const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// Re-export for backward compatibility
export { parseYMDUTC };

// FIXED: Unified date formatter - use formatDisplayDate from dateParsing utils
// This ensures consistent date formatting across all pages
// Maintains Intl.DateTimeFormat interface for backward compatibility
export const dateFormat = {
  format: (date: Date) => {
    // Convert Date to YYYY-MM-DD string for formatDisplayDate
    const ymd = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    return formatDisplayDate(ymd);
  },
} as Intl.DateTimeFormat;
