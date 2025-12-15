/**
 * 공통 색상 토큰 시스템
 * 레포 전체에서 일관된 색상 사용을 위한 중앙 집중식 관리
 *
 * 원칙:
 * 1. 의미 기반 색상 매핑 (semantic color tokens)
 * 2. 상태별 색상 일관성 유지
 * 3. Variant 기반 확장 가능한 구조 (화면 타입별 기본값 명확화)
 * 4. 중복 제거 - 메인 팔레트에서 파생
 * 5. 타입 안정성 - union 타입으로 컴파일 타임 검증
 */

/**
 * Badge Variant 타입
 */
export type BadgeVariant = 'soft' | 'solid' | 'outline' | 'muted';

/**
 * 색상 토큰 구조 (variant별 색상 제공)
 */
export type ColorToken = {
  soft: string; // bg-100 text-800 (기본)
  solid: string; // bg-500 text-white (강조)
  outline: string; // border bg-white (outline 스타일)
  muted: string; // bg-50 text-600 ring-1 (muted 스타일)
  accent?: string; // border-l 색상 (row accent)
  dot?: string; // dot indicator 색상
};

/**
 * 상태 매핑의 UX 원칙
 * - 초록/연두: "판매 완료/성공" → Sold
 * - 빨강/로즈: "손실/종료/위험" → Overdue, Refunded
 * - 앰버: "대기/홀드/주의" → Reserved, Pending
 * - 보라: "예약 확정/관계형 상태" → Booked
 * - 블루: "진행/작업" → Maintenance, InProgress
 * - 그린(soft): "가능/정상/완료" → Available, Paid(soft), Completed(soft)
 *
 * 화면 타입별 기본 Variant 규칙:
 * - 테이블(Row 안의 뱃지/칩):
 *   - 기본 variant: muted
 *   - 예시: Clients 테이블의 Interest, Tags / Sales 테이블의 Status
 * - 카드·KPI(요약 카드, 대시보드 KPI, 상세 패널 헤더 뱃지 등):
 *   - 기본 variant: solid
 *   - 예시: Dashboard의 Status/Certificate 뱃지, Clients 확장 행의 강조 상태 뱃지
 * - 필터/폼 내부(폼 필드 옆 상태 표시, 필터 바 선택된 상태 등):
 *   - 기본 variant: soft 또는 outline
 *   - 예시: 필터 바에서 선택된 상태/태그, 폼 내 helper 뱃지
 *
 * 구현 원칙:
 * - 공용 헬퍼 기본값은 "가장 많이 쓰이는 컨텍스트" 기준으로 설정
 *   - getStatusBadgeColor / getInterestColor: muted (테이블/리스트 기본)
 *   - getTagColor: soft (역할/타입 태그는 컨텍스트에 따라 variant를 넘겨서 사용)
 *   - getTaskStatusColor: solid (캘린더/타임라인 상의 강조 Pill)
 * - 개별 화면에서 컨텍스트가 다르면 variant 인자를 명시적으로 넘겨서 사용
 */

// ============================================================================
// 타입 정의 (타입 안정성)
// ============================================================================

export type StatusKey =
  | 'Available'
  | 'Sold'
  | 'Reserved'
  | 'Booked'
  | 'Maintenance'
  | 'Unknown';
export type CertificateKey = 'Yes' | 'No' | 'Unknown';
export type InterestKey =
  | 'Active'
  | 'High'
  | 'Medium'
  | 'Moderate'
  | 'Low'
  | 'Passive'
  | 'Inactive'
  | 'NotInterested'
  | 'NoInterest'
  | 'Default';
export type TaskStatusKey =
  | 'Overdue'
  | 'InProgress'
  | 'Pending'
  | 'Upcoming'
  | 'Completed'
  | 'Cancelled'
  | 'Default';
export type SalesStatusKey = 'Paid' | 'Refunded' | 'Default';
export type RelationshipKey =
  | 'Interested'
  | 'Booked'
  | 'Sold'
  | 'Owned'
  | 'Default';
export type PurchaseStatusKey =
  | 'Completed'
  | 'Pending'
  | 'Refunded'
  | 'Default';

// Tag는 free-form이므로 string 유지 (Default fallback 전략)

// ============================================================================
// 토큰 정의
// ============================================================================

/**
 * Status 색상 토큰 (Items & Clients 공통)
 * 메인 팔레트 - 다른 곳에서 파생
 */
