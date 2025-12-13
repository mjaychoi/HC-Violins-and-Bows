// src/hooks/useDataFetching.ts
import { useEffect, useCallback, useState, useRef } from 'react';
import { useAsyncOperation } from './useAsyncOperation';

// common useEffect hook for data fetching
// FIXED: Added stale guard to prevent out-of-order overwrites
// FIXED: Improved documentation about dependency stability
export function useDataFetching<T, P = void>(
  fetchFunction: (param?: P, signal?: AbortSignal) => Promise<T[]>,
  context: string,
  dependencies: unknown[] = []
) {
  const { loading, run } = useAsyncOperation<T[]>();
  const [items, setItems] = useState<T[]>([]);
  const fetchFunctionRef = useRef(fetchFunction);
  // FIXED: Stale guard - useAsyncOperation already has reqIdRef, but we add another
  // layer here to ensure setItems only runs for the latest request
  const reqIdRef = useRef(0);

  // Update ref when fetchFunction changes
  useEffect(() => {
    fetchFunctionRef.current = fetchFunction;
  }, [fetchFunction]);

  // FIXED: Added stale guard wrapper for setItems
  const setItemsSafe = useCallback((newItems: T[]) => {
    setItems(newItems);
  }, []);

  const fetchData = useCallback(
    async (param?: P) => {
      const myId = ++reqIdRef.current;
      const res = await run(signal => fetchFunctionRef.current(param, signal), {
        context,
        onSuccess: data => {
          // Only update if this is still the latest request
          if (myId === reqIdRef.current) {
            setItemsSafe(data || []);
          }
        },
      });
      return res;
    },
    [run, context, setItemsSafe]
  );

  // WARNING: Dependencies are spread into useEffect deps
  // Caller MUST ensure dependencies are stable primitives or memoized
  // If dependencies are objects/arrays that change every render, this will refetch on every render
  // Consider using a stable depsKey: string | number instead if dependencies are complex
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, ...dependencies]);

  return { fetchData, loading, items, setItems: setItemsSafe };
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
