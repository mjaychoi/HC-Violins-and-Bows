/**
 * Responsive Design Utilities
 * 반응형 디자인을 위한 유틸리티 함수들
 */

import { useEffect, useState } from 'react';

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
 * ✅ Hook: 현재 화면 크기가 특정 브레이크포인트보다 큰지 확인
 * SSR 안전: 초기 렌더에서는 false, 클라이언트에서만 실제 값 반환
 */
export function useBreakpoint(breakpoint: keyof typeof breakpoints): boolean {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const update = () => setOk(window.innerWidth >= breakpoints[breakpoint]);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [breakpoint]);

  return ok;
}

/**
 * ✅ Hook: 모바일 화면인지 확인 (< 768px)
 * SSR 안전: 초기 렌더에서는 false, 클라이언트에서만 실제 값 반환
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < breakpoints.md);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return isMobile;
}

/**
 * ✅ Hook: 태블릿 화면인지 확인 (768px - 1024px)
 * SSR 안전: 초기 렌더에서는 false, 클라이언트에서만 실제 값 반환
 */
export function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const update = () => {
      const width = window.innerWidth;
      setIsTablet(width >= breakpoints.md && width < breakpoints.lg);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return isTablet;
}

/**
 * ✅ Hook: 데스크톱 화면인지 확인 (>= 1024px)
 * SSR 안전: 초기 렌더에서는 false, 클라이언트에서만 실제 값 반환
 */
export function useIsDesktop(): boolean {
  return useBreakpoint('lg');
}

/**
 * ⚠️ DEPRECATED: 렌더 중 호출 시 hydration mismatch 가능
 * SSR에서는 항상 false, 클라이언트에서는 실제 값이 달라질 수 있음
 * ✅ 추천: useBreakpoint hook 사용
 */
export function isBreakpoint(breakpoint: keyof typeof breakpoints): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= breakpoints[breakpoint];
}

/**
 * ⚠️ DEPRECATED: 렌더 중 호출 시 hydration mismatch 가능
 * SSR에서는 항상 false, 클라이언트에서는 실제 값이 달라질 수 있음
 * ✅ 추천: useIsMobile hook 사용
 */
export function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < breakpoints.md;
}

/**
 * ⚠️ DEPRECATED: 렌더 중 호출 시 hydration mismatch 가능
 * SSR에서는 항상 false, 클라이언트에서는 실제 값이 달라질 수 있음
 * ✅ 추천: useIsTablet hook 사용
 */
export function isTablet(): boolean {
  if (typeof window === 'undefined') return false;
  const width = window.innerWidth;
  return width >= breakpoints.md && width < breakpoints.lg;
}

/**
 * ⚠️ DEPRECATED: 렌더 중 호출 시 hydration mismatch 가능
 * SSR에서는 항상 false, 클라이언트에서는 실제 값이 달라질 수 있음
 * ✅ 추천: useIsDesktop hook 사용
 */
export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= breakpoints.lg;
}

/**
 * ✅ FIXED: 화면 크기 변경 이벤트 리스너 등록 (requestAnimationFrame으로 최적화)
 * resize 이벤트는 드래그 중 초당 수십~수백 번 호출될 수 있어
 * requestAnimationFrame으로 한 번만 반영하여 렌더 폭발 방지
 *
 * @param callback - Resize 이벤트 핸들러
 * @param options - debounce/throttle 옵션 (선택적)
 * @returns Cleanup function
 */
export function onResize(
  callback: () => void,
  options?: { debounceMs?: number; throttleMs?: number }
): () => void {
  if (typeof window === 'undefined') return () => {};

  let raf = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastCallTime = 0;

  const handler = () => {
    const now = Date.now();

    // Throttle: 최소 간격 보장
    if (options?.throttleMs) {
      const timeSinceLastCall = now - lastCallTime;
      if (timeSinceLastCall < options.throttleMs) {
        return; // Skip this call
      }
      lastCallTime = now;
    }

    // Debounce: 연속 호출 시 마지막 호출만 실행
    if (options?.debounceMs) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(callback);
      }, options.debounceMs);
      return;
    }

    // Default: requestAnimationFrame only (no debounce/throttle)
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(callback);
  };

  window.addEventListener('resize', handler);
  return () => {
    cancelAnimationFrame(raf);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    window.removeEventListener('resize', handler);
  };
}

/**
 * ✅ FIXED: 터치 디바이스인지 확인 (더 정확한 신호 사용)
 * matchMedia('(pointer: coarse)')를 추가하여 실제 UX 목적에 더 적합
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    navigator.maxTouchPoints > 0 ||
    (window.matchMedia?.('(pointer: coarse)').matches ?? false)
  );
}