export const STATUS_TOKENS: Record<StatusKey, ColorToken> = {
  Available: {
    soft: 'bg-green-100 text-green-800 border-green-200',
    solid: 'bg-green-500 text-white',
    outline: 'border-green-300 text-green-700 bg-white',
    muted: 'bg-green-50 text-green-600 ring-1 ring-green-100',
    accent: 'border-l-green-200',
    dot: 'bg-green-500',
  },
  Sold: {
    soft: 'bg-green-100 text-green-800 border-green-200',
    solid: 'bg-green-500 text-white',
    outline: 'border-green-300 text-green-700 bg-white',
    muted: 'bg-green-50 text-green-600 ring-1 ring-green-100',
    accent: '', // Sold는 accent line 없음 (배경만)
    dot: 'bg-green-500',
  },
  Reserved: {
    soft: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    solid: 'bg-yellow-500 text-white',
    outline: 'border-yellow-300 text-yellow-700 bg-white',
    muted: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
    accent: 'border-l-amber-200',
    dot: 'bg-yellow-500',
  },
  Booked: {
    soft: 'bg-purple-100 text-purple-800 border-purple-200', // ✅ FIXED: yellow → purple (일관성)
    solid: 'bg-purple-500 text-white',
    outline: 'border-purple-300 text-purple-700 bg-white',
    muted: 'bg-purple-50 text-purple-600 ring-1 ring-purple-100',
    accent: 'border-l-purple-200',
    dot: 'bg-purple-500',
  },
  Maintenance: {
    soft: 'bg-blue-100 text-blue-800 border-blue-200',
    solid: 'bg-blue-500 text-white',
    outline: 'border-blue-300 text-blue-700 bg-white',
    muted: 'bg-blue-50 text-blue-600 ring-1 ring-blue-100',
    accent: 'border-l-blue-200',
    dot: 'bg-blue-500',
  },
  Unknown: {
    soft: 'bg-gray-100 text-gray-800 border-gray-200',
    solid: 'bg-gray-500 text-white',
    outline: 'border-gray-300 text-gray-700 bg-white',
    muted: 'bg-gray-50 text-gray-700 ring-1 ring-gray-100',
    accent: 'border-l-gray-200',
    dot: 'bg-gray-400',
  },
} as const;

/**
 * Certificate 색상 토큰 (Items 전용)
 * 디자인 원칙: Certificate badge는 기본적으로 outline 스타일 사용
 * (Status와 구분하기 위해, 컴포넌트 레벨에서 outline variant 강제)
 */
export const CERTIFICATE_TOKENS: Record<CertificateKey, ColorToken> = {
  Yes: {
    soft: 'bg-green-100 text-green-800 border-green-200',
    solid: 'bg-green-500 text-white',
    outline: 'border-green-300 text-green-700 bg-white', // 기본 사용
    muted: 'bg-green-50 text-green-600 ring-1 ring-green-100',
    dot: 'bg-green-500',
  },
  No: {
    soft: 'bg-gray-100 text-gray-800 border-gray-200',
    solid: 'bg-gray-500 text-white',
    outline: 'border-gray-300 text-gray-500 bg-white', // 기본 사용
    muted: 'bg-gray-50 text-gray-500 ring-1 ring-gray-100',
    dot: 'bg-gray-400',
  },
  Unknown: {
    soft: 'bg-gray-100 text-gray-800 border-gray-200',
    solid: 'bg-gray-500 text-white',
    outline: 'border-gray-200 text-gray-400 bg-white', // 기본 사용
    muted: 'bg-gray-50 text-gray-400 ring-1 ring-gray-100',
    dot: 'bg-gray-400',
  },
} as const;

/**
 * Interest 색상 토큰 (Clients 전용)
 * 테이블에서는 muted, 카드/KPI에서는 solid 사용
 */
