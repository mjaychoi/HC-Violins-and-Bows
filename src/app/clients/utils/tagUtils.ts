// src/app/clients/utils/tagUtils.ts
// Tag utility functions

// ✅ FIXED: Use centralized color tokens to prevent conflicts with Items page
import { getTagColor as getTagColorFromTokens } from '@/utils/colorTokens';

// ✅ Generate tag color from centralized tokens
export const getTagColor = (tag: string): string => {
  return getTagColorFromTokens(tag);
};

// ✅ Extract text color from tone (derived from centralized tokens)
// Note: This is a simplified version that extracts text color from the full color string
export const getTagTextColor = (tag: string): string => {
  const colorString = getTagColorFromTokens(tag);
  // Extract text color class from the color string (e.g., "text-emerald-800")
  const match = colorString.match(/text-(\w+)-(\d+)/);
  if (match) {
    return `text-${match[1]}-${match[2]}`;
  }
  return 'text-gray-800'; // Fallback
};

// ✅ FIXED: Return new array instead of mutating original
export const sortTags = (tags: string[]): string[] => {
  return [...tags].sort((a, b) => {
    if (a === 'Owner') return -1;
    if (b === 'Owner') return 1;
    return a.localeCompare(b);
  });
};

// ✅ FIXED: Use centralized color tokens
import {
  getStatusColor as getStatusColorFromTokens,
  getInterestColor as getInterestColorFromTokens,
} from '@/utils/colorTokens';

export const getStatusColor = (status: string): string => {
  return getStatusColorFromTokens(status);
};

export const getInterestColor = (interest: string | null): string => {
  return getInterestColorFromTokens(interest);
};
