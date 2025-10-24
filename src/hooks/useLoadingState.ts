// src/hooks/useLoadingState.ts
import { useState, useCallback } from 'react'

export function useLoadingState(initialState: boolean = false) {
  const [loading, setLoading] = useState(initialState)
  const [submitting, setSubmitting] = useState(false)

  const startLoading = useCallback(() => {
    setLoading(true)
  }, [])

  const stopLoading = useCallback(() => {
    setLoading(false)
  }, [])

  const startSubmitting = useCallback(() => {
    setSubmitting(true)
  }, [])

  const stopSubmitting = useCallback(() => {
    setSubmitting(false)
  }, [])

  const withLoading = useCallback(async <T>(
    operation: () => Promise<T>,
    useSubmitting: boolean = false
  ): Promise<T> => {
    const startState = useSubmitting ? startSubmitting : startLoading
    const stopState = useSubmitting ? stopSubmitting : stopLoading

    startState()
    try {
      return await operation() 
    } finally {
      stopState()
    }
  }, [startLoading, stopLoading, startSubmitting, stopSubmitting])

  return {
    loading,
    submitting,
    startLoading,
    stopLoading,
    startSubmitting,
    stopSubmitting,
    withLoading,
    setLoading,
    setSubmitting
  }
}
