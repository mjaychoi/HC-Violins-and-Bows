import { DashboardFilterLabelMap, DashboardFilterOptions } from './types';
import { Instrument } from '@/types';
// FIXED: Removed DASHBOARD_SORT_FIELDS import - import directly from @/types/sort where needed
import { buildFilterOptionsFromFields } from '@/utils/filterHelpers';

export const DASHBOARD_FILTER_LABELS: DashboardFilterLabelMap = {
  status: '상태',
  maker: '제조사',
  type: '타입',
  subtype: '세부 타입',
  ownership: '소유자',
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

// 필터 라벨 상수
export const DASHBOARD_FILTER_LABEL_STRINGS = {
  PRICE_RANGE: '가격 범위',
  SEARCH: 'Search',
  DATE_RANGE: '날짜',
  FILTER_OPTIONS: '필터 옵션',
  FILTERS: 'Filters',
  CLEAR_FILTERS: '필터 초기화',
  CLEAR_ALL: '전체 초기화',
  APPLY: '적용',
  ACTIVE_FILTERS: (count: number) => `${count}개의 필터가 적용 중`,
} as const;

// 날짜 필드 라벨
export const DASHBOARD_DATE_FIELD_LABELS = {
  CREATED_AT: '생성일',
  UPDATED_AT: '수정일',
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
