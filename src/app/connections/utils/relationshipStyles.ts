import { RelationshipType } from '@/types';
// ✅ FIXED: Use centralized color tokens with new variant-based structure
import { RELATIONSHIP_TOKENS } from '@/utils/colorTokens';

export interface RelationshipStyle {
  bgColor: string;
  textColor: string;
  borderColor: string;
  activeBorder: string;
  icon: string;
}

// ✅ FIXED: Use centralized color tokens with consistent styling
export const getRelationshipTypeStyle = (
  type: RelationshipType
): RelationshipStyle => {
  // Get token from new structure (soft variant for relationship cards)
  const token =
    RELATIONSHIP_TOKENS[type as keyof typeof RELATIONSHIP_TOKENS] ||
    RELATIONSHIP_TOKENS.Default;
  const softColor = token.soft;

  // Parse color classes from soft variant
  const bgMatch = softColor.match(/bg-(\S+)/);
  const textMatch = softColor.match(/text-(\S+)/);
  const bgColor = bgMatch ? `bg-${bgMatch[1]}` : 'bg-gray-50';
  const textColor = textMatch ? `text-${textMatch[1]}` : 'text-gray-700';

  // Extract color name for border (e.g., amber-100 -> amber-200, amber-600)
  const colorName = bgMatch?.[1]?.split('-')[0] || 'gray';

  const iconMap: Record<RelationshipType, string> = {
    Interested: '💡',
    Booked: '📅',
    Sold: '✅',
    Owned: '🏠',
  };

  return {
    bgColor,
    textColor,
    borderColor: `border-${colorName}-200`,
    activeBorder: `border-${colorName}-600`,
    icon: iconMap[type] || '📋',
  };
};
