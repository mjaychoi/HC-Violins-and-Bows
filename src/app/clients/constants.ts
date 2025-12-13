// Client 관련 상수 정의

/**
 * 클라이언트 태그 옵션
 * ClientForm, ClientModal, ClientList 등에서 공통 사용
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
 * Interest 레벨 옵션
 */
export const INTEREST_LEVELS = ['Active', 'Passive', 'Inactive'] as const;

export type InterestLevel = (typeof INTEREST_LEVELS)[number];

/**
 * Instrument Connection 필터 옵션
 */
export const HAS_INSTRUMENTS_FILTER_OPTIONS = {
  HAS: 'Has Instruments',
  NO: 'No Instruments',
} as const;

/**
 * Client 필터 라벨 상수
 */
export const CLIENT_FILTER_LABELS = {
  LAST_NAME: '성',
  FIRST_NAME: '이름',
  CONTACT_NUMBER: '연락처',
  EMAIL: '이메일',
  TAGS: '태그',
  INTEREST: '관심도',
  HAS_INSTRUMENTS: '악기 연결',
  FILTER_OPTIONS: '필터 옵션',
  ACTIVE_FILTERS: (count: number) => `검색/필터 ${count}개 적용 중`,
} as const;
