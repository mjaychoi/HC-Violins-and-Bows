import { Instrument, Client, ClientInstrument } from '@/types';
import { getUniqueStringValues } from '@/utils/uniqueValues';

// Instrument formatting utilities
export const formatInstrumentName = (instrument: Instrument): string => {
  return `${instrument.maker || 'Unknown'} - ${instrument.type || 'Unknown'}`;
};

export const formatInstrumentPrice = (
  price: string | number | null
): string => {
  if (price === null) return 'N/A';
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(numPrice)) return 'N/A';
  return `$${numPrice.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

/**
 * Format price with compact notation for large amounts (e.g., $10.0M, $407.7K)
 * Falls back to regular formatting for smaller amounts
 * Useful for list views where space is limited
 */
export const formatInstrumentPriceCompact = (
  price: string | number | null
): string => {
  if (price === null) return 'N/A';
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(numPrice)) return 'N/A';

  // For amounts >= 1M, use M notation
  if (Math.abs(numPrice) >= 1000000) {
    return `$${(numPrice / 1000000).toFixed(1)}M`;
  }
  // For amounts >= 1K, use K notation
  if (Math.abs(numPrice) >= 1000) {
    return `$${(numPrice / 1000).toFixed(1)}K`;
  }
  // Otherwise use regular formatting
  return formatInstrumentPrice(numPrice);
};

export const formatInstrumentYear = (year: string | number | null): string => {
  if (year === null) return 'Unknown';
  const numYear = typeof year === 'string' ? parseInt(year) : year;
  if (isNaN(numYear) || numYear === 0) return 'Unknown';
  return numYear.toString();
};

// Status utilities
// ✅ FIXED: Use centralized color tokens to prevent conflicts with Clients page
import {
  getStatusColor as getStatusColorFromTokens,
  getRelationshipColor as getRelationshipColorFromTokens,
} from '@/utils/colorTokens';

export const getStatusColor = (status: string): string => {
  return getStatusColorFromTokens(status);
};

export const getStatusIcon = (status: string): string => {
  switch (status) {
    case 'Available':
      return '✅';
    case 'Sold':
      return '💰';
    case 'Reserved':
      return '🔒';
    case 'Maintenance':
      return '🔧';
    default:
      return '❓';
  }
};

// Client utilities
export const formatClientName = (client: Client): string => {
  return (
    `${client.first_name || ''} ${client.last_name || ''}`.trim() ||
    'Unknown Client'
  );
};

export const getClientInitials = (client: Client): string => {
  const first = client.first_name?.[0] || '';
  const last = client.last_name?.[0] || '';
  return (first + last).toUpperCase() || 'U';
};

// Relationship utilities
// ✅ FIXED: Use centralized color tokens
export const getRelationshipColor = (
  relationshipType: ClientInstrument['relationship_type']
): string => {
  return getRelationshipColorFromTokens(relationshipType);
};

export const getRelationshipIcon = (
  relationshipType: ClientInstrument['relationship_type']
): string => {
  switch (relationshipType) {
    case 'Interested':
      return '👀';
    case 'Booked':
      return '📅';
    case 'Sold':
      return '✅';
    case 'Owned':
      return '🏠';
    default:
      return '❓';
  }
};

// Filter utilities
export const getUniqueValues = (
  instruments: Instrument[],
  field: keyof Instrument
): string[] => getUniqueStringValues(instruments, field);

export const getPriceRange = (
  instruments: Instrument[]
): { min: number; max: number } => {
  const nums = instruments
    .map(i => (typeof i.price === 'string' ? parseFloat(i.price) : i.price))
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  if (nums.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...nums), max: Math.max(...nums) };
};

// Validation utilities
export const validateInstrumentData = (data: Partial<Instrument>): string[] => {
  const errors: string[] = [];

  if (!data.maker?.trim()) errors.push('Maker is required');
  if (!data.type?.trim()) errors.push('Type is required');

  if (data.year !== null && data.year !== undefined) {
    const year =
      typeof data.year === 'string' ? parseInt(data.year, 10) : data.year;
    if (
      typeof year !== 'number' ||
      isNaN(year) ||
      year < 1000 ||
      year > new Date().getFullYear()
    ) {
      errors.push('Year must be a valid year');
    }
  }

  if (data.price !== null && data.price !== undefined) {
    const price =
      typeof data.price === 'string' ? parseFloat(data.price) : data.price;
    if (typeof price !== 'number' || isNaN(price) || price < 0) {
      errors.push('Price must be a valid positive number');
    }
  }

  return errors;
};

// Image utilities
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const validateImageFile = (file: File): string[] => {
  const errors: string[] = [];
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

  if (!allowedTypes.includes(file.type)) {
    errors.push('Only JPEG, PNG, and WebP images are allowed');
  }

  if (file.size > maxSize) {
    errors.push('File size must be less than 5MB');
  }

  return errors;
};
