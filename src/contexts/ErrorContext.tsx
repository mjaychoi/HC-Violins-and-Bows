'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { AppError, ErrorCodes, ErrorSeverity } from '@/types/errors';
import { errorHandler } from '@/utils/errorHandler';
import { captureException } from '@/utils/monitoring';

// Extended error type with stable toast ID and dedup metadata
export type ToastError = AppError & {
  _toastId: string;
  _dedupKey: string;
  _createdAt: number;
};

interface ErrorContextValue {
  errors: ToastError[];
  addError: (
    error: AppError,
    severity?: ErrorSeverity,
    context?: string
  ) => void;
  removeError: (toastId: string) => void;
  clearErrors: () => void;
  handleError: (
    error: unknown,
    context?: string,
    severity?: ErrorSeverity,
    options?: { notify?: boolean }
  ) => AppError;
  handleErrorWithRetry: (
    operation: () => Promise<unknown>,
    operationId: string,
    context?: string,
    maxRetries?: number
  ) => Promise<{ error: AppError | null; data?: unknown }>;
  getErrorStats: () => Map<ErrorCodes, number>;
  getErrorCount: (code: ErrorCodes) => number;
  getRecoverySuggestions: (error: AppError) => string[];
}

const ErrorContext = createContext<ErrorContextValue | undefined>(undefined);

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [errors, setErrors] = useState<ToastError[]>([]);

  // Error handling
  const addError = useCallback(
    (
      error: AppError,
      severity: ErrorSeverity = ErrorSeverity.MEDIUM,
      context?: string
    ) => {
      // severity는 로깅에서만 사용 (handleError에서 처리)
      void severity;
      const toastId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const dedupKey = `${error.code}:${error.message}:${context ?? ''}`;
      const createdAt = Date.now();

      setErrors(prev => {
        const DEDUP_WINDOW_MS = 5000;
        const isDuplicate = prev.some(existingError => {
          const timeDiff = createdAt - existingError._createdAt;
          return (
            existingError._dedupKey === dedupKey && timeDiff < DEDUP_WINDOW_MS
          );
        });

        if (isDuplicate) return prev;

        return [
          ...prev,
          {
            ...error,
            _toastId: toastId,
            _dedupKey: dedupKey,
            _createdAt: createdAt,
          },
        ];
      });
    },
    []
  );

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
        appError = error as AppError;
      } else if (error && typeof error === 'object' && 'response' in error) {
        appError = errorHandler.handleNetworkError(error);
      } else if (error && typeof error === 'object' && 'code' in error) {
        appError = errorHandler.handleSupabaseError(error, context);
      } else {
        appError = errorHandler.createError(
          ErrorCodes.UNKNOWN_ERROR,
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
          error instanceof Error ? error.stack : undefined,
          { context, originalError: error }
        );
      }

      // 로깅/모니터링은 handleError에서만
      errorHandler.logError(appError, severity);
      captureException(
        appError,
        context,
        {
          code: appError.code,
          context: appError.context,
          details: appError.details,
        },
        severity
      );

      const shouldNotify = options?.notify !== false;
      if (shouldNotify) {
        addError(appError, severity, context);
      }

      return appError;
    },
    [addError]
  );

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
          errorHandler.clearRetryAttempts(operationId);
          return { error: null, data: result };
        } catch (error) {
          const isFinalAttempt = attempt === maxRetries;
          const appError = handleError(error, context, ErrorSeverity.MEDIUM, {
            notify: isFinalAttempt,
          });
          lastError = appError;

          if (!errorHandler.shouldRetry(appError, operationId)) {
            break;
          }

          errorHandler.recordRetryAttempt(operationId);

          if (attempt < maxRetries) {
            const base = process.env.NODE_ENV === 'test' ? 20 : 1000;
            const delay = Math.pow(2, attempt) * base;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      return { error: lastError, data: undefined };
    },
    [handleError]
  );

  const value: ErrorContextValue = {
    errors,
    addError,
    removeError,
    clearErrors,
    handleError,
    handleErrorWithRetry,
    getErrorStats: () => errorHandler.getErrorStats(),
    getErrorCount: (code: ErrorCodes) => errorHandler.getErrorCount(code),
    getRecoverySuggestions: (error: AppError) =>
      errorHandler.getRecoverySuggestions(error),
  };

  return (
    <ErrorContext.Provider value={value}>{children}</ErrorContext.Provider>
  );
}

export function useErrorContext() {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useErrorContext must be used within ErrorProvider');
  }
  return context;
}
