// src/app/clients/utils/tagUtils.ts
// Tag utility functions

// ✅ FIXED: Use centralized color tokens to prevent conflicts with Items page
import {
  getTagColor as getTagColorFromTokens,
  type BadgeVariant,
} from '@/utils/colorTokens';

// ✅ Generate tag color from centralized tokens
// - 기본 variant는 soft (역할/타입 태그용)
// - 테이블/리스트 컨텍스트에서는 호출부에서 'muted'를 명시적으로 넘겨 사용
export const getTagColor = (
  tag: string,
  variant: BadgeVariant = 'soft'
): string => {
  return getTagColorFromTokens(tag, variant);
};

// ✅ Extract text color from tone (derived from centralized tokens)
// Note: This is a simplified version that extracts text color from the full color string
export const getTagTextColor = (tag: string): string => {
  // 텍스트 색상은 soft tone 기준으로 계산 (variant와 무관하게 일관된 텍스트 컬러 유지)
  const colorString = getTagColorFromTokens(tag, 'soft');
  // Extract text color class from the color string (e.g., "text-emerald-800")
  const match = colorString.match(/text-(\w+)-(\d+)/);
  if (match) {
    return `text-${match[1]}-${match[2]}`;
  }
  return 'text-gray-800'; // Fallback
};

/**
 * 상태 축과 태그 축이 섞이지 않도록 하기 위한 display label 헬퍼
 *
 * - 데이터 상으로는 기존 태그 값을 유지 (예: 'Active', 'Passive', 'Inactive')
 * - UI 에서는 더 구체적인 라벨로 노출 (예: 'Active Client')
 * - 새로운 태그를 만들 때는 가능한 한 아래 reserved 키워드를 피하는 것을 권장
 */
const STATUS_LIKE_TAG_LABELS: Record<string, string> = {
  Active: 'Active Client',
  Passive: 'Passive Client',
  Inactive: 'Inactive Client',
};

export const getTagDisplayLabel = (tag: string): string => {
  return STATUS_LIKE_TAG_LABELS[tag] ?? tag;
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
