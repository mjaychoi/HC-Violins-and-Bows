'use client';

import React, { Component, ReactNode } from 'react';
import { AppError, ErrorCodes, ErrorSeverity } from '@/types/errors';
import { logError } from '@/utils/logger';
import { captureException } from '@/utils/monitoring';
import {
  getUserFriendlyErrorMessage,
  sanitizeError,
  isProduction,
} from '@/utils/errorSanitization';

interface ErrorBoundaryState {
  hasError: boolean;
  error: AppError | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  // ✅ FIXED: fallback 타입을 errorInfo?: React.ErrorInfo | null로 변경 (프로덕션 안전)
  fallback?: (error: AppError, errorInfo?: React.ErrorInfo | null) => ReactNode;
  onError?: (error: AppError, errorInfo?: React.ErrorInfo | null) => void;
  resetOnPropsChange?: boolean;
  resetKeys?: Array<string | number>;
}

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  // ✅ FIXED: resetTimeoutId 제거 (사용되지 않음)

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error: {
        code: ErrorCodes.UNKNOWN_ERROR,
        message: error.message,
        timestamp: new Date().toISOString(),
        context: { component: 'ErrorBoundary' },
      },
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 프로덕션 환경에서는 민감한 정보를 제거
    const sanitized = sanitizeError(error);
    const userMessage = getUserFriendlyErrorMessage(error);

    const appError: AppError = {
      code: ErrorCodes.UNKNOWN_ERROR,
      message: userMessage,
      details: isProduction() ? undefined : sanitized.details,
      timestamp: new Date().toISOString(),
      context: { component: 'ErrorBoundary' },
    };

    this.setState({
      error: appError,
      errorInfo: isProduction() ? null : errorInfo, // 프로덕션에서는 errorInfo 제거
    });

    // Call onError callback if provided
    if (this.props.onError) {
      this.props.onError(appError, errorInfo);
    }

    // Log error with structured logger (상세 정보는 로그에만 기록)
    logError('ErrorBoundary caught an error', error, 'ErrorBoundary', {
      componentStack: errorInfo.componentStack,
      errorMessage: error.message,
      errorStack: error.stack,
    });

    // Capture exception for monitoring (ErrorBoundary errors are always Critical)
    captureException(
      appError,
      'ErrorBoundary',
      {
        componentStack: errorInfo.componentStack,
        errorMessage: error.message,
        errorStack: error.stack,
      },
      ErrorSeverity.CRITICAL
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;

    if (hasError && resetOnPropsChange && resetKeys) {
      // ✅ FIXED: 배열 참조 비교 대신 값 비교로 변경
      const keysChanged =
        !prevProps.resetKeys ||
        prevProps.resetKeys.length !== resetKeys.length ||
        prevProps.resetKeys.some((key, index) => key !== resetKeys[index]);

      if (keysChanged) {
        this.resetErrorBoundary();
      }
    }
  }

  resetErrorBoundary = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      if (fallback) {
        // ✅ FIXED: null-safe 처리 (프로덕션에서 errorInfo가 null일 수 있음)
        return fallback(error, errorInfo ?? null);
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            <div className="flex items-center mb-4">
              <div className="shrink-0">
                <svg
                  className="h-8 w-8 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">
                  Something went wrong
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  An unexpected error occurred. Please try again.
                </p>
              </div>
            </div>

            {!isProduction() && errorInfo && (
              <details className="mt-4">
                <summary className="text-sm font-medium text-gray-700 cursor-pointer">
                  Error Details (Development Only)
                </summary>
                <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono text-gray-600 overflow-auto max-h-40">
                  <div>
                    <strong>Error:</strong> {error.message}
                  </div>
                  {error.details && (
                    <>
                      <div>
                        <strong>Stack:</strong>
                      </div>
                      <pre className="whitespace-pre-wrap">{error.details}</pre>
                    </>
                  )}
                  <div>
                    <strong>Component Stack:</strong>
                  </div>
                  <pre className="whitespace-pre-wrap">
                    {errorInfo.componentStack}
                  </pre>
                </div>
              </details>
            )}

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={this.resetErrorBoundary}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

// HOC for easier usage
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}

// ✅ FIXED: Hook for error boundary context - throw를 렌더에서 바로
export function useErrorBoundary() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const captureError = React.useCallback((e: unknown) => {
    setError(e instanceof Error ? e : new Error(String(e)));
  }, []);

  // ✅ FIXED: 렌더에서 throw (정석 패턴)
  if (error) {
    throw error; // render phase throw
  }

  return { captureError, resetError };
}
