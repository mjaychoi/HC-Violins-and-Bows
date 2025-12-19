/**
 * URL 쿼리 파라미터와 상태를 동기화하는 훅
 * 페이지 전환 시 필터/검색 상태를 보존하기 위해 사용
 */

'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export interface URLStateConfig {
  /**
   * URL 동기화 활성화 여부
   */
  enabled?: boolean;

  /**
   * 동기화할 상태 키 목록
   */
  keys: string[];

  /**
   * 상태를 URL에 저장할 때 사용할 파라미터 이름 매핑
   * { stateKey: 'urlParamName' }
   */
  paramMapping?: Record<string, string>;

  /**
   * 배열 타입 상태를 URL에 저장할 때 구분자
   * @default ','
   */
  arraySeparator?: string;

  /**
   * URL 업데이트 시 스크롤 방지 여부
   * @default true
   */
  scroll?: boolean;
}

/**
 * URL 쿼리 파라미터와 상태를 동기화하는 훅
 *
 * @example
 * ```tsx
 * const { urlState, updateURLState, clearURLState } = useURLState({
 *   enabled: true,
 *   keys: ['search', 'filters', 'page'],
 *   paramMapping: {
 *     search: 'q',
 *     filters: 'f',
 *     page: 'p',
 *   },
 * });
 *
 * // URL에서 초기값 읽기
 * const initialSearch = urlState.search || '';
 *
 * // 상태 변경 시 URL 업데이트
 * updateURLState({ search: 'test' });
 *
 * // URL 초기화
 * clearURLState();
 * ```
 */
export function useURLState(config: URLStateConfig) {
  const {
    enabled = true,
    keys,
    paramMapping = {},
    arraySeparator = ',',
    scroll = true,
  } = config;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 클라이언트에서만 URL 파라미터 읽기 (SSR 안전)
  const [urlState, setUrlState] = useState<
    Record<string, string | string[] | null>
  >({});

  // 업데이트 중인지 추적하여 무한 루프 방지
  const isUpdatingRef = useRef(false);

  // URL에서 상태 읽기 (searchParams 변경 시에만)
  useEffect(() => {
    if (!enabled || isUpdatingRef.current) {
      return;
    }

    const state: Record<string, string | string[] | null> = {};

    keys.forEach(key => {
      const paramName = paramMapping[key] || key;
      const value = searchParams.get(paramName);

      if (value === null) {
        state[key] = null;
      } else if (typeof value === 'string' && value.includes(arraySeparator)) {
        // 배열 타입 (구분자로 분리)
        state[key] = value.split(arraySeparator).filter(Boolean);
      } else if (typeof value === 'string') {
        // 단일 값
        state[key] = value;
      } else {
        state[key] = null;
      }
    });

    // ✅ FIXED: 이전 상태와 비교하여 변경된 경우에만 업데이트
    // Direct comparison for strings/arrays (more efficient than JSON.stringify)
    setUrlState(prevState => {
      const hasChanged = keys.some(key => {
        const prevValue = prevState[key];
        const newValue = state[key];

        // Direct comparison for primitive types
        if (prevValue === newValue) return false;

        // Array comparison: check length and elements
        if (Array.isArray(prevValue) && Array.isArray(newValue)) {
          if (prevValue.length !== newValue.length) return true;
          return prevValue.some((v, i) => v !== newValue[i]);
        }

        // One is array, one is not
        if (Array.isArray(prevValue) !== Array.isArray(newValue)) return true;

        // Fallback to JSON.stringify for complex objects (rare)
        return JSON.stringify(prevValue) !== JSON.stringify(newValue);
      });

      return hasChanged ? state : prevState;
    });
  }, [enabled, keys, paramMapping, arraySeparator, searchParams]);

  // URL 상태 업데이트
  const updateURLState = useCallback(
    (updates: Record<string, string | string[] | null | undefined>) => {
      if (!enabled || typeof window === 'undefined') return;

      // 현재 URL 파라미터와 비교하여 변경이 없는 경우 스킵
      const currentParams = new URLSearchParams(searchParams.toString());
      let hasChanges = false;

      Object.entries(updates).forEach(([key, value]) => {
        const paramName = paramMapping[key] || key;
        const currentValue = currentParams.get(paramName);

        if (value === null || value === undefined || value === '') {
          // 빈 값이면 파라미터 제거
          if (currentValue !== null) {
            currentParams.delete(paramName);
            hasChanges = true;
          }
        } else if (Array.isArray(value)) {
          // 배열 타입: 구분자로 연결
          if (value.length > 0) {
            const newValue = value.join(arraySeparator);
            if (newValue !== currentValue) {
              currentParams.set(paramName, newValue);
              hasChanges = true;
            }
          } else {
            // 빈 배열이면 파라미터 제거
            if (currentValue !== null) {
              currentParams.delete(paramName);
              hasChanges = true;
            }
          }
        } else {
          // 단일 값
          const newValue = String(value);
          if (newValue !== currentValue) {
            currentParams.set(paramName, newValue);
            hasChanges = true;
          }
        }
      });

      // 변경사항이 있을 때만 URL 업데이트
      if (hasChanges) {
        isUpdatingRef.current = true;
        const newUrl = `${pathname}${currentParams.toString() ? `?${currentParams.toString()}` : ''}`;
        router.replace(newUrl, { scroll });
        // 다음 렌더 사이클에서 플래그 리셋
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 0);
      }
    },
    [
      enabled,
      paramMapping,
      arraySeparator,
      pathname,
      router,
      scroll,
      searchParams,
    ]
  );

  // URL 상태 초기화
  const clearURLState = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    keys.forEach(key => {
      const paramName = paramMapping[key] || key;
      params.delete(paramName);
    });

    const newUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    router.replace(newUrl, { scroll });
  }, [enabled, keys, paramMapping, pathname, router, scroll]);

  return {
    urlState,
    updateURLState,
    clearURLState,
  };
}
