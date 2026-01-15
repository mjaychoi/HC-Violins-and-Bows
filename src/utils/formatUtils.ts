// Formatting utility functions for data display and manipulation

import React from 'react';
import { formatDisplayDate, toDateOnly } from './dateParsing';

// Date formatting
export const dateFormats = {
  short: 'MMM dd, yyyy',
  long: 'MMMM dd, yyyy',
  time: 'HH:mm',
  datetime: 'MMM dd, yyyy HH:mm',
  iso: 'yyyy-MM-dd',
  display: "MMM dd, yyyy 'at' HH:mm",
} as const;

/**
 * ✅ FIXED: date-only 전용 포맷터 - Date 객체 받지 않음 (YYYY-MM-DD만)
 * UTC/로컬 혼재 문제 해결
 */
export function formatDateOnly(
  ymd: string,
  style: 'short' | 'long' | 'iso' = 'short'
): string {
  const dateStr = toDateOnly(ymd);
  if (!dateStr) return 'Invalid Date';
  if (style === 'iso') return dateStr;
  return formatDisplayDate(dateStr);
}

/**
 * ✅ FIXED: timestamp 전용 포맷터 - Date 또는 ISO string
 */
export function formatTimestamp(
  ts: string | Date,
  style: 'time' | 'datetime' = 'datetime'
): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  if (!Number.isFinite(d.getTime())) return '';

  return d.toLocaleString('en-US', {
    ...(style === 'time'
      ? { hour: '2-digit', minute: '2-digit' }
      : {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
  });
}

export function formatRelativeTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (!Number.isFinite(dateObj.getTime())) return '';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000)
    return `${Math.floor(diffInSeconds / 86400)}d ago`;

  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return formatDateOnly(date);
  }
  return formatTimestamp(dateObj, 'datetime');
}

// Currency formatting
export function formatCurrency(
  amount: number | string,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(numAmount)) return 'Invalid Amount';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numAmount);
}

export function formatNumber(
  value: number | string,
  options: { decimals?: number; locale?: string; compact?: boolean } = {}
): string {
  const { decimals = 0, locale = 'en-US', compact = false } = options;
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(numValue)) return 'Invalid Number';

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
  options: { capitalize?: boolean; truncate?: number; trim?: boolean } = {}
): string {
  let formatted = text;

  if (options.trim) formatted = formatted.trim();

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
  const first = firstName?.trim() || '';
  const last = lastName?.trim() || '';
  if (!first && !last) return '';
  return `${first} ${last}`.trim();
}

export function formatInitials(firstName: string, lastName: string): string {
  const first = firstName?.trim() || '';
  const last = lastName?.trim() || '';
  if (!first && !last) return '';
  return `${first.charAt(0) || ''}${last.charAt(0) || ''}`.toUpperCase();
}

// Phone number formatting
export function formatPhone(
  phone?: string | null,
  options: { returnOriginal?: boolean } = {}
): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');

  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return options.returnOriginal ? phone : '';
}

export function formatEmail(email?: string | null): string {
  return (email ?? '').toLowerCase().trim();
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'] as const;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatPercentage(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

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

export function formatStatus(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function formatRelationshipType(type: string): string {
  const typeMap: Record<string, string> = {
    interested: 'Interested',
    booked: 'Booked',
    sold: 'Sold',
    owned: 'Owned',
  };
  return typeMap[type.toLowerCase()] || type;
}

export function formatInstrumentName(
  maker?: string | null,
  name?: string | null,
  year?: string | null
): string {
  const parts = [maker, name].filter(Boolean) as string[];
  if (year) parts.push(`(${year})`);
  return parts.join(' ');
}

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
          : String(value ?? '');
        return acc;
      },
      {} as Record<string, string>
    )
  );
}

// Search highlighting
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightSearchTerm(
  text: string,
  searchTerm: string
): React.ReactNode {
  if (!searchTerm) return text;

  const safe = escapeRegex(searchTerm);
  const parts = text.split(new RegExp(`(${safe})`, 'gi'));
  const lowerSearch = searchTerm.toLowerCase();

  return parts.map((part, i) =>
    part.toLowerCase() === lowerSearch
      ? React.createElement(
          'mark',
          { key: i, className: 'bg-yellow-200 px-1 rounded' },
          part
        )
      : part
  );
}

// CSV formatting
function csvCell(v: unknown): string {
  if (v == null) return '';

  const s =
    typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : JSON.stringify(v);

  if (/[,"\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function formatCSV(
  data: Record<string, unknown>[],
  headers?: string[]
): string {
  if (data.length === 0) return '';
  const keys = headers || Object.keys(data[0]);
  const rows = data.map(row => keys.map(k => csvCell(row[k])).join(','));
  return [keys.join(','), ...rows].join('\n');
}

export function formatJSON(data: unknown, indent: number = 2): string {
  return JSON.stringify(data, null, indent);
}

// URL formatting
export function formatURL(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  if (/^[a-z]+:/i.test(trimmed)) return '';
  return `https://${trimmed}`;
}

export function formatColor(hex: string): string {
  if (hex.startsWith('#')) return hex;
  return `#${hex}`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function formatValidationErrors(errors: Record<string, string>): string {
  return Object.entries(errors)
    .map(([field, error]) => `${field}: ${error}`)
    .join('\n');
}

export const formatters = {
  dateOnly: formatDateOnly,
  timestamp: formatTimestamp,
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
