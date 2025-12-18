'use client';

import React, {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useState,
} from 'react';
import { AppError, ErrorCodes, ErrorSeverity } from '@/types/errors';
// ✅ FIXED: Context 세분화 - ErrorContext와 SuccessToastContext 사용
import {
  ErrorProvider,
  useErrorContext,
  type ToastError,
} from './ErrorContext';
import {
  SuccessToastProvider,
  useSuccessToastContext,
  type Toast,
  type ToastLink,
} from './SuccessToastContext';
// ✅ FIXED: ToastHost에서만 사용 (disableHost일 때는 렌더링되지 않음)
import ErrorToast from '@/components/ErrorToast';
import SuccessToastsComponent from '@/components/common/feedback/SuccessToasts';

// Re-export types for backward compatibility
export type { ToastError, Toast, ToastLink };

let windowAccessor = () => typeof window !== 'undefined';

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
  showSuccess: (message: string, links?: ToastLink[]) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/**
 * ✅ FIXED: Context 세분화 - ErrorProvider와 SuccessToastProvider를 조합
 * 하위 호환성을 위해 기존 ToastContext API 유지
 */
export function ToastProvider({
  children,
  disableHost = false,
}: {
  children: ReactNode;
  disableHost?: boolean;
}) {
  return (
    <ErrorProvider>
      <SuccessToastProvider>
        <ToastContextWrapper disableHost={disableHost}>
          {children}
        </ToastContextWrapper>
      </SuccessToastProvider>
    </ErrorProvider>
  );
}

/**
 * ToastContext의 실제 구현 - 두 Context를 조합하여 기존 API 제공
 */
function ToastContextWrapper({
  children,
  disableHost = false,
}: {
  children: ReactNode;
  disableHost?: boolean;
}) {
  const errorContext = useErrorContext();
  const successToastContext = useSuccessToastContext();

  const value: ToastContextValue = {
    // Error handling
    errors: errorContext.errors,
    addError: errorContext.addError,
    removeError: errorContext.removeError,
    clearErrors: errorContext.clearErrors,
    handleError: errorContext.handleError,
    handleErrorWithRetry: errorContext.handleErrorWithRetry,
    getErrorStats: errorContext.getErrorStats,
    getErrorCount: errorContext.getErrorCount,
    getRecoverySuggestions: errorContext.getRecoverySuggestions,
    // Success toasts
    toasts: successToastContext.toasts,
    showSuccess: successToastContext.showSuccess,
    removeToast: successToastContext.removeToast,
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
// ✅ FIXED: Context 세분화 - ErrorContext와 SuccessToastContext 직접 사용
function ToastHost() {
  const [mounted, setMounted] = useState(false);
  const { errors, removeError } = useErrorContext();
  const { toasts, removeToast } = useSuccessToastContext();

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

export function canAccessWindow() {
  return windowAccessor();
}

export function useToastContext() {
  const context = useContext(ToastContext);
  // ✅ FIXED: SSR 안전 - 빌드 시점에 Context가 없을 수 있음
  // ✅ FIXED: React Hooks 규칙 준수 - 조건부 로직을 hook 호출 후로 이동
  if (!context) {
    // SSR/빌드 시점에는 기본값 반환 (런타임에서는 항상 Provider 내부)
    const isSSR = !canAccessWindow();
    if (isSSR) {
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

export function __setWindowAccessorForTesting(accessor: () => boolean) {
  windowAccessor = accessor;
}

export function __resetWindowAccessorForTesting() {
  windowAccessor = () => typeof window !== 'undefined';
}

// Backward compatibility hooks - 기존 코드와의 호환성을 위해 유지
// ✅ FIXED: Context 세분화 - 직접 ErrorContext와 SuccessToastContext 사용
export function useErrorHandler() {
  // ToastProvider는 ErrorProvider를 포함하므로 useErrorContext 사용
  // React Hooks 규칙 준수를 위해 직접 호출
  const errorContext = useErrorContext();
  return {
    errors: errorContext.errors,
    addError: errorContext.addError,
    removeError: errorContext.removeError,
    clearErrors: errorContext.clearErrors,
    handleError: errorContext.handleError,
    handleErrorWithRetry: errorContext.handleErrorWithRetry,
    getErrorStats: errorContext.getErrorStats,
    getErrorCount: errorContext.getErrorCount,
    getRecoverySuggestions: errorContext.getRecoverySuggestions,
    ErrorToasts: () => null, // ✅ FIXED: 더 이상 사용하지 않음 (ToastHost가 자동 렌더링)
  };
}

export function useToast() {
  // ToastProvider는 SuccessToastProvider를 포함하므로 useSuccessToastContext 사용
  // React Hooks 규칙 준수를 위해 직접 호출
  const successToastContext = useSuccessToastContext();
  return {
    toasts: successToastContext.toasts,
    showSuccess: successToastContext.showSuccess,
    removeToast: successToastContext.removeToast,
    SuccessToasts: () => null, // ✅ FIXED: 더 이상 사용하지 않음 (ToastHost가 자동 렌더링)
  };
}
