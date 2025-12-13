export const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// FIXED: Helper to parse YYYY-MM-DD as UTC to avoid timezone shifts
export const parseYMDUTC = (ymd: string): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// FIXED: Format dates with UTC timezone to prevent day shift in negative UTC offsets
export const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
