/**
 * Responsive Design Utilities
 * 반응형 디자인을 위한 유틸리티 함수들
 */

/**
 * Tailwind CSS 브레이크포인트
 */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

/**
 * 현재 화면 크기가 특정 브레이크포인트보다 큰지 확인
 */
export function isBreakpoint(breakpoint: keyof typeof breakpoints): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= breakpoints[breakpoint];
}

/**
 * 모바일 화면인지 확인 (< 768px)
 */
export function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < breakpoints.md;
}

/**
 * 태블릿 화면인지 확인 (768px - 1024px)
 */
export function isTablet(): boolean {
  if (typeof window === 'undefined') return false;
  const width = window.innerWidth;
  return width >= breakpoints.md && width < breakpoints.lg;
}

/**
 * 데스크톱 화면인지 확인 (>= 1024px)
 */
export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= breakpoints.lg;
}

/**
 * 화면 크기 변경 이벤트 리스너 등록
 */
export function onResize(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

/**
 * 터치 디바이스인지 확인
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
