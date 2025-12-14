'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
} from 'react';
import { AppError, ErrorCodes, ErrorSeverity } from '@/types/errors';
import { errorHandler } from '@/utils/errorHandler';
import { captureException } from '@/utils/monitoring';
// ✅ FIXED: ToastHost에서만 사용 (disableHost일 때는 렌더링되지 않음)
// jest.setup.js에서 mock되지만, disableHost일 때는 사용되지 않음
import ErrorToast from '@/components/ErrorToast';
import SuccessToastsComponent from '@/components/common/SuccessToasts';

// Extended error type with stable toast ID and dedup metadata
type ToastError = AppError & {
  _toastId: string;
  _dedupKey: string;
  _createdAt: number;
};

interface Toast {
  id: string;
  message: string;
  timestamp: Date;
}

interface ToastContextValue {
  // Error handling
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

  // Success toasts
  toasts: Toast[];
  showSuccess: (message: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({
  children,
  disableHost = false,
}: {
  children: ReactNode;
  disableHost?: boolean;
}) {
  const [errors, setErrors] = useState<ToastError[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Error handling
  const addError = useCallback(
    (
      error: AppError,
      severity: ErrorSeverity = ErrorSeverity.MEDIUM, // ✅ FIXED: severity는 사용하지 않지만 타입 호환성을 위해 유지
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

  // Success toasts
  const showSuccess = useCallback((message: string) => {
    const toast: Toast = {
      id: `${Date.now()}-${Math.random()}`,
      message,
      timestamp: new Date(),
    };
    setToasts(prev => [...prev, toast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const value: ToastContextValue = {
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
    toasts,
    showSuccess,
    removeToast,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* ToastHost 렌더링 - 테스트에서는 disableHost로 끌 수 있음 */}
      {!disableHost && <ToastHost />}
    </ToastContext.Provider>
  );
}

// ✅ FIXED: ToastHost를 ToastProvider 내부에서만 렌더링 (SSR 안전)
function ToastHost() {
  const [mounted, setMounted] = useState(false);
  const { errors, removeError, toasts, removeToast } = useToastContext();

  // ✅ FIXED: 클라이언트에서만 마운트 (SSR 안전)
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <>
      {/* Error Toasts */}
      {errors.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {errors.map(error => (
            <ErrorToast
              key={error._toastId}
              error={error}
              onClose={() => removeError(error._toastId)}
            />
          ))}
        </div>
      )}

      {/* Success Toasts */}
      {toasts.length > 0 && (
        <SuccessToastsComponent toasts={toasts} onRemove={removeToast} />
      )}
    </>
  );
}

export function useToastContext() {
  const context = useContext(ToastContext);
  // ✅ FIXED: SSR 안전 - 빌드 시점에 Context가 없을 수 있음
  if (!context) {
    // SSR/빌드 시점에는 기본값 반환 (런타임에서는 항상 Provider 내부)
    if (typeof window === 'undefined') {
      // SSR에서는 빈 컨텍스트 반환 (ToastHost가 mounted 체크로 처리)
      return {
        errors: [],
        addError: () => {},
        removeError: () => {},
        clearErrors: () => {},
        handleError: () => ({
          code: ErrorCodes.UNKNOWN_ERROR,
          message: 'Error handler not available',
          timestamp: new Date().toISOString(),
        }),
        handleErrorWithRetry: async () => ({ error: null, data: undefined }),
        getErrorStats: () => new Map(),
        getErrorCount: () => 0,
        getRecoverySuggestions: () => [],
        toasts: [],
        showSuccess: () => {},
        removeToast: () => {},
      } as ToastContextValue;
    }
    throw new Error('useToastContext must be used within ToastProvider');
  }
  return context;
}

// Backward compatibility hooks - 기존 코드와의 호환성을 위해 유지
export function useErrorHandler() {
  const context = useToastContext();
  return {
    errors: context.errors,
    addError: context.addError,
    removeError: context.removeError,
    clearErrors: context.clearErrors,
    handleError: context.handleError,
    handleErrorWithRetry: context.handleErrorWithRetry,
    getErrorStats: context.getErrorStats,
    getErrorCount: context.getErrorCount,
    getRecoverySuggestions: context.getRecoverySuggestions,
    ErrorToasts: () => null, // ✅ FIXED: 더 이상 사용하지 않음 (ToastHost가 자동 렌더링)
  };
}

export function useToast() {
  const context = useToastContext();
  return {
    toasts: context.toasts,
    showSuccess: context.showSuccess,
    removeToast: context.removeToast,
    SuccessToasts: () => null, // ✅ FIXED: 더 이상 사용하지 않음 (ToastHost가 자동 렌더링)
  };
}