export const INTEREST_TOKENS: Record<InterestKey, ColorToken> = {
  Active: {
    soft: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    solid: 'bg-emerald-500 text-white', // 카드/KPI용
    outline: 'border-emerald-300 text-emerald-700 bg-white',
    muted: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', // 테이블용
    dot: 'bg-emerald-500',
  },
  High: {
    soft: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    solid: 'bg-emerald-500 text-white',
    outline: 'border-emerald-300 text-emerald-700 bg-white',
    muted: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
    dot: 'bg-emerald-500',
  },
  Medium: {
    soft: 'bg-emerald-300 text-emerald-800 border-emerald-300',
    solid: 'bg-emerald-400 text-white',
    outline: 'border-emerald-300 text-emerald-700 bg-white',
    muted: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
    dot: 'bg-emerald-400',
  },
  Moderate: {
    soft: 'bg-emerald-300 text-emerald-800 border-emerald-300',
    solid: 'bg-emerald-400 text-white',
    outline: 'border-emerald-300 text-emerald-700 bg-white',
    muted: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
    dot: 'bg-emerald-400',
  },
  Low: {
    soft: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    solid: 'bg-emerald-300 text-emerald-800',
    outline: 'border-emerald-200 text-emerald-600 bg-white',
    muted: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
    dot: 'bg-emerald-300',
  },
  Passive: {
    soft: 'bg-gray-200 text-gray-600 border-gray-300',
    solid: 'bg-gray-400 text-white',
    outline: 'border-gray-300 text-gray-600 bg-white',
    muted: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
    dot: 'bg-gray-400',
  },
  Inactive: {
    soft: 'bg-gray-200 text-gray-600 border-gray-300',
    solid: 'bg-gray-400 text-white',
    outline: 'border-gray-300 text-gray-600 bg-white',
    muted: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
    dot: 'bg-gray-400',
  },
  NotInterested: {
    soft: 'bg-gray-200 text-gray-600 border-gray-300',
    solid: 'bg-gray-400 text-white',
    outline: 'border-gray-300 text-gray-600 bg-white',
    muted: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
    dot: 'bg-gray-400',
  },
  NoInterest: {
    soft: 'bg-gray-200 text-gray-600 border-gray-300',
    solid: 'bg-gray-400 text-white',
    outline: 'border-gray-300 text-gray-600 bg-white',
    muted: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
    dot: 'bg-gray-400',
  },
  Default: {
    soft: 'bg-blue-100 text-blue-700 border-blue-200',
    solid: 'bg-blue-500 text-white',
    outline: 'border-blue-300 text-blue-700 bg-white',
    muted: 'bg-blue-50 text-blue-600 ring-1 ring-blue-100',
    dot: 'bg-blue-500',
  },
} as const;

/**
 * Tags 색상 토큰 (Clients 전용)
 *
 * 의미 축 가이드:
 * - Tags: 역할/유형(role/type) 중심 (Owner, Musician, Dealer, Collector, Other 등)
 * - Interest: 관심도 축 (Active, Passive, Inactive 등)
 * - Client.status: 영업 상태 축 (Active, Browsing, In Negotiation, Inactive 등)
 *
 * ⚠️ 주의:
 * - Active / Passive / Inactive 같은 단어는 "상태"로 읽히므로
 *   새 태그를 정의할 때는 가급적 사용하지 않는 것을 권장
 * - 아래 Active/Passive/Inactive Tag 토큰은 과거 데이터 호환을 위한 것으로,
 *   UI 에서는 getTagDisplayLabel()을 통해 'Active Client' 등으로 표기
 */
