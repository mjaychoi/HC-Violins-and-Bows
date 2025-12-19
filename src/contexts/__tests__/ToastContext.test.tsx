import React from 'react';
import { renderHook, act } from '@/test-utils/render';
import * as ToastContextModule from '../ToastContext';

const { ToastProvider, useToastContext, useErrorHandler, useToast } =
  ToastContextModule;
import { ErrorCodes, ErrorSeverity } from '@/types/errors';
import { errorHandler } from '@/utils/errorHandler';
import { captureException } from '@/utils/monitoring';

jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    handleNetworkError: jest.fn(),
    handleSupabaseError: jest.fn(),
    createError: jest.fn(),
    logError: jest.fn(),
    shouldRetry: jest.fn().mockReturnValue(false),
    recordRetryAttempt: jest.fn(),
    clearRetryAttempts: jest.fn(),
    clearErrorLogs: jest.fn(),
    getErrorStats: jest.fn(() => new Map()),
    getErrorCount: jest.fn(() => 0),
    getRecoverySuggestions: jest.fn(() => []),
  },
}));

jest.mock('@/utils/monitoring', () => ({
  captureException: jest.fn(),
}));

describe('ToastContext', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ToastProvider disableHost>{children}</ToastProvider>
  );

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws on client when used outside of ToastProvider', () => {
    const ClientWrapper = ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    );

    // 클라이언트 환경 시뮬레이션
    ToastContextModule.__setWindowAccessorForTesting(() => true);

    try {
      // Provider 없이 훅을 사용하면 에러가 발생해야 함
      expect(() =>
        renderHook(() => useToastContext(), { wrapper: ClientWrapper })
      ).toThrow('useToastContext must be used within ToastProvider');
    } finally {
      ToastContextModule.__resetWindowAccessorForTesting();
    }
  });

  it('provides default values and allows adding/removing errors', () => {
    const { result } = renderHook(() => useToastContext(), { wrapper });

    expect(result.current.errors).toEqual([]);

    act(() => {
      result.current.addError({
        code: ErrorCodes.UNKNOWN_ERROR,
        message: 'Test error',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.errors.length).toBe(1);

    const toastId = result.current.errors[0]._toastId;

    act(() => {
      result.current.removeError(toastId);
    });

    expect(result.current.errors.length).toBe(0);
  });

  it('deduplicates identical errors within the dedup window', () => {
    const { result } = renderHook(() => useToastContext(), { wrapper });

    const error = {
      code: ErrorCodes.UNKNOWN_ERROR,
      message: 'Same error',
      timestamp: new Date().toISOString(),
    };

    act(() => {
      result.current.addError(error);
      result.current.addError(error);
    });

    expect(result.current.errors.length).toBe(1);
  });

  it('handleError wraps unknown error and logs it', () => {
    const { result } = renderHook(() => useToastContext(), { wrapper });
    const unknownError = new Error('Something went wrong');

    (errorHandler.createError as jest.Mock).mockReturnValue({
      code: ErrorCodes.UNKNOWN_ERROR,
      message: 'Wrapped error',
      timestamp: new Date().toISOString(),
    });

    act(() => {
      result.current.handleError(
        unknownError,
        'TestContext',
        ErrorSeverity.HIGH
      );
    });

    expect(errorHandler.createError).toHaveBeenCalled();
    expect(errorHandler.logError).toHaveBeenCalled();
    expect(captureException).toHaveBeenCalled();
    expect(result.current.errors.length).toBe(1);
  });

  it('clearErrors removes all errors and clears error logs', () => {
    const { result } = renderHook(() => useToastContext(), { wrapper });

    act(() => {
      result.current.addError({
        code: ErrorCodes.UNKNOWN_ERROR,
        message: 'Error to clear',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.errors.length).toBe(1);

    act(() => {
      result.current.clearErrors();
    });

    expect(result.current.errors.length).toBe(0);
    expect(errorHandler.clearErrorLogs).toHaveBeenCalled();
  });

  it('showSuccess adds and removeToast removes success toasts', () => {
    const { result } = renderHook(() => useToastContext(), { wrapper });

    act(() => {
      result.current.showSuccess('Success message');
    });

    expect(result.current.toasts.length).toBe(1);
    const toastId = result.current.toasts[0].id;

    act(() => {
      result.current.removeToast(toastId);
    });

    expect(result.current.toasts.length).toBe(0);
  });

  it('handleError uses network error handler when response is present', () => {
    const { result } = renderHook(() => useToastContext(), { wrapper });
    const networkError = { response: { status: 500 } };

    (errorHandler.handleNetworkError as jest.Mock).mockReturnValue({
      code: ErrorCodes.UNKNOWN_ERROR,
      message: 'Network wrapped',
      timestamp: new Date().toISOString(),
    });

    act(() => {
      result.current.handleError(networkError, 'NetworkContext');
    });

    expect(errorHandler.handleNetworkError).toHaveBeenCalledWith(networkError);
    expect(errorHandler.logError).toHaveBeenCalled();
    expect(captureException).toHaveBeenCalled();
  });

  it('handleError uses Supabase error handler when code field exists', () => {
    const { result } = renderHook(() => useToastContext(), { wrapper });
    const supabaseError = { code: 'PGRST_ERROR' };

    (errorHandler.handleSupabaseError as jest.Mock).mockReturnValue({
      code: ErrorCodes.UNKNOWN_ERROR,
      message: 'Supabase wrapped',
      timestamp: new Date().toISOString(),
    });

    act(() => {
      result.current.handleError(supabaseError, 'SupabaseContext');
    });

    expect(errorHandler.handleSupabaseError).toHaveBeenCalledWith(
      supabaseError,
      'SupabaseContext'
    );
    expect(errorHandler.logError).toHaveBeenCalled();
    expect(captureException).toHaveBeenCalled();
  });

  it('handleError does not notify when options.notify is false', () => {
    const { result } = renderHook(() => useToastContext(), { wrapper });

    const appError = {
      code: ErrorCodes.UNKNOWN_ERROR,
      message: 'Already wrapped',
      timestamp: new Date().toISOString(),
    };

    act(() => {
      result.current.handleError(appError, 'SilentContext', undefined, {
        notify: false,
      });
    });

    expect(result.current.errors.length).toBe(0);
    expect(errorHandler.logError).toHaveBeenCalled();
    expect(captureException).toHaveBeenCalled();
  });

  it('getRecoverySuggestions delegates to errorHandler', () => {
    const { result } = renderHook(() => useToastContext(), { wrapper });

    const appError = {
      code: ErrorCodes.UNKNOWN_ERROR,
      message: 'Need suggestions',
      timestamp: new Date().toISOString(),
    };

    (errorHandler.getRecoverySuggestions as jest.Mock).mockReturnValue([
      'Try again',
    ]);

    const suggestions = result.current.getRecoverySuggestions(
      appError as never
    );

    expect(errorHandler.getRecoverySuggestions).toHaveBeenCalledWith(appError);
    expect(suggestions).toEqual(['Try again']);
  });

  it('useErrorHandler exposes handleError and stats helpers', () => {
    const { result } = renderHook(() => useErrorHandler(), { wrapper });

    act(() => {
      result.current.handleError(new Error('Test'));
    });

    expect(errorHandler.logError).toHaveBeenCalled();
    expect(result.current.getErrorStats()).toBeInstanceOf(Map);
    expect(result.current.getErrorCount(ErrorCodes.UNKNOWN_ERROR)).toBe(0);
  });

  it('handleErrorWithRetry returns success result and clears retry attempts', async () => {
    const { result } = renderHook(() => useToastContext(), { wrapper });

    const operation = jest.fn().mockResolvedValue('success');

    const resultValue = await result.current.handleErrorWithRetry(
      operation,
      'op-id-success',
      'SuccessContext',
      1
    );

    expect(operation).toHaveBeenCalledTimes(1);
    expect(errorHandler.clearRetryAttempts).toHaveBeenCalledWith(
      'op-id-success'
    );
    expect(resultValue).toEqual({ error: null, data: 'success' });
  });

  it('handleErrorWithRetry returns error when operation fails without retries', async () => {
    const { result } = renderHook(() => useToastContext(), { wrapper });

    const failingOperation = jest.fn().mockRejectedValue(new Error('Failure'));

    const resultValue = await result.current.handleErrorWithRetry(
      failingOperation,
      'op-id-fail',
      'FailContext',
      0
    );

    expect(failingOperation).toHaveBeenCalledTimes(1);
    expect(resultValue.error).not.toBeNull();
    expect(resultValue.data).toBeUndefined();
  });

  it('useToast exposes toasts and showSuccess', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.showSuccess('Toast from hook');
    });

    expect(result.current.toasts.length).toBe(1);
  });

  it('uses safe defaults on server (SSR) instead of throwing', () => {
    const SSRWrapper = ({ children }: { children: React.ReactNode }) => (
      <ToastContextFallback>{children}</ToastContextFallback>
    );

    function ToastContextFallback({ children }: { children: React.ReactNode }) {
      return <>{children}</>;
    }

    ToastContextModule.__setWindowAccessorForTesting(() => false);

    try {
      const { result } = renderHook(() => useToastContext(), {
        wrapper: SSRWrapper,
      });

      expect(result.current.errors).toEqual([]);
      expect(typeof result.current.showSuccess).toBe('function');
    } finally {
      ToastContextModule.__resetWindowAccessorForTesting();
    }
  });
});
