// src/hooks/useDataFetching.ts
import { useEffect, useCallback, useState } from 'react'
import { useAsyncOperation } from './useAsyncOperation'

// common useEffect hook for data fetching
export function useDataFetching<T, P = void>(
  fetchFunction: (param?: P) => Promise<T[]>,
  context: string,
  dependencies: unknown[] = []
) {
  const { loading, data, run } = useAsyncOperation<T[]>()
  const [items, setItems] = useState<T[]>([])

  const fetchData = useCallback(async (param?: P) => {
    const res = await run(() => fetchFunction(param), { context, onSuccess: setItems })
    return res
  }, [run, fetchFunction, context])

  useEffect(() => { fetchData() }, [fetchData, ...dependencies])

  return { fetchData, loading, items }
}

// hook for initial data loading
export function useInitialData<T>(
  fetchFunction: () => Promise<T[]>,
  context: string
) {
  return useDataFetching(fetchFunction, context, [])
}

// hook for dependent data fetching
export function useDependentData<T>(
  fetchFunction: () => Promise<T[]>,
  context: string,
  dependencies: unknown[]
) {
  return useDataFetching(fetchFunction, context, dependencies)
}