export const TAG_TOKENS: Record<string, ColorToken> = {
  Owner: {
    soft: 'bg-emerald-100 text-emerald-800 border-emerald-300 ring-1 ring-emerald-200',
    solid: 'bg-emerald-500 text-white',
    outline: 'border-emerald-300 text-emerald-700 bg-white',
    muted: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  },
  Dealer: {
    soft: 'bg-teal-100 text-teal-800 border-teal-300 ring-1 ring-teal-200',
    solid: 'bg-teal-500 text-white',
    outline: 'border-teal-300 text-teal-700 bg-white',
    muted: 'bg-teal-50 text-teal-700 ring-1 ring-teal-100',
  },
  Collector: {
    soft: 'bg-cyan-100 text-cyan-800 border-cyan-300 ring-1 ring-cyan-200',
    solid: 'bg-cyan-500 text-white',
    outline: 'border-cyan-300 text-cyan-700 bg-white',
    muted: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100',
  },
  Musician: {
    soft: 'bg-indigo-100 text-indigo-800 border-indigo-300 ring-1 ring-indigo-200',
    solid: 'bg-indigo-500 text-white',
    outline: 'border-indigo-300 text-indigo-700 bg-white',
    muted: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100',
  },
  Technician: {
    soft: 'bg-violet-100 text-violet-800 border-violet-300 ring-1 ring-violet-200',
    solid: 'bg-violet-500 text-white',
    outline: 'border-violet-300 text-violet-700 bg-white',
    muted: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
  },
  Teacher: {
    soft: 'bg-purple-100 text-purple-800 border-purple-300 ring-1 ring-purple-200',
    solid: 'bg-purple-500 text-white',
    outline: 'border-purple-300 text-purple-700 bg-white',
    muted: 'bg-purple-50 text-purple-700 ring-1 ring-purple-100',
  },
  Student: {
    soft: 'bg-blue-100 text-blue-800 border-blue-300 ring-1 ring-blue-200',
    solid: 'bg-blue-500 text-white',
    outline: 'border-blue-300 text-blue-700 bg-white',
    muted: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
  },
  // ⚠️ 주의: Active/Passive/Inactive는 상태로 읽힐 수 있음
  Active: {
    soft: 'bg-green-100 text-green-800 border-green-300 ring-1 ring-green-200',
    solid: 'bg-green-500 text-white',
    outline: 'border-green-300 text-green-700 bg-white',
    muted: 'bg-green-50 text-green-700 ring-1 ring-green-100',
  },
  Passive: {
    soft: 'bg-amber-100 text-amber-800 border-amber-300 ring-1 ring-amber-200',
    solid: 'bg-amber-500 text-white',
    outline: 'border-amber-300 text-amber-700 bg-white',
    muted: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  },
  Inactive: {
    soft: 'bg-gray-100 text-gray-800 border-gray-300 ring-1 ring-gray-200',
    solid: 'bg-gray-500 text-white',
    outline: 'border-gray-300 text-gray-700 bg-white',
    muted: 'bg-gray-50 text-gray-700 ring-1 ring-gray-100',
  },
  Other: {
    soft: 'bg-slate-100 text-slate-800 border-slate-300 ring-1 ring-slate-200',
    solid: 'bg-slate-500 text-white',
    outline: 'border-slate-300 text-slate-700 bg-white',
    muted: 'bg-slate-50 text-slate-700 ring-1 ring-slate-100',
  },
  Default: {
    soft: 'bg-gray-100 text-gray-700 border-gray-300 ring-1 ring-gray-200',
    solid: 'bg-gray-500 text-white',
    outline: 'border-gray-300 text-gray-700 bg-white',
    muted: 'bg-gray-50 text-gray-700 ring-1 ring-gray-100',
  },
} as const;

/**
 * Task Status 색상 토큰 (Calendar/Maintenance Tasks 전용)
 */
export const TASK_STATUS_TOKENS: Record<TaskStatusKey, ColorToken> = {
  Overdue: {
    soft: 'bg-red-100 text-red-800 border-red-200',
    solid: 'bg-red-500 text-white',
    outline: 'border-red-300 text-red-700 bg-white',
    muted: 'bg-red-50 text-red-700 ring-1 ring-red-100',
    accent: 'border-l-red-500',
    dot: 'bg-red-500',
  },
  InProgress: {
    soft: 'bg-blue-100 text-blue-800 border-blue-200',
    solid: 'bg-blue-500 text-white',
    outline: 'border-blue-300 text-blue-700 bg-white',
    muted: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
    accent: 'border-l-blue-500',
    dot: 'bg-blue-500',
  },
  Pending: {
    soft: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    solid: 'bg-emerald-500 text-white',
    outline: 'border-emerald-300 text-emerald-700 bg-white',
    muted: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
    accent: 'border-l-emerald-500',
    dot: 'bg-emerald-500',
  },
  Upcoming: {
    soft: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    solid: 'bg-emerald-500 text-white',
    outline: 'border-emerald-300 text-emerald-700 bg-white',
    muted: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
    accent: 'border-l-emerald-500',
    dot: 'bg-emerald-500',
  },
  Completed: {
    soft: 'bg-gray-300 text-gray-800 border-gray-400',
    solid: 'bg-gray-400 text-white',
    outline: 'border-gray-300 text-gray-700 bg-white',
    muted: 'bg-gray-200 text-gray-600 ring-1 ring-gray-300',
    accent: 'border-l-gray-400',
    dot: 'bg-gray-400',
  },
  Cancelled: {
    soft: 'bg-gray-300 text-gray-800 border-gray-400',
    solid: 'bg-gray-400 text-white',
    outline: 'border-gray-300 text-gray-700 bg-white',
    muted: 'bg-gray-200 text-gray-600 ring-1 ring-gray-300',
    accent: 'border-l-gray-400',
    dot: 'bg-gray-400',
  },
  Default: {
    soft: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    solid: 'bg-emerald-500 text-white',
    outline: 'border-emerald-300 text-emerald-700 bg-white',
    muted: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
    accent: 'border-l-emerald-500',
    dot: 'bg-emerald-500',
  },
} as const;

