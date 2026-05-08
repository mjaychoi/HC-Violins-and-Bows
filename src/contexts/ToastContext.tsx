'use client';

import React, {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppError, ErrorCodes, ErrorSeverity } from '@/types/errors';
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
import ErrorToast from '@/components/ErrorToast';
import SuccessToastsComponent from '@/components/common/feedback/SuccessToasts';

export type { ToastError, Toast, ToastLink };

type RetryResult = {
  error: AppError | null;
  data?: unknown;
  attempts?: number;
};

interface ToastContextValue {
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

  toasts: Toast[];
  showSuccess: (message: string, links?: ToastLink[]) => void;
  showWarning: (message: string, links?: ToastLink[]) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const defaultWindowAccessor = () => typeof window !== 'undefined';
let testWindowAccessor: (() => boolean) | null = null;

const noop = () => undefined;

const SSR_FALLBACK_CONTEXT: ToastContextValue = {
  errors: [],
  addError: noop,
  removeError: noop,
  clearErrors: noop,
  handleError: () => ({
    code: ErrorCodes.UNKNOWN_ERROR,
    message: 'Error handler not available',
    timestamp: new Date().toISOString(),
  }),
  handleErrorWithRetry: async () => ({
    error: null,
    data: undefined,
    attempts: 0,
  }),
  getErrorStats: () => new Map(),
  getErrorCount: () => 0,
  getRecoverySuggestions: () => [],
  toasts: [],
  showSuccess: noop,
  showWarning: noop,
  removeToast: noop,
};

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

function ToastContextWrapper({
  children,
  disableHost = false,
}: {
  children: ReactNode;
  disableHost?: boolean;
}) {
  const errorContext = useErrorContext();
  const successToastContext = useSuccessToastContext();

  const value = useMemo<ToastContextValue>(
    () => ({
      errors: errorContext.errors,
      addError: errorContext.addError,
      removeError: errorContext.removeError,
      clearErrors: errorContext.clearErrors,
      handleError: errorContext.handleError,
      handleErrorWithRetry: errorContext.handleErrorWithRetry,
      getErrorStats: errorContext.getErrorStats,
      getErrorCount: errorContext.getErrorCount,
      getRecoverySuggestions: errorContext.getRecoverySuggestions,

      toasts: successToastContext.toasts,
      showSuccess: successToastContext.showSuccess,
      showWarning: successToastContext.showWarning,
      removeToast: successToastContext.removeToast,
    }),
    [
      errorContext.errors,
      errorContext.addError,
      errorContext.removeError,
      errorContext.clearErrors,
      errorContext.handleError,
      errorContext.handleErrorWithRetry,
      errorContext.getErrorStats,
      errorContext.getErrorCount,
      errorContext.getRecoverySuggestions,
      successToastContext.toasts,
      successToastContext.showSuccess,
      successToastContext.showWarning,
      successToastContext.removeToast,
    ]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {!disableHost && <ToastHost />}
    </ToastContext.Provider>
  );
}

function ToastHost() {
  const [mounted, setMounted] = useState(false);
  const { errors, removeError } = useErrorContext();
  const { toasts, removeToast } = useSuccessToastContext();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <>
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

      {toasts.length > 0 && (
        <SuccessToastsComponent toasts={toasts} onRemove={removeToast} />
      )}
    </>
  );
}

export function canAccessWindow() {
  return testWindowAccessor?.() ?? defaultWindowAccessor();
}

export function useToastContext() {
  const context = useContext(ToastContext);

  if (!context) {
    if (!canAccessWindow()) {
      return SSR_FALLBACK_CONTEXT;
    }

    throw new Error('useToastContext must be used within ToastProvider');
  }

  return context;
}

export function __setWindowAccessorForTesting(accessor: () => boolean) {
  testWindowAccessor = accessor;
}

export function __resetWindowAccessorForTesting() {
  testWindowAccessor = null;
}

export function useErrorHandler() {
  const errorContext = useErrorContext();

  return useMemo(
    () => ({
      errors: errorContext.errors,
      addError: errorContext.addError,
      removeError: errorContext.removeError,
      clearErrors: errorContext.clearErrors,
      handleError: errorContext.handleError,
      handleErrorWithRetry: errorContext.handleErrorWithRetry,
      getErrorStats: errorContext.getErrorStats,
      getErrorCount: errorContext.getErrorCount,
      getRecoverySuggestions: errorContext.getRecoverySuggestions,
      ErrorToasts: () => null,
    }),
    [
      errorContext.errors,
      errorContext.addError,
      errorContext.removeError,
      errorContext.clearErrors,
      errorContext.handleError,
      errorContext.handleErrorWithRetry,
      errorContext.getErrorStats,
      errorContext.getErrorCount,
      errorContext.getRecoverySuggestions,
    ]
  );
}

export function useToast() {
  const successToastContext = useSuccessToastContext();

  return useMemo(
    () => ({
      toasts: successToastContext.toasts,
      showSuccess: successToastContext.showSuccess,
      showWarning: successToastContext.showWarning,
      removeToast: successToastContext.removeToast,
      SuccessToasts: () => null,
    }),
    [
      successToastContext.toasts,
      successToastContext.showSuccess,
      successToastContext.showWarning,
      successToastContext.removeToast,
    ]
  );
}
