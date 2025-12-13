// src/hooks/__tests__/useErrorHandler.test.tsx
import { renderHook, act } from '@testing-library/react';
import { useErrorHandler } from '../useErrorHandler';
import { ErrorCodes, ErrorSeverity } from '@/types/errors';

// Mock the errorHandler
jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    logError: jest.fn(),
    clearErrorLogs: jest.fn(),
    getErrorStats: jest.fn(() => new Map()),
    getErrorCount: jest.fn(() => 0),
    getRecoverySuggestions: jest.fn(() => ['Test suggestion']),
    shouldRetry: jest.fn(() => true),
    recordRetryAttempt: jest.fn(),
    clearRetryAttempts: jest.fn(),
    getUserFriendlyMessage: jest.fn(() => 'Test error message'),
    createError: jest.fn((code, message, stack, context) => ({
      code,
      message,
      timestamp: new Date(),
      context,
    })),
    handleNetworkError: jest.fn(() => ({
      code: 'NETWORK_ERROR' as any,
      message: 'Network error',
      timestamp: new Date(),
    })),
    handleSupabaseError: jest.fn(() => ({
      code: 'DATABASE_ERROR' as any,
      message: 'Database error',
      timestamp: new Date(),
    })),
  },
}));

describe('useErrorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with empty errors', () => {
    const { result } = renderHook(() => useErrorHandler());

    expect(result.current.errors).toEqual([]);
    // FIXED: errorStats is no longer in state (removed, getters use global errorHandler)
  });

  it('should add error correctly', () => {
    const { result } = renderHook(() => useErrorHandler());
    const mockError = {
      code: ErrorCodes.NETWORK_ERROR,
      message: 'Network failed',
      timestamp: new Date(),
      context: { endpoint: '/api/test' },
    };

    act(() => {
      result.current.addError(mockError);
    });

    expect(result.current.errors).toHaveLength(1);
    // FIXED: errors now include _toastId, so we check code/message instead
    expect(result.current.errors[0].code).toBe(mockError.code);
    expect(result.current.errors[0].message).toBe(mockError.message);
    expect(result.current.errors[0]._toastId).toBeDefined();
  });

  it('should remove error by toast ID', () => {
    const { result } = renderHook(() => useErrorHandler());
    const mockError1 = {
      code: ErrorCodes.NETWORK_ERROR,
      message: 'Network failed 1',
      timestamp: new Date(),
    };
    const mockError2 = {
      code: ErrorCodes.NETWORK_ERROR,
      message: 'Network failed 2',
      timestamp: new Date(),
    };

    act(() => {
      result.current.addError(mockError1);
      result.current.addError(mockError2);
    });

    expect(result.current.errors).toHaveLength(2);

    // FIXED: removeError now takes toast ID instead of index
    const firstToastId = result.current.errors[0]._toastId;
    act(() => {
      result.current.removeError(firstToastId);
    });

    expect(result.current.errors).toHaveLength(1);
    expect(result.current.errors[0].message).toBe('Network failed 2');
  });

  it('should clear all errors', () => {
    const { result } = renderHook(() => useErrorHandler());
    const mockError1 = {
      code: ErrorCodes.NETWORK_ERROR,
      message: 'Network failed 1',
      timestamp: new Date(),
    };
    const mockError2 = {
      code: ErrorCodes.DATABASE_ERROR,
      message: 'Database failed',
      timestamp: new Date(),
    };

    act(() => {
      result.current.addError(mockError1);
      result.current.addError(mockError2);
    });

    expect(result.current.errors).toHaveLength(2);

    act(() => {
      result.current.clearErrors();
    });

    expect(result.current.errors).toHaveLength(0);
  });

  it('should handle error with context', () => {
    const { result } = renderHook(() => useErrorHandler());
    const mockError = new Error('Test error');

    act(() => {
      result.current.handleError(mockError, 'Test context');
    });

    expect(result.current.errors).toHaveLength(1);
    expect(result.current.errors[0].code).toBe(ErrorCodes.UNKNOWN_ERROR);
  });

  it('should handle error with severity', () => {
    const { result } = renderHook(() => useErrorHandler());
    const mockError = new Error('Test error');

    act(() => {
      result.current.handleError(mockError, 'Test context', ErrorSeverity.HIGH);
    });

    expect(result.current.errors).toHaveLength(1);
  });

  it('should provide error statistics', () => {
    const { result } = renderHook(() => useErrorHandler());

    const stats = result.current.getErrorStats();
    expect(stats).toBeInstanceOf(Map);
  });

  it('should provide error count by code', () => {
    const { result } = renderHook(() => useErrorHandler());

    const count = result.current.getErrorCount(ErrorCodes.NETWORK_ERROR);
    expect(count).toBe(0);
  });

  it('should provide recovery suggestions', () => {
    const { result } = renderHook(() => useErrorHandler());
    const mockError = {
      code: ErrorCodes.NETWORK_ERROR,
      message: 'Network failed',
      timestamp: new Date(),
    };

    const suggestions = result.current.getRecoverySuggestions(mockError);
    expect(suggestions).toEqual(['Test suggestion']);
  });

  it('should handle error with retry logic', async () => {
    const { result } = renderHook(() => useErrorHandler());
    const mockOperation = jest
      .fn()
      .mockRejectedValue(new Error('Network error'));

    const operationId = 'test-operation';
    const context = 'Test context';

    const retryResult = await act(async () => {
      return result.current.handleErrorWithRetry(
        mockOperation,
        operationId,
        context
      );
    });

    expect(retryResult).toHaveProperty('error');
  }, 10000);

  it('should render ErrorToasts component', () => {
    const { result } = renderHook(() => useErrorHandler());

    // ErrorToasts is a function that returns JSX, so we check if it's defined
    expect(result.current.ErrorToasts).toBeDefined();
    expect(typeof result.current.ErrorToasts).toBe('function');

    // Test that ErrorToasts can be called
    const toasts = result.current.ErrorToasts();
    expect(toasts).toBeDefined();
  });
});