/**
 * Sales Status 색상 토큰 (Sales 전용)
 */
export const SALES_STATUS_TOKENS: Record<SalesStatusKey, ColorToken> = {
  Paid: {
    soft: 'bg-green-100 text-green-700 border-green-200',
    solid: 'bg-green-500 text-white',
    outline: 'border-green-300 text-green-700 bg-white',
    muted: 'bg-green-50 text-green-600 ring-1 ring-green-100',
    dot: 'bg-green-500',
  },
  Refunded: {
    soft: 'bg-rose-100 text-rose-700 border-rose-200',
    solid: 'bg-rose-500 text-white',
    outline: 'border-rose-300 text-rose-700 bg-white',
    muted: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
    dot: 'bg-rose-500',
  },
  Default: {
    soft: 'bg-gray-100 text-gray-700 border-gray-200',
    solid: 'bg-gray-500 text-white',
    outline: 'border-gray-300 text-gray-700 bg-white',
    muted: 'bg-gray-50 text-gray-600 ring-1 ring-gray-100',
    dot: 'bg-gray-400',
  },
} as const;

/**
 * Relationship Type 색상 토큰 (Connections 전용)
 * ✅ FIXED: Status와 동일한 의미 체계 사용 (Sold=green, Booked=purple, Interested=amber)
 */
export const RELATIONSHIP_TOKENS: Record<RelationshipKey, ColorToken> = {
  Interested: {
    soft: 'bg-amber-100 text-amber-800 border-amber-200', // ✅ FIXED: yellow → amber
    solid: 'bg-amber-500 text-white',
    outline: 'border-amber-300 text-amber-700 bg-white',
    muted: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
    accent: 'border-l-amber-200',
    dot: 'bg-amber-500',
  },
  Booked: {
    soft: 'bg-purple-100 text-purple-800 border-purple-200', // ✅ FIXED: blue → purple
    solid: 'bg-purple-500 text-white',
    outline: 'border-purple-300 text-purple-700 bg-white',
    muted: 'bg-purple-50 text-purple-700 ring-1 ring-purple-100',
    accent: 'border-l-purple-200',
    dot: 'bg-purple-500',
  },
  Sold: {
    soft: 'bg-green-100 text-green-800 border-green-200',
    solid: 'bg-green-500 text-white',
    outline: 'border-green-300 text-green-700 bg-white',
    muted: 'bg-green-50 text-green-600 ring-1 ring-green-100',
    accent: 'border-l-green-200',
    dot: 'bg-green-500',
  },
  Owned: {
    soft: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    solid: 'bg-indigo-500 text-white',
    outline: 'border-indigo-300 text-indigo-700 bg-white',
    muted: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100',
    accent: 'border-l-indigo-200',
    dot: 'bg-indigo-500',
  },
  Default: {
    soft: 'bg-gray-100 text-gray-800 border-gray-200',
    solid: 'bg-gray-500 text-white',
    outline: 'border-gray-300 text-gray-700 bg-white',
    muted: 'bg-gray-50 text-gray-700 ring-1 ring-gray-100',
    accent: 'border-l-gray-300',
    dot: 'bg-gray-400',
  },
} as const;

/**
 * Purchase Status 색상 토큰 (PurchaseHistory 전용)
 * ✅ FIXED: Pending을 amber로 변경하여 "대기 계열 = amber" 원칙 강화
 */
