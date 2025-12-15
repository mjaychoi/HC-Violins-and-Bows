/**
 * FIXED: Date parsing utilities to handle timezone issues correctly
 * Single source of truth for date parsing strategy across the entire codebase
 *
 * Strategy:
 * - DB/Server/Query params: Always YYYY-MM-DD (date-only) format
 * - UI date inputs: Always YYYY-MM-DD format
 * - Display/Period formatting: UTC-based (for consistency with server)
 * - Day-of-week / "recent 7 days" UX: Local-based (for user experience)
 *
 * Two main parsing functions:
 * - parseYMDUTC(ymd: string): For KPI/charts/period display/server alignment
 * - parseYMDLocal(ymdOrIso: string): For day-of-week/local day bucket calculations
 */

import { parseISO } from 'date-fns';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate YYYY-MM-DD format and check that month/day are within valid ranges
 * Prevents silent date rollover (e.g., "2025-99-99" would roll over to future years)
 *
 * @param ymd - Date string to validate
 * @returns true if valid YYYY-MM-DD with valid month (1-12) and day (1-lastDayOfMonth)
 */
function isValidYMD(ymd: string): boolean {
  if (!DATE_ONLY_PATTERN.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // Last day of month m
  return d >= 1 && d <= lastDay;
}

/**
 * Helper function to get start of day (00:00:00) for a given date
 * Replaces date-fns startOfDay for better compatibility in test environments
 * Use this instead of date-fns startOfDay throughout the codebase for consistency
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Parse YYYY-MM-DD date-only string as UTC date
 * Use for: KPI calculations, chart displays, period formatting, server alignment
 * This ensures consistent date boundaries regardless of user timezone
 *
 * @param ymd - Date string in YYYY-MM-DD format
 * @returns Date object at UTC midnight
 * @throws Error if input is not a valid YYYY-MM-DD format with valid month/day ranges
 */
export function parseYMDUTC(ymd: string): Date {
  if (!isValidYMD(ymd)) {
    throw new Error(
      `Invalid YMD format: ${ymd}. Expected YYYY-MM-DD with valid month (1-12) and day.`
    );
  }
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Parse date string (YYYY-MM-DD or ISO timestamp) as local date
 * Use for: Day-of-week calculations, "recent 7 days" filters, local day buckets
 * This ensures day-of-week matches user's local timezone expectations
 *
 * Behavior:
 * - Date-only (YYYY-MM-DD): Parsed as local date at midnight (00:00:00 local time)
 *   This ensures the date represents the correct calendar day in the user's timezone
 * - ISO timestamp: Parsed using parseISO for consistent behavior, then normalized to local midnight
 *   This buckets the timestamp into the correct local calendar day
 *
 * @param ymdOrIso - Date string in YYYY-MM-DD format or ISO timestamp
 * @returns Date object at local midnight, or null if invalid
 */
export function parseYMDLocal(ymdOrIso: string): Date | null {
  if (!ymdOrIso) return null;
  if (isValidYMD(ymdOrIso)) {
    // Date-only string: parse as local date (YYYY-MM-DD)
    // new Date('YYYY-MM-DD') can be interpreted as UTC, so construct explicitly
    // This creates a Date at local midnight (00:00:00 in user's timezone)
    const [y, m, d] = ymdOrIso.split('-').map(Number);
    return startOfDay(new Date(y, m - 1, d));
  }
  // For timestamps with time/timezone, use parseISO for consistent parsing
  // Then normalize to local midnight to bucket into the correct calendar day
  try {
    const t = parseISO(ymdOrIso);
    return Number.isFinite(t.getTime()) ? startOfDay(t) : null;
  } catch {
    return null;
  }
}

/**
 * Get today's date as YYYY-MM-DD in local timezone (not UTC)
 * FIXED: new Date().toISOString().split('T')[0] uses UTC, which can be off by one day
 * This function ensures "today" is always correct in the user's local timezone
 *
 * Use for: Form default values, date input initial values
 */
export function todayLocalYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Normalize date string to date-only format (YYYY-MM-DD)
 * Extracts YYYY-MM-DD from ISO timestamps or returns as-is if already date-only
 * Validates the result to ensure it's a valid YYYY-MM-DD format with valid month/day ranges
 *
 * Use for: Filtering, comparison, grouping by day
 *
 * @param dateStr - Date string (YYYY-MM-DD or ISO timestamp)
 * @returns Date-only string (YYYY-MM-DD) or empty string if invalid
 */
export function toDateOnly(dateStr?: string): string {
  if (!dateStr) return '';
  const ymd = dateStr.slice(0, 10);
  return isValidYMD(ymd) ? ymd : '';
}

/**
 * Unified date formatters for consistent display across all pages
 * All formatters use UTC timezone to ensure consistent date boundaries
 */

/**
 * Format date for display (e.g., "Dec 13, 2025")
 * Use for: Table cells, lists, general date display
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Formatted date string (e.g., "Dec 13, 2025")
 */
export function formatDisplayDate(dateStr: string): string {
  try {
    const date = parseYMDUTC(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format date for compact display (e.g., "Dec 13")
 * Use for: Charts, compact lists, tooltips
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Formatted date string (e.g., "Dec 13")
 */
export function formatCompactDate(dateStr: string): string {
  try {
    const date = parseYMDUTC(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format month for display (e.g., "Dec 2025")
 * Use for: Monthly charts, month labels
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Formatted month string (e.g., "Dec 2025")
 */
export function formatMonth(dateStr: string): string {
  try {
    const date = parseYMDUTC(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format date with time for display (e.g., "Dec 13, 2025 at 14:30")
 * Use for: Timestamps, detailed date/time display
 *
 * Note: This function displays timestamps in UTC timezone.
 * This is intentional for server/log timestamps to ensure consistency.
 * For user-facing "event occurred at" times, consider using local timezone instead.
 *
 * @param dateTimeStr - ISO timestamp string
 * @returns Formatted date-time string in UTC timezone
 */
export function formatDateTime(dateTimeStr: string): string {
  try {
    const date = new Date(dateTimeStr);
    if (!Number.isFinite(date.getTime())) return dateTimeStr;

    // UTC timestamp display (for server/log consistency)
    const datePart = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const timePart = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    });
    return `${datePart} at ${timePart}`;
  } catch {
    return dateTimeStr;
  }
}

/**
 * Parse date-only strings (YYYY-MM-DD) as local dates to avoid timezone shifts
 * parseISO('2025-12-12') interprets as UTC midnight, which can render as previous day in US timezones
 * This function parses date-only strings as local dates instead
 *
 * For timestamps (with time/timezone), uses parseISO to preserve the actual moment
 *
 * @deprecated Remove after migrating all callsites to parseYMDLocal.
 *             Use parseYMDLocal instead for consistency. This function is kept for backward compatibility
 *             but will be removed in a future version.
 */
export function parseTaskDateLocal(dateStr: string): Date {
  const parsed = parseYMDLocal(dateStr);
  if (parsed) return parsed;
  // Fallback for non-date-only strings (ISO timestamps)
  return parseISO(dateStr);
}

/**
 * Normalize any date string to local YYYY-MM-DD format
 * Handles both date-only strings and timestamps
 * Uses parseYMDLocal directly to avoid dependency on deprecated parseTaskDateLocal
 *
 * Important: Date-only strings (YYYY-MM-DD) are returned as-is without conversion.
 * This is because YYYY-MM-DD is already a "calendar day key" that represents a specific
 * calendar day regardless of timezone. Only timestamps are converted to local YYYY-MM-DD.
 *
 * @param dateStr - Date string in various formats (YYYY-MM-DD, ISO timestamp, etc.)
 * @returns Normalized YYYY-MM-DD string in local timezone (or as-is if already date-only)
 */
export function toLocalYMD(dateStr: string): string {
  if (isValidYMD(dateStr)) {
    // Already in YYYY-MM-DD format (calendar day key), return as-is
    // No conversion needed as YYYY-MM-DD represents the same calendar day in all timezones
    return dateStr;
  }
  // Timestamp: parse as local date and format as YYYY-MM-DD
  const d = parseYMDLocal(dateStr);
  if (!d) {
    // Fallback: try Date.parse for other formats
    const parsed = Date.parse(dateStr);
    if (!Number.isFinite(parsed)) return '';
    const fallbackDate = new Date(parsed);
    const y = fallbackDate.getFullYear();
    const m = String(fallbackDate.getMonth() + 1).padStart(2, '0');
    const day = String(fallbackDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
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
 * Supports: YYYY-MM-DD, ISO timestamps, and other common date formats
 * Use this for reliable date comparisons when input format is uncertain
 *
 * Note: YYYY-MM-DD is interpreted as local midnight for recency comparison.
 * This ensures "most recent date" calculations match user's local timezone expectations.
 * For server/DB date comparisons, consider using UTC-based parsing instead.
 *
 * @param dateStr - Date string in various formats (YYYY-MM-DD, ISO, or other parseable formats)
 * @returns Timestamp (number) or -Infinity if invalid
 */
function parseDateLoose(dateStr: string): number {
  if (!dateStr) return -Infinity;

  // First, try YYYY-MM-DD pattern (most common in this codebase)
  if (isValidYMD(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).getTime(); // local midnight
  }

  // Try parseISO for ISO timestamps (strict parsing)
  try {
    const t = parseISO(dateStr).getTime();
    if (Number.isFinite(t)) return t;
  } catch {
    // Continue to fallback
  }

  // Fallback: Use Date.parse for other formats (e.g., "12/1/2025")
  // Note: Date.parse behavior varies by browser, but handles common formats
  const t2 = Date.parse(dateStr);
  return Number.isFinite(t2) ? t2 : -Infinity;
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
