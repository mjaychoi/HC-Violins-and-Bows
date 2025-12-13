export const INTEREST_RELATED_TAGS = [
  'Musician',
  'Dealer',
  'Collector',
] as const;

export type InterestRelatedTag = (typeof INTEREST_RELATED_TAGS)[number];

/**
 * Check if interest dropdown should be shown based on tags
 * Type-safe check using readonly string array comparison
 */
export const shouldShowInterestDropdown = (tags: readonly string[] = []) =>
  tags.some(tag => (INTEREST_RELATED_TAGS as readonly string[]).includes(tag));