export const PURCHASE_STATUS_TOKENS: Record<PurchaseStatusKey, ColorToken> = {
  Completed: {
    soft: 'bg-green-100 text-green-700 border-green-200',
    solid: 'bg-green-500 text-white',
    outline: 'border-green-300 text-green-700 bg-white',
    muted: 'bg-green-50 text-green-600 ring-1 ring-green-100',
    dot: 'bg-green-500',
  },
  Pending: {
    soft: 'bg-amber-100 text-amber-700 border-amber-200', // ✅ FIXED: yellow → amber
    solid: 'bg-amber-500 text-white',
    outline: 'border-amber-300 text-amber-700 bg-white',
    muted: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
    dot: 'bg-amber-500',
  },
  Refunded: {
    soft: 'bg-red-100 text-red-700 border-red-200',
    solid: 'bg-red-500 text-white',
    outline: 'border-red-300 text-red-700 bg-white',
    muted: 'bg-red-50 text-red-600 ring-1 ring-red-100',
    dot: 'bg-red-500',
  },
  Default: {
    soft: 'bg-gray-100 text-gray-700 border-gray-200',
    solid: 'bg-gray-500 text-white',
    outline: 'border-gray-300 text-gray-700 bg-white',
    muted: 'bg-gray-50 text-gray-600 ring-1 ring-gray-100',
    dot: 'bg-gray-400',
  },
} as const;

// ============================================================================
// 정규화 함수 (버그 방지)
// ============================================================================

/**
 * Task Status 키 정규화 함수
 * ✅ FIXED: lowercase status를 CamelCase 키로 변환
 */
export const normalizeTaskStatusKey = (status: string): TaskStatusKey => {
  const s = status.toLowerCase().trim();
  if (s === 'in_progress' || s === 'in-progress' || s === 'inprogress')
    return 'InProgress';
  if (s === 'completed') return 'Completed';
  if (s === 'cancelled' || s === 'canceled') return 'Cancelled';
  if (s === 'pending') return 'Pending';
  if (s === 'upcoming') return 'Upcoming';
  if (s === 'overdue') return 'Overdue';
  return 'Default';
};

// ============================================================================
// 공통 Getter 함수 (API 디자인 개선)
// ============================================================================

/**
 * 토큰 가져오기 (공통 헬퍼)
 */
function getToken<T extends string>(
  tokens: Record<T, ColorToken>,
  key: string,
  fallback: T
): ColorToken {
  const normalized = key.trim() as T;
  return tokens[normalized] || tokens[fallback];
}

/**
 * 토큰 클래스 가져오기 (variant별)
 */
function getTokenClass(token: ColorToken, variant: BadgeVariant): string {
  return token[variant] || token.soft;
}

/**
 * 토큰 Dot 색상 가져오기
 */
function getTokenDot(token: ColorToken): string {
  return token.dot || 'bg-gray-400';
}

/**
 * 토큰 Accent 색상 가져오기
 */
function getTokenAccent(token: ColorToken): string {
  return token.accent || '';
}

// ============================================================================
// Public API 함수들
// ============================================================================

/**
 * Status 색상 가져오기 (기본: soft variant)
 * ✅ FIXED: Reserved/Booked 별도 처리 제거 (토큰에 이미 있음)
 */
export const getStatusColor = (
  status: string,
  variant: BadgeVariant = 'soft'
): string => {
  const normalized = status.trim() as StatusKey;
  const token = getToken(STATUS_TOKENS, normalized, 'Unknown');
  return getTokenClass(token, variant);
};

/**
 * StatusBadge 색상 가져오기 (muted variant)
 */
export const getStatusBadgeColor = (status: string): string => {
  return getStatusColor(status, 'muted');
};

/**
 * Row Accent Line 색상 가져오기
 */
export const getRowAccentColor = (status: string): string => {
  const normalized = status.trim() as StatusKey;
  const token = getToken(STATUS_TOKENS, normalized, 'Unknown');
  return getTokenAccent(token);
};

/**
 * Certificate 색상 가져오기 (outline variant 기본)
 * 디자인 원칙: Certificate badge는 outline 스타일 사용
 */
export const getCertificateColor = (
  certificate: boolean | null | undefined,
  variant: BadgeVariant = 'outline'
): string => {
  let key: CertificateKey = 'Unknown';
  if (certificate === true) key = 'Yes';
  else if (certificate === false) key = 'No';

  const token = CERTIFICATE_TOKENS[key];
  return getTokenClass(token, variant);
};

/**
 * Interest 색상 가져오기
 * ✅ FIXED: 우선순위 있는 exact match + fallback
 * 테이블에서는 muted (기본값), 카드/KPI에서는 solid 사용
 */
