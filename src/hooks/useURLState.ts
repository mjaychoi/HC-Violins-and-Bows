/**
 * URL 쿼리 파라미터와 상태를 동기화하는 훅
 * 페이지 전환 시 필터/검색 상태를 보존하기 위해 사용
 */

'use client';

import { useEffect, useCallback, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

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

  // 클라이언트에서만 URL 파라미터 읽기 (SSR 안전)
  const [urlState, setUrlState] = useState<
    Record<string, string | string[] | null>
  >({});

  // URL에서 상태 읽기 (클라이언트에서만)
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setUrlState({});
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const state: Record<string, string | string[] | null> = {};

    keys.forEach(key => {
      const paramName = paramMapping[key] || key;
      const value = params.get(paramName);

      if (value === null) {
        state[key] = null;
      } else if (value.includes(arraySeparator)) {
        // 배열 타입 (구분자로 분리)
        state[key] = value.split(arraySeparator).filter(Boolean);
      } else {
        // 단일 값
        state[key] = value;
      }
    });

    setUrlState(state);
  }, [enabled, keys, paramMapping, arraySeparator]);

  // URL 상태 업데이트
  const updateURLState = useCallback(
    (updates: Record<string, string | string[] | null | undefined>) => {
      if (!enabled || typeof window === 'undefined') return;

      const params = new URLSearchParams(window.location.search);

      Object.entries(updates).forEach(([key, value]) => {
        const paramName = paramMapping[key] || key;

        if (value === null || value === undefined || value === '') {
          // 빈 값이면 파라미터 제거
          params.delete(paramName);
        } else if (Array.isArray(value)) {
          // 배열 타입: 구분자로 연결
          if (value.length > 0) {
            params.set(paramName, value.join(arraySeparator));
          } else {
            params.delete(paramName);
          }
        } else {
          // 단일 값
          params.set(paramName, String(value));
        }
      });

      const newUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      router.replace(newUrl, { scroll });
    },
    [enabled, paramMapping, arraySeparator, pathname, router, scroll]
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
