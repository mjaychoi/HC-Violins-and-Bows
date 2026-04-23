import { DashboardFilterLabelMap, DashboardFilterOptions } from './types';
import { Instrument } from '@/types';
// FIXED: Removed DASHBOARD_SORT_FIELDS import - import directly from @/types/sort where needed
import { buildFilterOptionsFromFields } from '@/utils/filterHelpers';

export const DASHBOARD_FILTER_LABELS: DashboardFilterLabelMap = {
  status: 'Status',
  maker: 'Maker',
  type: 'Type',
  subtype: 'Subtype',
  ownership: 'Ownership',
};

// FIXED: Separate filter keys into option keys (for filter options/labels) and state keys (for filter state)
// Option keys: used for building filter options and labels (status, maker, type, subtype, ownership)
export const DASHBOARD_FILTER_OPTION_KEYS = {
  STATUS: 'status',
  MAKER: 'maker',
  TYPE: 'type',
  SUBTYPE: 'subtype',
  OWNERSHIP: 'ownership',
} as const;

// State keys: includes all filter state keys (options + certificate, priceRange, hasClients)
export const DASHBOARD_FILTER_STATE_KEYS = {
  ...DASHBOARD_FILTER_OPTION_KEYS,
  CERTIFICATE: 'certificate',
  PRICE_RANGE: 'priceRange',
  HAS_CLIENTS: 'hasClients',
} as const;

// Backwards compatibility: keep DASHBOARD_FILTER_KEYS as alias to STATE_KEYS
/** @deprecated Use DASHBOARD_FILTER_STATE_KEYS for filter state, DASHBOARD_FILTER_OPTION_KEYS for options */
export const DASHBOARD_FILTER_KEYS = DASHBOARD_FILTER_STATE_KEYS;

// FIXED: Clear naming - DashboardFilterKeyValue is the value union (string literals from constants)
export type DashboardFilterKeyValue =
  (typeof DASHBOARD_FILTER_STATE_KEYS)[keyof typeof DASHBOARD_FILTER_STATE_KEYS];

// Filter label strings (UI)
export const DASHBOARD_FILTER_LABEL_STRINGS = {
  PRICE_RANGE: 'Price range',
  SEARCH: 'Search',
  DATE_RANGE: 'Date',
  FILTER_OPTIONS: 'Filter options',
  FILTERS: 'Filters',
  CLEAR_FILTERS: 'Clear filters',
  CLEAR_ALL: 'Clear all',
  APPLY: 'Apply',
  ACTIVE_FILTERS: (count: number) =>
    `${count} active filter${count === 1 ? '' : 's'}`,
} as const;

// Date field labels (advanced search)
export const DASHBOARD_DATE_FIELD_LABELS = {
  CREATED_AT: 'Created',
  UPDATED_AT: 'Updated',
} as const;

// FIXED: Removed re-export of DASHBOARD_SORT_FIELDS to avoid circular import risk
// Import DASHBOARD_SORT_FIELDS directly from @/types/sort where needed
// @deprecated This re-export is removed - import directly from @/types/sort

export const buildDashboardFilterOptions = (
  items: Instrument[]
): DashboardFilterOptions => {
  // Use common filter helper for consistency
  const result = buildFilterOptionsFromFields<Instrument>(items, {
    status: 'simple',
    maker: 'simple',
    type: 'simple',
    subtype: 'simple',
    ownership: 'simple',
  });

  return {
    status: result.status,
    maker: result.maker,
    type: result.type,
    subtype: result.subtype,
    ownership: result.ownership,
  };
};
