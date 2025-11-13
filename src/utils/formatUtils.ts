// Formatting utility functions for data display and manipulation

// Date formatting
export const dateFormats = {
  short: 'MMM dd, yyyy',
  long: 'MMMM dd, yyyy',
  time: 'HH:mm',
  datetime: 'MMM dd, yyyy HH:mm',
  iso: 'yyyy-MM-dd',
  display: "MMM dd, yyyy 'at' HH:mm",
} as const;

export function formatDate(
  date: string | Date,
  style: keyof typeof dateFormats = 'short'
): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) return 'Invalid Date';

  // Map allowed styles to Intl options
  const map: Record<keyof typeof dateFormats, Intl.DateTimeFormatOptions> = {
    short: { year: 'numeric', month: 'short', day: '2-digit' },
    long: { year: 'numeric', month: 'long', day: '2-digit' },
    time: { hour: '2-digit', minute: '2-digit', hour12: false },
    datetime: {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
    iso: {},
    display: {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
  };

  if (style === 'iso') return d.toISOString().slice(0, 10); // yyyy-MM-dd

  return new Intl.DateTimeFormat('en-US', map[style]).format(d);
}

export function formatRelativeTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000)
    return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return formatDate(dateObj, 'short');
}

// Currency formatting
export function formatCurrency(
  amount: number | string,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) return 'Invalid Amount';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numAmount);
}

export function formatNumber(
  value: number | string,
  options: {
    decimals?: number;
    locale?: string;
    compact?: boolean;
  } = {}
): string {
  const { decimals = 0, locale = 'en-US', compact = false } = options;
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) return 'Invalid Number';

  const formatOptions: Intl.NumberFormatOptions = {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    notation: compact ? 'compact' : 'standard',
  };

  return new Intl.NumberFormat(locale, formatOptions).format(numValue);
}

// Text formatting
export function formatText(
  text: string,
  options: {
    capitalize?: boolean;
    truncate?: number;
    trim?: boolean;
  } = {}
): string {
  let formatted = text;

  if (options.trim) {
    formatted = formatted.trim();
  }

  if (options.capitalize) {
    formatted =
      formatted.charAt(0).toUpperCase() + formatted.slice(1).toLowerCase();
  }

  if (options.truncate && formatted.length > options.truncate) {
    formatted = formatted.substring(0, options.truncate) + '...';
  }

  return formatted;
}

export function formatName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`;
}

export function formatInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

// Phone number formatting
export function formatPhone(phone?: string | null): string {
  if (!phone) return '';

  const cleaned = phone.replace(/\D/g, '');

  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }

  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }

  return ''; // Return empty if format doesn't match
}

// Email formatting
export function formatEmail(email?: string | null): string {
  return (email ?? '').toLowerCase().trim();
}

// File size formatting
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Percentage formatting
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

// Address formatting
export function formatAddress(address: {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}): string {
  const parts = [
    address.street,
    address.city,
    address.state,
    address.zipCode,
    address.country,
  ].filter(Boolean);

  return parts.join(', ');
}

// Status formatting
export function formatStatus(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Relationship type formatting
export function formatRelationshipType(type: string): string {
  const typeMap: Record<string, string> = {
    interested: 'Interested',
    booked: 'Booked',
    sold: 'Sold',
    owned: 'Owned',
  };

  return typeMap[type.toLowerCase()] || type;
}

// Instrument formatting
export function formatInstrumentName(
  maker?: string | null,
  name?: string | null,
  year?: string | null
): string {
  const parts = [maker, name].filter(Boolean) as string[];
  if (year) parts.push(`(${year})`);
  return parts.join(' ');
}

// Table formatting utilities
export function formatTableData<T>(
  data: T[],
  columns: Array<{
    key: keyof T;
    label: string;
    formatter?: (value: unknown) => string;
  }>
): Array<Record<string, string>> {
  return data.map(item =>
    columns.reduce(
      (acc, column) => {
        const value = item[column.key];
        acc[column.label] = column.formatter
          ? column.formatter(value)
          : String(value);
        return acc;
      },
      {} as Record<string, string>
    )
  );
}

// Search highlighting
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightSearchTerm(text: string, searchTerm: string): string {
  if (!searchTerm) return text;

  const safe = escapeRegex(searchTerm);
  const regex = new RegExp(`(${safe})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

// CSV formatting
export function formatCSV(
  data: Record<string, unknown>[],
  headers?: string[]
): string {
  if (data.length === 0) return '';

  const keys = headers || Object.keys(data[0]);
  const csvHeaders = keys.join(',');

  const csvRows = data.map(row =>
    keys
      .map(key => {
        const value = row[key];
        // Escape commas and quotes in CSV
        if (
          typeof value === 'string' &&
          (value.includes(',') || value.includes('"'))
        ) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
      .join(',')
  );

  return [csvHeaders, ...csvRows].join('\n');
}

// JSON formatting
export function formatJSON(data: unknown, indent: number = 2): string {
  return JSON.stringify(data, null, indent);
}

// URL formatting
export function formatURL(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}

// Color formatting
export function formatColor(hex: string): string {
  if (hex.startsWith('#')) return hex;
  return `#${hex}`;
}

// Time formatting
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

// Validation formatting
export function formatValidationErrors(errors: Record<string, string>): string {
  return Object.entries(errors)
    .map(([field, error]) => `${field}: ${error}`)
    .join('\n');
}

// Export all formatting functions
export const formatters = {
  date: formatDate,
  relativeTime: formatRelativeTime,
  currency: formatCurrency,
  number: formatNumber,
  text: formatText,
  name: formatName,
  initials: formatInitials,
  phone: formatPhone,
  email: formatEmail,
  fileSize: formatFileSize,
  percentage: formatPercentage,
  address: formatAddress,
  status: formatStatus,
  relationshipType: formatRelationshipType,
  instrumentName: formatInstrumentName,
  tableData: formatTableData,
  highlightSearch: highlightSearchTerm,
  csv: formatCSV,
  json: formatJSON,
  url: formatURL,
  color: formatColor,
  duration: formatDuration,
  validationErrors: formatValidationErrors,
} as const;
