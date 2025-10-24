// src/hooks/useAsyncOperation.ts
import { useRef, useEffect, useCallback, useState } from 'react'
import { useErrorHandler } from './useErrorHandler'

type Options<T> = {
  context?: string
  onSuccess?: (data: T) => void
  skipSetData?: boolean
  signal?: AbortSignal
}

export function useAsyncOperation<T = unknown>() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<T | null>(null)
  const { handleError } = useErrorHandler()
  const mountedRef = useRef(true)
  const reqIdRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const run = useCallback(async (
    operation: () => Promise<T>,
    opts: Options<T> = {}
  ): Promise<T | null> => {
    const { context, onSuccess, skipSetData, signal } = opts
    setLoading(true)
    const myId = ++reqIdRef.current
    try {
      const result = await operation()
      // 오래된 응답 무시
      if (!mountedRef.current || myId !== reqIdRef.current) return null
      if (!skipSetData) setData(result)
      onSuccess?.(result)
      return result
    } catch (error) {
      if (mountedRef.current && myId === reqIdRef.current) {
        // AbortError는 에러로 처리하지 않음
        if (error instanceof Error && error.name === 'AbortError') {
          return null
        }
        handleError(error, context)
      }
      return null
    } finally {
      if (mountedRef.current && myId === reqIdRef.current) {
        setLoading(false)
      }
    }
  }, [handleError])

  return { loading, data, run, setLoading, setData }
}
