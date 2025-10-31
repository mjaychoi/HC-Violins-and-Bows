// src/hooks/useDataFetching.ts
import { useEffect, useCallback, useState, useRef } from 'react';
import { useAsyncOperation } from './useAsyncOperation';

// common useEffect hook for data fetching
export function useDataFetching<T, P = void>(
  fetchFunction: (param?: P) => Promise<T[]>,
  context: string,
  dependencies: unknown[] = []
) {
  const { loading, run } = useAsyncOperation<T[]>();
  const [items, setItems] = useState<T[]>([]);
  const fetchFunctionRef = useRef(fetchFunction);

  // Update ref when fetchFunction changes
  useEffect(() => {
    fetchFunctionRef.current = fetchFunction;
  }, [fetchFunction]);

  const fetchData = useCallback(
    async (param?: P) => {
      const res = await run(() => fetchFunctionRef.current(param), {
        context,
        onSuccess: setItems,
      });
      return res;
    },
    [run, context]
  );

  useEffect(() => {
    fetchData();
    // deps 배열에 스프레드를 사용하는 경우 정적 검증이 어려워 경고가 발생하므로, 해당 라인에 한해 규칙을 비활성화합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, ...dependencies]);

  return { fetchData, loading, items };
}

// hook for initial data loading
export function useInitialData<T>(
  fetchFunction: () => Promise<T[]>,
  context: string
) {
  return useDataFetching(fetchFunction, context, []);
}

// hook for dependent data fetching
export function useDependentData<T>(
  fetchFunction: () => Promise<T[]>,
  context: string,
  dependencies: unknown[]
) {
  return useDataFetching(fetchFunction, context, dependencies);
}
