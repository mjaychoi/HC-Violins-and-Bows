// src/hooks/useDataFetching.ts
import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useAsyncOperation } from './useAsyncOperation';

// common useEffect hook for data fetching
// ✅ FIXED: useAsyncOperation의 run이 "최신 요청만 setData 한다"면 → useDataFetching의 myId 가드 제거
// useAsyncOperation은 실행/취소/로딩만, useDataFetching이 items state만 담당
type UseDataFetchingDeps = string | number | ReadonlyArray<unknown>;

export function useDataFetching<T, P = void>(
  fetchFunction: (param?: P, signal?: AbortSignal) => Promise<T[]>,
  context: string,
  depsKey: UseDataFetchingDeps = ''
) {
  const { loading, run } = useAsyncOperation<T[]>();
  const [items, setItems] = useState<T[]>([]);
  const fetchFunctionRef = useRef(fetchFunction);

  useEffect(() => {
    fetchFunctionRef.current = fetchFunction;
  }, [fetchFunction]);

  const fetchData = useCallback(
    async (param?: P) => {
      const res = await run(signal => fetchFunctionRef.current(param, signal), {
        context,
        skipSetData: true, // ✅ FIXED: useAsyncOperation은 setData 안 함
        onSuccess: data => {
          // ✅ FIXED: useDataFetching만 items state 담당
          setItems(data || []);
        },
      });
      return res;
    },
    [run, context]
  );

  // ✅ FIXED: fetchData를 의존성에서 제거하여 무한 루프 방지
  // fetchData는 run과 context에만 의존하므로, run과 context가 변경될 때만 재생성됨
  // 하지만 run은 useAsyncOperation에서 handleError에만 의존하므로 안정적임
  // WARNING: Dependencies are spread into useEffect deps
  // Caller MUST ensure dependencies are stable primitives or memoized
  // If dependencies are objects/arrays that change every render, this will refetch on every render
  // Consider using a stable depsKey: string | number instead if dependencies are complex
  const serializedDepsKey = useMemo(() => {
    if (Array.isArray(depsKey)) {
      return JSON.stringify(depsKey);
    }
    return String(depsKey ?? '');
  }, [depsKey]);

  const lastDepsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const triggerKey = `${context}:${serializedDepsKey}`;
    if (lastDepsKeyRef.current === triggerKey) {
      return;
    }
    lastDepsKeyRef.current = triggerKey;
    void fetchData();
  }, [fetchData, serializedDepsKey, context]);

  return { fetchData, loading, items, setItems };
}

// hook for initial data loading
export function useInitialData<T>(
  fetchFunction: () => Promise<T[]>,
  context: string
) {
  return useDataFetching(fetchFunction, context, '');
}

// hook for dependent data fetching
function serializeDeps(dependencies: unknown[]): string {
  return dependencies
    .map(dep => {
      try {
        return JSON.stringify(dep);
      } catch {
        return String(dep);
      }
    })
    .join('|');
}

export function useDependentData<T>(
  fetchFunction: () => Promise<T[]>,
  context: string,
  dependencies: unknown[]
) {
  const depsKey = serializeDeps(dependencies);
  return useDataFetching(fetchFunction, context, depsKey);
}
