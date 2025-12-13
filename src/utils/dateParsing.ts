/**
 * FIXED: Date parsing utilities to handle timezone issues correctly
 * Single source of truth for local date handling (YYYY-MM-DD) vs timestamps
 */

import { parseISO } from 'date-fns';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Get today's date as YYYY-MM-DD in local timezone (not UTC)
 * FIXED: new Date().toISOString().split('T')[0] uses UTC, which can be off by one day
 * This function ensures "today" is always correct in the user's local timezone
 */
export function todayLocalYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse date-only strings (YYYY-MM-DD) as local dates to avoid timezone shifts
 * parseISO('2025-12-12') interprets as UTC midnight, which can render as previous day in US timezones
 * This function parses date-only strings as local dates instead
 * 
 * For timestamps (with time/timezone), use parseISO to preserve the actual moment
 */
export function parseTaskDateLocal(dateStr: string): Date {
  if (DATE_ONLY_PATTERN.test(dateStr)) {
    // Date-only string: parse as local date (avoid timezone shift)
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d); // Local midnight
  }
  // ISO string with time/timezone: use parseISO (keeps actual moment, then local getters apply)
  return parseISO(dateStr);
}

/**
 * Normalize any date string to local YYYY-MM-DD format
 * Handles both date-only strings and timestamps
 * 
 * @param dateStr - Date string in various formats (YYYY-MM-DD, ISO timestamp, etc.)
 * @returns Normalized YYYY-MM-DD string in local timezone
 */
export function toLocalYMD(dateStr: string): string {
  if (DATE_ONLY_PATTERN.test(dateStr)) {
    // Already in YYYY-MM-DD format, return as-is
    return dateStr;
  }
  // Timestamp: parse and format as local YYYY-MM-DD
  const d = parseTaskDateLocal(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Normalize date string to a stable day key (YYYY-MM-DD)
 * Handles different date formats (YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss, etc.)
 * and ensures same-day dates group together
 * 
 * Alias for toLocalYMD for semantic clarity when used for grouping
 */
export function taskDayKey(dateStr: string): string {
  return toLocalYMD(dateStr);
}

/**
 * Parse date string loosely (handles various formats) and return timestamp
 * FIXED: String sorting can break with non-ISO dates (e.g., "12/1/2025" or "2025-12-1")
 * Use this for reliable date comparisons
 * 
 * @param dateStr - Date string in various formats
 * @returns Timestamp (number) or -Infinity if invalid
 */
function parseDateLoose(dateStr: string): number {
  if (!dateStr) return -Infinity;
  if (DATE_ONLY_PATTERN.test(dateStr)) {
    // Date-only string: parse as local date (avoid timezone shift)
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).getTime(); // local midnight
  }
  // Try parseISO for ISO timestamps
  try {
    const t = parseISO(dateStr).getTime();
    return Number.isFinite(t) ? t : -Infinity;
  } catch {
    return -Infinity;
  }
}

/**
 * Get the most recent date from an array of date strings
 * FIXED: Replaces fragile string sorting with proper date parsing
 * 
 * @param dates - Array of date strings
 * @returns Most recent date string, or '—' if empty/invalid
 */
export function getMostRecentDate(dates: string[]): string {
  let best = '';
  let bestT = -Infinity;
  for (const s of dates) {
    const t = parseDateLoose(s);
    if (t > bestT) {
      bestT = t;
      best = s;
    }
  }
  return best || '—';
}

/**
 * Compare two date strings for sorting (most recent first)
 * Returns negative if dateA < dateB, positive if dateA > dateB, 0 if equal
 * 
 * @param dateA - First date string
 * @param dateB - Second date string
 * @returns Comparison result for sorting (descending: most recent first)
 */
export function compareDatesDesc(dateA: string, dateB: string): number {
  const timeA = parseDateLoose(dateA);
  const timeB = parseDateLoose(dateB);
  return timeB - timeA; // Descending (most recent first)
}