export const getInterestColor = (
  interest: string | null,
  variant: BadgeVariant = 'muted' // 테이블용 기본값
): string => {
  if (!interest) {
    return getTokenClass(INTEREST_TOKENS.NoInterest, variant);
  }

  const normalized = interest.trim();

  // Exact match 우선
  const exactMatch = INTEREST_TOKENS[normalized as InterestKey];
  if (exactMatch) {
    return getTokenClass(exactMatch, variant);
  }

  // 키워드 매칭 (exact match 실패 시)
  // ✅ FIXED: 단어 경계를 고려한 안전한 매칭 (예: "Active buyer" → Active, "notable" → 매칭 안 됨)
  const lowerInterest = normalized.toLowerCase();

  // Active/High interest: "active" 또는 "high"가 단어로 포함된 경우
  // 정규식으로 단어 경계 확인 (단어 시작/끝 또는 공백으로 구분)
  if (
    /^active\b/i.test(lowerInterest) ||
    /\bactive\b/i.test(lowerInterest) ||
    /^high\b/i.test(lowerInterest) ||
    /\bhigh\b/i.test(lowerInterest) ||
    lowerInterest === 'very active' ||
    lowerInterest === 'very high' ||
    lowerInterest === 'urgent'
  ) {
    return getTokenClass(INTEREST_TOKENS.Active, variant);
  }

  // ✅ FIXED: Passive/Inactive/Not interested를 Medium보다 먼저 확인 (우선순위)
  // "Not interested"는 "interested"를 포함하지만 Passive여야 함
  if (
    /^passive\b/i.test(lowerInterest) ||
    /\bpassive\b/i.test(lowerInterest) ||
    /^inactive\b/i.test(lowerInterest) ||
    /\binactive\b/i.test(lowerInterest) ||
    lowerInterest === 'not interested' ||
    lowerInterest === 'no interest' ||
    lowerInterest.startsWith('not interested') ||
    lowerInterest.startsWith('no interest')
  ) {
    return getTokenClass(INTEREST_TOKENS.Passive, variant);
  }

  // Medium interest: "medium", "moderate", "interested", "considering"이 단어로 포함
  // (Passive가 아닌 경우에만)
  if (
    /^medium\b/i.test(lowerInterest) ||
    /\bmedium\b/i.test(lowerInterest) ||
    /^moderate\b/i.test(lowerInterest) ||
    /\bmoderate\b/i.test(lowerInterest) ||
    /^interested\b/i.test(lowerInterest) ||
    /\binterested\b/i.test(lowerInterest) ||
    /^considering\b/i.test(lowerInterest) ||
    /\bconsidering\b/i.test(lowerInterest)
  ) {
    return getTokenClass(INTEREST_TOKENS.Medium, variant);
  }

  // Low interest: "low", "maybe", "someday"가 단어로 포함
  // (Passive가 아닌 경우에만)
  if (
    /^low\b/i.test(lowerInterest) ||
    /\blow\b/i.test(lowerInterest) ||
    /^maybe\b/i.test(lowerInterest) ||
    /\bmaybe\b/i.test(lowerInterest) ||
    /^someday\b/i.test(lowerInterest) ||
    /\bsomeday\b/i.test(lowerInterest)
  ) {
    return getTokenClass(INTEREST_TOKENS.Low, variant);
  }

  return getTokenClass(INTEREST_TOKENS.Default, variant);
};

/**
 * Tag 색상 가져오기 (soft variant 기본)
 */
export const getTagColor = (
  tag: string,
  variant: BadgeVariant = 'soft'
): string => {
  const normalizedTag = tag.trim();
  const token = TAG_TOKENS[normalizedTag] || TAG_TOKENS.Default;
  return getTokenClass(token, variant);
};

/**
 * Task Status 색상 가져오기
 * ✅ FIXED: normalizeTaskStatusKey 사용
 */
export const getTaskStatusColor = (
  status: string,
  options?: { isOverdue?: boolean; isUpcoming?: boolean },
  variant: BadgeVariant = 'solid'
): string => {
  if (options?.isOverdue) {
    return getTokenClass(TASK_STATUS_TOKENS.Overdue, variant);
  }
  if (options?.isUpcoming) {
    return getTokenClass(TASK_STATUS_TOKENS.Upcoming, variant);
  }

  const key = normalizeTaskStatusKey(status);
  const token = TASK_STATUS_TOKENS[key];
  return getTokenClass(token, variant);
};

