import { DashboardFilterLabelMap, DashboardFilterOptions } from './types';
import { Instrument } from '@/types';
import { DASHBOARD_SORT_FIELDS } from '@/types/sort';
import { buildFilterOptionsFromFields } from '@/utils/filterHelpers';

export const DASHBOARD_FILTER_LABELS: DashboardFilterLabelMap = {
  status: '상태',
  maker: '제조사',
  type: '타입',
  subtype: '세부 타입',
  ownership: '소유자',
};

// 필터 필드명 상수 (중복 문자열 제거)
export const DASHBOARD_FILTER_KEYS = {
  STATUS: 'status',
  MAKER: 'maker',
  TYPE: 'type',
  SUBTYPE: 'subtype',
  OWNERSHIP: 'ownership',
  CERTIFICATE: 'certificate',
  PRICE_RANGE: 'priceRange',
  HAS_CLIENTS: 'hasClients',
} as const;

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

// Re-export for backwards compatibility
export { DASHBOARD_SORT_FIELDS };

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
