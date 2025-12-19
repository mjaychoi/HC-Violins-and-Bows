export const INTEREST_RELATED_TAGS = [
  'Musician',
  'Dealer',
  'Collector',
] as const;

export type InterestRelatedTag = (typeof INTEREST_RELATED_TAGS)[number];

/**
 * ✅ FIXED: Check if interest dropdown should be shown based on tags
 * Uses Set for O(1) lookup instead of O(n) array.includes
 * More readable and efficient for repeated checks
 */
const INTEREST_TAG_SET = new Set(INTEREST_RELATED_TAGS);

export const shouldShowInterestDropdown = (tags: readonly string[] = []) =>
  tags.some(tag => INTEREST_TAG_SET.has(tag as InterestRelatedTag));
