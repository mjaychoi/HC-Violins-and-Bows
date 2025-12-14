// Client 관련 상수 정의

/**
 * Client tag options
 * Used in ClientForm, ClientModal, ClientList, etc.
 */
export const CLIENT_TAG_OPTIONS = [
  'Owner',
  'Musician',
  'Dealer',
  'Collector',
  'Other',
] as const;

export type ClientTag = (typeof CLIENT_TAG_OPTIONS)[number];

/**
 * Interest level options
 */
export const INTEREST_LEVELS = ['Active', 'Passive', 'Inactive'] as const;

export type InterestLevel = (typeof INTEREST_LEVELS)[number];

/**
 * Instrument Connection filter options
 */
export const HAS_INSTRUMENTS_FILTER_OPTIONS = {
  HAS: 'Has Instruments',
  NO: 'No Instruments',
} as const;

/**
 * Client filter label constants
 */
export const CLIENT_FILTER_LABELS = {
  LAST_NAME: 'Last Name',
  FIRST_NAME: 'First Name',
  CONTACT_NUMBER: 'Contact Number',
  EMAIL: 'Email',
  TAGS: 'Tags',
  INTEREST: 'Interest',
  HAS_INSTRUMENTS: 'Has Instruments',
  FILTER_OPTIONS: 'Filter Options',
  ACTIVE_FILTERS: (count: number) => `${count} search/filter${count > 1 ? 's' : ''} active`,
} as const;
