// src/hooks/useAsyncOperation.ts
import { useRef, useEffect, useCallback, useState } from 'react';
import { useErrorHandler } from '@/contexts/ToastContext';

type Options<T> = {
  context?: string;
  onSuccess?: (data: T) => void;
  skipSetData?: boolean;
  signal?: AbortSignal;
};

export function useAsyncOperation<T = unknown>() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<T | null>(null);
  const { handleError } = useErrorHandler();
  const mountedRef = useRef(true);
  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const run = useCallback(
    async (
      operation: (signal?: AbortSignal) => Promise<T>,
      opts: Options<T> = {}
    ): Promise<T | null> => {
      const { context, onSuccess, skipSetData, signal: externalSignal } = opts;

      // Cancel previous request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // ✅ FIXED: cleanup을 signal에 붙이지 말고 로컬 변수로 들고 가기
      let externalCleanup: (() => void) | undefined;

      // Bridge external + internal signals (abort if either fires)
      if (externalSignal) {
        if (externalSignal.aborted) {
          controller.abort();
        } else {
          const onAbort = () => controller.abort();
          externalSignal.addEventListener('abort', onAbort, { once: true });
          externalCleanup = () =>
            externalSignal.removeEventListener('abort', onAbort);
        }
      }

      setLoading(true);
      const myId = ++reqIdRef.current;

      try {
        const result = await operation(controller.signal);
        if (!mountedRef.current || myId !== reqIdRef.current) return null;

        if (!skipSetData) {
          setData(result);
        }

        onSuccess?.(result);
        return result;
      } catch (error) {
        if (!mountedRef.current || myId !== reqIdRef.current) {
          // Component unmounted or request superseded
          return null;
        }
        // Current request error
        if (controller.signal.aborted) return null;
        if (error instanceof Error && error.name === 'AbortError') return null;

        handleError(error, context);
        return null;
      } finally {
        // ✅ FIXED: 로컬 변수로 cleanup 실행
        externalCleanup?.();
        if (mountedRef.current) {
          if (myId === reqIdRef.current) {
            // Current request: set loading to false after completion
            setLoading(false);
          }
          // For non-current requests, loading will be managed by the new request
        }
      }
    },
    [handleError]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { loading, data, run, cancel, setLoading, setData };
}
