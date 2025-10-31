// src/hooks/useDataFetching.ts
import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useAsyncOperation } from './useAsyncOperation';

// common useEffect hook for data fetching
export function useDataFetching<T, P = void>(
  fetchFunction: (param?: P, signal?: AbortSignal) => Promise<T[]>,
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

  // Create a stable signature of dependencies to avoid spreading
  const depsKey = useMemo(() => JSON.stringify(dependencies), [dependencies]);

  const fetchData = useCallback(
    async (param?: P) => {
      const res = await run(signal => fetchFunctionRef.current(param, signal), {
        context,
        onSuccess: setItems,
      });
      return res;
    },
    [run, context]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData, depsKey]);

  return { fetchData, loading, items, setItems };
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