/**
 * Task Status Dot 색상 가져오기
 * ✅ FIXED: normalizeTaskStatusKey 사용 (버그 수정)
 */
export const getTaskStatusDotColor = (
  status: string,
  options?: { isOverdue?: boolean; isUpcoming?: boolean }
): string => {
  if (options?.isOverdue) {
    return getTokenDot(TASK_STATUS_TOKENS.Overdue);
  }
  if (options?.isUpcoming) {
    return getTokenDot(TASK_STATUS_TOKENS.Upcoming);
  }

  const key = normalizeTaskStatusKey(status);
  const token = TASK_STATUS_TOKENS[key];
  return getTokenDot(token);
};

/**
 * Sales Status 색상 가져오기
 */
export const getSalesStatusColor = (
  status: string,
  variant: BadgeVariant = 'soft'
): string => {
  const normalized = status.trim() as SalesStatusKey;
  const token = getToken(SALES_STATUS_TOKENS, normalized, 'Default');
  return getTokenClass(token, variant);
};

/**
 * Relationship Type 색상 가져오기
 * ✅ FIXED: Status와 동일한 의미 체계 사용
 */
export const getRelationshipColor = (
  relationshipType: string,
  variant: BadgeVariant = 'soft'
): string => {
  const normalized = relationshipType.trim() as RelationshipKey;
  const token = getToken(RELATIONSHIP_TOKENS, normalized, 'Default');
  return getTokenClass(token, variant);
};

/**
 * Relationship Type Row Accent 색상 가져오기
 * - Connections 카드 등에서 사용
 */
export const getRelationshipAccentColor = (
  relationshipType: string
): string => {
  const normalized = relationshipType.trim() as RelationshipKey;
  const token = getToken(RELATIONSHIP_TOKENS, normalized, 'Default');
  return getTokenAccent(token);
};

/**
 * Purchase Status 색상 가져오기
 */
export const getPurchaseStatusColor = (
  status: string,
  variant: BadgeVariant = 'soft'
): string => {
  const normalized = status.trim() as PurchaseStatusKey;
  const token = getToken(PURCHASE_STATUS_TOKENS, normalized, 'Default');
  return getTokenClass(token, variant);
};

/**
 * 색상 토큰 사용 가이드
 *
 * 1. Status (Items & Clients 공통):
 *    - Available: green (가능/정상)
 *    - Sold: green (판매 완료)
 *    - Reserved: amber/yellow (대기/홀드)
 *    - Booked: purple (예약 확정) ✅ FIXED
 *    - Maintenance: blue (진행/작업)
 *
 * 2. Certificate (Items 전용):
 *    - Yes: green-300 outline (Status와 구분)
 *    - No: gray-300 outline
 *    - 디자인 원칙: outline variant 기본 사용
 *
 * 3. Interest (Clients 전용):
 *    - Active: emerald (muted for table, solid for card/KPI) ✅ FIXED
 *    - Medium: emerald-300
 *    - Low: emerald-100
 *    - Passive: gray-200
 *
 * 4. Tags (Clients 전용):
 *    - 다양한 역할 표현 (emerald, teal, cyan, indigo, violet, purple, blue 등)
 *    - ⚠️ 주의: Active/Passive/Inactive는 상태로 읽힐 수 있음
 *
 * 5. Task Status (Calendar/Maintenance 전용):
 *    - Overdue: red-500 (위험)
 *    - In Progress: blue-500 (진행)
 *    - Pending/Upcoming: emerald-500 (예정)
 *    - Completed/Cancelled: gray-300 (완료)
 *
 * 6. Sales Status (Sales 전용):
 *    - Paid: green-100 (완료)
 *    - Refunded: rose-100 (환불)
 *
 * 7. Relationship (Connections 전용):
 *    - Interested: amber (대기) ✅ FIXED
 *    - Booked: purple (예약 확정) ✅ FIXED
 *    - Sold: green (판매 완료) ✅ FIXED
 *    - Owned: purple
 *
 * 8. Purchase Status (PurchaseHistory 전용):
 *    - Completed: green-100
 *    - Pending: amber-100 (대기 계열) ✅ FIXED
 *    - Refunded: red-100
 *
 * Variant 사용:
 * - soft: 기본 (bg-100 text-800)
 * - solid: 강조 (bg-500 text-white)
 * - outline: 외곽선 (border bg-white)
 * - muted: 테이블용 (bg-50 text-600 ring-1)
 */
