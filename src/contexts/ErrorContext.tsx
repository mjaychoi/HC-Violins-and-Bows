'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { AppError, ErrorCodes, ErrorSeverity } from '@/types/errors';
import { errorHandler } from '@/utils/errorHandler';
import { captureException } from '@/utils/monitoring';

export type ToastError = AppError & {
  _toastId: string;
  _dedupKey: string;
  _createdAt: number;
};

type RetryResult = {
  error: AppError | null;
  data?: unknown;
  attempts?: number;
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
  ) => Promise<RetryResult>;
  getErrorStats: () => Map<ErrorCodes, number>;
  getErrorCount: (code: ErrorCodes) => number;
  getRecoverySuggestions: (error: AppError) => string[];
}

const ErrorContext = createContext<ErrorContextValue | undefined>(undefined);

const DEDUP_WINDOW_MS = 5000;

function createToastId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function createDedupKey(error: AppError, context?: string): string {
  return `${error.code}:${error.message}:${context ?? ''}`;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [errors, setErrors] = useState<ToastError[]>([]);

  const mountedRef = useRef(true);
  const recentErrorMapRef = useRef(new Map<string, number>());

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const pruneRecentErrors = useCallback((now: number) => {
    for (const [key, timestamp] of recentErrorMapRef.current.entries()) {
      if (now - timestamp >= DEDUP_WINDOW_MS) {
        recentErrorMapRef.current.delete(key);
      }
    }
  }, []);

  const addError = useCallback(
    (
      error: AppError,
      severity: ErrorSeverity = ErrorSeverity.MEDIUM,
      context?: string
    ) => {
      void severity;

      if (!mountedRef.current) return;

      const createdAt = Date.now();
      const dedupKey = createDedupKey(error, context);

      pruneRecentErrors(createdAt);

      const previousCreatedAt = recentErrorMapRef.current.get(dedupKey);

      if (
        previousCreatedAt !== undefined &&
        createdAt - previousCreatedAt < DEDUP_WINDOW_MS
      ) {
        return;
      }

      recentErrorMapRef.current.set(dedupKey, createdAt);

      const toastId = createToastId();

      setErrors(prev => [
        ...prev,
        {
          ...error,
          _toastId: toastId,
          _dedupKey: dedupKey,
          _createdAt: createdAt,
        },
      ]);
    },
    [pruneRecentErrors]
  );

  const removeError = useCallback((toastId: string) => {
    setErrors(prev => prev.filter(err => err._toastId !== toastId));
  }, []);

  const clearErrors = useCallback(() => {
    recentErrorMapRef.current.clear();
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
      const appError = errorHandler.normalizeError(error, context);

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

      if (options?.notify !== false) {
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
    ): Promise<RetryResult> => {
      let lastError: AppError | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        if (!mountedRef.current) {
          return {
            error: lastError,
            data: undefined,
          };
        }

        try {
          const result = await operation();

          errorHandler.clearRetryAttempts(operationId);

          return {
            error: null,
            data: result,
          };
        } catch (error) {
          const isFinalAttempt = attempt === maxRetries;

          const appError = handleError(error, context, ErrorSeverity.MEDIUM, {
            notify: isFinalAttempt,
          });

          lastError = appError;

          if (!mountedRef.current) {
            return {
              error: lastError,
              data: undefined,
            };
          }

          if (!errorHandler.shouldRetry(appError, operationId)) {
            break;
          }

          errorHandler.recordRetryAttempt(operationId);

          if (attempt < maxRetries) {
            const baseDelay = process.env.NODE_ENV === 'test' ? 20 : 1000;
            const retryDelay = Math.pow(2, attempt) * baseDelay;

            await delay(retryDelay);
          }
        }
      }

      return {
        error: lastError,
        data: undefined,
      };
    },
    [handleError]
  );

  const getErrorStats = useCallback(() => {
    return errorHandler.getErrorStats();
  }, []);

  const getErrorCount = useCallback((code: ErrorCodes) => {
    return errorHandler.getErrorCount(code);
  }, []);

  const getRecoverySuggestions = useCallback((error: AppError) => {
    return errorHandler.getRecoverySuggestions(error);
  }, []);

  const value = useMemo<ErrorContextValue>(
    () => ({
      errors,
      addError,
      removeError,
      clearErrors,
      handleError,
      handleErrorWithRetry,
      getErrorStats,
      getErrorCount,
      getRecoverySuggestions,
    }),
    [
      errors,
      addError,
      removeError,
      clearErrors,
      handleError,
      handleErrorWithRetry,
      getErrorStats,
      getErrorCount,
      getRecoverySuggestions,
    ]
  );

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
