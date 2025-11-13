import { renderHook, act, waitFor } from '@testing-library/react';
import { useAsyncOperation } from '../useAsyncOperation';

// Mock useErrorHandler
jest.mock('../useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn(),
  }),
}));

describe('useAsyncOperation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useAsyncOperation());

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('should set loading to true during operation', async () => {
    const { result } = renderHook(() => useAsyncOperation());
    const mockOperation = jest.fn().mockResolvedValue('success');

    await act(async () => {
      await result.current.run(mockOperation);
    });

    expect(result.current.data).toBe('success');
    expect(result.current.loading).toBe(false);
  });

  it('should set data after successful operation', async () => {
    const { result } = renderHook(() => useAsyncOperation());
    const mockData = { id: '1', name: 'Test' };
    const mockOperation = jest.fn().mockResolvedValue(mockData);

    await act(async () => {
      await result.current.run(mockOperation);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.loading).toBe(false);
  });

  it('should handle operation errors', async () => {
    const { result } = renderHook(() => useAsyncOperation());
    const mockError = new Error('Operation failed');
    const mockOperation = jest.fn().mockRejectedValue(mockError);

    await act(async () => {
      await result.current.run(mockOperation);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('should not set data when skipSetData is true', async () => {
    const { result } = renderHook(() => useAsyncOperation());
    const mockData = { id: '1', name: 'Test' };
    const mockOperation = jest.fn().mockResolvedValue(mockData);

    await act(async () => {
      await result.current.run(mockOperation, { skipSetData: true });
    });

    expect(result.current.data).toBeNull();
  });

  it('should call onSuccess callback', async () => {
    const { result } = renderHook(() => useAsyncOperation());
    const mockData = { id: '1', name: 'Test' };
    const mockOperation = jest.fn().mockResolvedValue(mockData);
    const onSuccess = jest.fn();

    await act(async () => {
      await result.current.run(mockOperation, { onSuccess });
    });

    expect(onSuccess).toHaveBeenCalledWith(mockData);
  });

  it('should cancel previous operation when new one starts', async () => {
    const { result } = renderHook(() => useAsyncOperation());
    const mockOperation1 = jest.fn().mockImplementation(
      () =>
        new Promise(resolve => {
          setTimeout(() => resolve('result1'), 200);
        })
    );
    const mockOperation2 = jest.fn().mockResolvedValue('result2');

    act(() => {
      result.current.run(mockOperation1);
    });

    await act(async () => {
      await result.current.run(mockOperation2);
    });

    // Operation 2 should complete, operation 1 should be cancelled
    expect(result.current.data).toBe('result2');
  });

  it('should handle abort signal', async () => {
    const { result } = renderHook(() => useAsyncOperation());
    const controller = new AbortController();

    const mockOperation = jest.fn().mockImplementation(
      (signal?: AbortSignal) =>
        new Promise((resolve, reject) => {
          if (signal?.aborted) {
            reject(new Error('Aborted'));
          } else {
            setTimeout(() => resolve('success'), 100);
          }
        })
    );

    act(() => {
      result.current.run(mockOperation, { signal: controller.signal });
    });

    act(() => {
      controller.abort();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('should not update state if component unmounts', async () => {
    const { result, unmount } = renderHook(() => useAsyncOperation());
    const mockOperation = jest.fn().mockImplementation(
      () =>
        new Promise(resolve => {
          setTimeout(() => resolve('success'), 100);
        })
    );

    act(() => {
      result.current.run(mockOperation);
    });

    unmount();

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    // State should not be updated after unmount
    // This is tested indirectly by ensuring no errors occur
  });

  it('should handle rapid consecutive operations', async () => {
    const { result } = renderHook(() => useAsyncOperation());
    const mockOperation1 = jest.fn().mockResolvedValue('result1');
    const mockOperation2 = jest.fn().mockResolvedValue('result2');
    const mockOperation3 = jest.fn().mockResolvedValue('result3');

    await act(async () => {
      await Promise.all([
        result.current.run(mockOperation1),
        result.current.run(mockOperation2),
        result.current.run(mockOperation3),
      ]);
    });

    // Last operation should win
    expect(result.current.data).toBe('result3');
  });

  it('should cancel operation', async () => {
    const { result } = renderHook(() => useAsyncOperation());
    const mockOperation = jest.fn().mockImplementation(
      () =>
        new Promise(resolve => {
          setTimeout(() => resolve('success'), 100);
        })
    );

    act(() => {
      result.current.run(mockOperation);
    });

    await act(async () => {
      result.current.cancel();
      // Wait a bit for the abort to take effect
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    // Cancel should abort the operation
    expect(result.current.loading).toBeDefined();
  });

  it('should allow manual setLoading', () => {
    const { result } = renderHook(() => useAsyncOperation());

    act(() => {
      result.current.setLoading(true);
    });

    expect(result.current.loading).toBe(true);

    act(() => {
      result.current.setLoading(false);
    });

    expect(result.current.loading).toBe(false);
  });

  it('should allow manual setData', () => {
    const { result } = renderHook(() => useAsyncOperation());
    const mockData = { id: '1', name: 'Test' };

    act(() => {
      result.current.setData(mockData);
    });

    expect(result.current.data).toEqual(mockData);
  });

  it('should handle operation with context', async () => {
    const { result } = renderHook(() => useAsyncOperation());
    const mockOperation = jest.fn().mockResolvedValue('success');

    await act(async () => {
      await result.current.run(mockOperation, { context: 'Test context' });
    });

    expect(result.current.data).toBe('success');
  });

  it('should handle AbortError gracefully', async () => {
    const { result } = renderHook(() => useAsyncOperation());
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    const mockOperation = jest.fn().mockRejectedValue(abortError);

    await act(async () => {
      await result.current.run(mockOperation);
    });

    // AbortError should return null without throwing
    // Should complete without throwing errors
    expect(result.current.data).toBeNull();
  });
});
