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

import { formatDisplayDate, toDateOnly } from './dateParsing';

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

/**
 * @deprecated Use formatDateOnly or formatTimestamp instead
 * This function mixes date-only and timestamp logic, causing UTC/local confusion
 */
export function formatDate(
  date: string | Date,
  style: keyof typeof dateFormats = 'short'
): string {
  // Legacy support: try to detect if it's date-only or timestamp
  if (typeof date === 'string') {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(date);
    if (isDateOnly) {
      return formatDateOnly(
        date,
        style === 'iso' ? 'iso' : style === 'long' ? 'long' : 'short'
      );
    }
    // Timestamp
    if (style === 'time' || style === 'datetime' || style === 'display') {
      return formatTimestamp(date, style === 'time' ? 'time' : 'datetime');
    }
    // For other styles, treat as date-only
    return formatDateOnly(
      toDateOnly(date),
      style === 'iso' ? 'iso' : style === 'long' ? 'long' : 'short'
    );
  }

  // Date object: check if it has time component
  const hasTime =
    date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
  if (
    hasTime &&
    (style === 'time' || style === 'datetime' || style === 'display')
  ) {
    return formatTimestamp(date, style === 'time' ? 'time' : 'datetime');
  }

  // Date-only
  const ymd = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  return formatDateOnly(
    ymd,
    style === 'iso' ? 'iso' : style === 'long' ? 'long' : 'short'
  );
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

// ✅ FIXED: 빈 문자열 방어 로직 추가
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
// ✅ FIXED: 길이 맞지 않으면 원본 반환 옵션 (UI에서 선택 가능)
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

  // ✅ FIXED: 길이 맞지 않으면 원본 반환 옵션
  return options.returnOriginal ? phone : '';
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
// ✅ FIXED: XSS 위험 제거 - ReactNode 배열로 반환 (가장 안전)
import React from 'react';

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
// ✅ FIXED: 모든 타입을 string으로 직렬화 (number/boolean/object 처리)
function csvCell(v: unknown): string {
  if (v == null) return '';

  const s =
    typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : JSON.stringify(v);

  // Escape commas, quotes, and newlines
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

// JSON formatting
export function formatJSON(data: unknown, indent: number = 2): string {
  return JSON.stringify(data, null, indent);
}

// URL formatting
// ✅ FIXED: javascript: 같은 위험한 스킴 차단
export function formatURL(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // ✅ FIXED: 위험한 스킴 차단
  if (/^[a-z]+:/i.test(trimmed)) return ''; // block weird schemes (javascript:, data:, etc.)
  return `https://${trimmed}`;
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
