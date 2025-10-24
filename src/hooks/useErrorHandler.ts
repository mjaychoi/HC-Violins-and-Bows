"use client"
// src/hooks/useErrorHandler.ts
import { useState, useCallback } from 'react'
import { AppError, ErrorCodes, ErrorSeverity } from '@/types/errors'
import { errorHandler } from '@/utils/errorHandler'
import ErrorToast from '@/components/ErrorToast'
import React from 'react'

export function useErrorHandler() {
  const [errors, setErrors] = useState<AppError[]>([])
  const [errorStats, setErrorStats] = useState<Map<ErrorCodes, number>>(new Map())

  const addError = useCallback((error: AppError, severity: ErrorSeverity = ErrorSeverity.MEDIUM) => {
    setErrors(prev => {
      const isDuplicate = prev.some(existingError => 
        existingError.code === error.code && 
        existingError.message === error.message
      )
      
      if (isDuplicate) return prev
      
      return [...prev, error]
    })
    
    errorHandler.logError(error, severity)
    
    // Update local stats with functional update
    setErrorStats(prev => {
      const next = new Map(prev)
      const curr = next.get(error.code as ErrorCodes) || 0
      next.set(error.code as ErrorCodes, curr + 1)
      return next
    })
  }, [])

  const removeError = useCallback((index: number) => {
    setErrors(prev => prev.filter((_, i) => i !== index))
  }, [])

  const clearErrors = useCallback(() => {
    setErrors([])
    errorHandler.clearErrorLogs()
    setErrorStats(new Map())
  }, [])

  const handleError = useCallback((error: unknown, context?: string, severity: ErrorSeverity = ErrorSeverity.MEDIUM) => {
    let appError: AppError

    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      // Already an AppError
      appError = error as AppError
    } else if (error && typeof error === 'object' && 'response' in error) {
      // API Error
      appError = errorHandler.handleNetworkError(error)
    } else if (error && typeof error === 'object' && 'code' in error) {
      // Supabase Error
      appError = errorHandler.handleSupabaseError(error, context)
    } else {
      // Generic Error
      appError = errorHandler.createError(
        ErrorCodes.UNKNOWN_ERROR,
        (error instanceof Error ? error.message : 'An unexpected error occurred'),
        (error instanceof Error ? error.stack : undefined),
        { context, originalError: error }
      )
    }

    addError(appError, severity)
    return appError
  }, [addError])

  // Enhanced error handling with retry logic
  const handleErrorWithRetry = useCallback(async (
    operation: () => Promise<unknown>,
    operationId: string,
    context?: string,
    maxRetries: number = 3
  ) => {
    let lastError: AppError | null = null
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation()
        // Clear retry attempts on success
        errorHandler.clearRetryAttempts(operationId)
        return result
      } catch (error) {
        const appError = handleError(error, context)
        lastError = appError
        
        if (!errorHandler.shouldRetry(appError, operationId)) {
          break
        }
        
        errorHandler.recordRetryAttempt(operationId)
        
        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    return { error: lastError }
  }, [handleError])

  // Get error statistics
  const getErrorStats = useCallback(() => {
    return errorHandler.getErrorStats()
  }, [])

  // Get error count by type
  const getErrorCount = useCallback((code: ErrorCodes) => {
    return errorHandler.getErrorCount(code)
  }, [])

  // Get recovery suggestions
  const getRecoverySuggestions = useCallback((error: AppError) => {
    return errorHandler.getRecoverySuggestions(error)
  }, [])

  const ErrorToasts = (): React.JSX.Element => {
    return React.createElement('div', { className: 'fixed top-4 right-4 z-50 space-y-2' },
      errors.map((error, index) => 
        React.createElement(ErrorToast, {
          key: `${error.timestamp.getTime()}-${index}`,
          error: error,
          onClose: () => removeError(index)
        })
      )
    )
  }

  return {
    errors,
    errorStats,
    addError,
    removeError,
    clearErrors,
    handleError,
    handleErrorWithRetry,
    getErrorStats,
    getErrorCount,
    getRecoverySuggestions,
    ErrorToasts
  }
}