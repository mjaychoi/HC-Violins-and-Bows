'use client';
import { useState, useCallback } from 'react';
import { AppError, ErrorCodes, ErrorSeverity } from '@/types/errors';
import { errorHandler } from '@/utils/errorHandler';
import { captureException } from '@/utils/monitoring';
import ErrorToast from '@/components/ErrorToast';
import React from 'react';

// Extended error type with stable toast ID
type ToastError = AppError & { _toastId: string };

export function useErrorHandler() {
  const [errors, setErrors] = useState<ToastError[]>([]);
  // FIXED: Removed errorStats state - it's unused (getters use global errorHandler)
  // If needed in future, expose errorHandler.getErrorStats() directly

  const addError = useCallback(
    (error: AppError, severity: ErrorSeverity = ErrorSeverity.MEDIUM, context?: string) => {
      // FIXED: Normalize timestamp to Date if it's a string
      const normalizedTimestamp = error.timestamp instanceof Date
        ? error.timestamp
        : typeof error.timestamp === 'string'
          ? new Date(error.timestamp)
          : new Date();

      // FIXED: Create stable toast ID to prevent key collisions and remounting
      const toastId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // FIXED: Improved duplicate detection with time window and stable key
      // Includes context in key for better deduplication
      const errorKey = `${error.code}:${error.message}:${context ?? ''}`;
      
      setErrors(prev => {
        // Check for duplicate within last 5 seconds (configurable)
        const DEDUP_WINDOW_MS = 5000;
        const now = Date.now();
        const isDuplicate = prev.some(existingError => {
          const existingKey = `${existingError.code}:${existingError.message}:${existingError.context?.toString() ?? ''}`;
          const timeDiff = existingError.timestamp instanceof Date
            ? now - existingError.timestamp.getTime()
            : 0;
          return existingKey === errorKey && timeDiff < DEDUP_WINDOW_MS;
        });

        if (isDuplicate) return prev;

        return [...prev, { ...error, timestamp: normalizedTimestamp, _toastId: toastId }];
      });

      errorHandler.logError({ ...error, timestamp: normalizedTimestamp }, severity);
    },
    []
  );

  // FIXED: Remove by toast ID instead of index for stability
  const removeError = useCallback((toastId: string) => {
    setErrors(prev => prev.filter(err => err._toastId !== toastId));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
    errorHandler.clearErrorLogs();
  }, []);

  const handleError = useCallback(
    (
      error: unknown,
      context?: string,
      severity: ErrorSeverity = ErrorSeverity.MEDIUM,
      options?: { notify?: boolean }
    ) => {
      let appError: AppError;

      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        'message' in error &&
        'timestamp' in error
      ) {
        // Already an AppError - normalize timestamp
        const normalized = error as AppError;
        appError = {
          ...normalized,
          timestamp: normalized.timestamp instanceof Date
            ? normalized.timestamp
            : typeof normalized.timestamp === 'string'
              ? new Date(normalized.timestamp)
              : new Date(),
        };
      } else if (error && typeof error === 'object' && 'response' in error) {
        // API Error
        appError = errorHandler.handleNetworkError(error);
      } else if (error && typeof error === 'object' && 'code' in error) {
        // Supabase Error
        appError = errorHandler.handleSupabaseError(error, context);
      } else {
        // Generic Error
        appError = errorHandler.createError(
          ErrorCodes.UNKNOWN_ERROR,
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
          error instanceof Error ? error.stack : undefined,
          { context, originalError: error }
        );
      }

      // FIXED: Only notify user (toast) if notify option is true (default true for backward compat)
      const shouldNotify = options?.notify !== false;
      if (shouldNotify) {
        addError(appError, severity, context);
      }

      // Always log and capture for monitoring (even if not showing toast)
      errorHandler.logError(appError, severity);
      captureException(appError, context, {
        code: appError.code,
        context: appError.context,
        details: appError.details,
      }, severity);

      return appError;
    },
    [addError]
  );

  // Enhanced error handling with retry logic
  // FIXED: Only notify user on final failure to prevent duplicate toasts/logs
  const handleErrorWithRetry = useCallback(
    async (
      operation: () => Promise<unknown>,
      operationId: string,
      context?: string,
      maxRetries: number = 3
    ) => {
      let lastError: AppError | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await operation();
          // Clear retry attempts on success
          errorHandler.clearRetryAttempts(operationId);
          return result;
        } catch (error) {
          // FIXED: Only show toast/notify user on final failure (last attempt)
          // Still log all attempts for debugging, but don't spam user with toasts
          const isFinalAttempt = attempt === maxRetries;
          const appError = handleError(error, context, ErrorSeverity.MEDIUM, {
            notify: isFinalAttempt,
          });
          lastError = appError;

          if (!errorHandler.shouldRetry(appError, operationId)) {
            break;
          }

          errorHandler.recordRetryAttempt(operationId);

          // Don't delay after the last attempt (it already failed)
          if (attempt < maxRetries) {
            // Wait before retry (exponential backoff). 테스트 환경에서는 지연을 단축.
            // FIXED: Backoff uses attempt (0-indexed), so first retry has delay, second has 2x, etc.
            const base = process.env.NODE_ENV === 'test' ? 20 : 1000;
            const delay = Math.pow(2, attempt) * base;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      return { error: lastError };
    },
    [handleError]
  );

  // Get error statistics (from global errorHandler)
  const getErrorStats = useCallback(() => {
    return errorHandler.getErrorStats();
  }, []);

  // Get error count by type (from global errorHandler)
  const getErrorCount = useCallback((code: ErrorCodes) => {
    return errorHandler.getErrorCount(code);
  }, []);

  // Get recovery suggestions (from global errorHandler)
  const getRecoverySuggestions = useCallback((error: AppError) => {
    return errorHandler.getRecoverySuggestions(error);
  }, []);

  // FIXED: Removed ErrorToastsNode - it's redundant with ErrorToasts component
  // Component approach is preferred (better React DevTools integration, memoization support)
  // Returns a function component for better React compatibility
  const ErrorToasts = useCallback((): React.JSX.Element => {
    return React.createElement(
      'div',
      { className: 'fixed top-4 right-4 z-50 space-y-2' },
      errors.map((error) =>
        React.createElement(ErrorToast, {
          key: error._toastId, // FIXED: Use stable toast ID instead of timestamp/index
          error: error,
          onClose: () => removeError(error._toastId),
        })
      )
    );
  }, [errors, removeError]);

  return {
    errors,
    addError,
    removeError,
    clearErrors,
    handleError,
    handleErrorWithRetry,
    getErrorStats,
    getErrorCount,
    getRecoverySuggestions,
    ErrorToasts,
  };
}
