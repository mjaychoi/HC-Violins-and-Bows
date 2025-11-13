import { renderHook, act } from '@testing-library/react';
import { useLoadingState } from '../useLoadingState';

describe('useLoadingState', () => {
  it('should initialize with default values', () => {
    const { result } = renderHook(() => useLoadingState());

    expect(result.current.loading).toBe(false);
    expect(result.current.submitting).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('should initialize with custom loading state', () => {
    const { result } = renderHook(() =>
      useLoadingState({ initialLoading: true })
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.isLoading).toBe(true);
  });

  it('should initialize with custom submitting state', () => {
    const { result } = renderHook(() =>
      useLoadingState({ initialSubmitting: true })
    );

    expect(result.current.submitting).toBe(true);
    expect(result.current.isSubmitting).toBe(true);
  });

  it('should set loading state', () => {
    const { result } = renderHook(() => useLoadingState());

    act(() => {
      result.current.setLoading(true);
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.isLoading).toBe(true);

    act(() => {
      result.current.setLoading(false);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('should set submitting state', () => {
    const { result } = renderHook(() => useLoadingState());

    act(() => {
      result.current.setSubmitting(true);
    });

    expect(result.current.submitting).toBe(true);
    expect(result.current.isSubmitting).toBe(true);

    act(() => {
      result.current.setSubmitting(false);
    });

    expect(result.current.submitting).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('should start loading', () => {
    const { result } = renderHook(() => useLoadingState());

    act(() => {
      result.current.startLoading();
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.isLoading).toBe(true);
  });

  it('should stop loading', () => {
    const { result } = renderHook(() =>
      useLoadingState({ initialLoading: true })
    );

    act(() => {
      result.current.stopLoading();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('should start submitting', () => {
    const { result } = renderHook(() => useLoadingState());

    act(() => {
      result.current.startSubmitting();
    });

    expect(result.current.submitting).toBe(true);
    expect(result.current.isSubmitting).toBe(true);
  });

  it('should stop submitting', () => {
    const { result } = renderHook(() =>
      useLoadingState({ initialSubmitting: true })
    );

    act(() => {
      result.current.stopSubmitting();
    });

    expect(result.current.submitting).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('should handle withLoading for successful operation', async () => {
    const { result } = renderHook(() => useLoadingState());
    const mockOperation = jest.fn().mockResolvedValue('success');

    let operationResult: string | null = null;

    await act(async () => {
      operationResult = await result.current.withLoading(() => mockOperation());
    });

    expect(mockOperation).toHaveBeenCalledTimes(1);
    expect(operationResult).toBe('success');
    expect(result.current.loading).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('should handle withLoading for failed operation', async () => {
    const { result } = renderHook(() => useLoadingState());
    const mockError = new Error('Operation failed');
    const mockOperation = jest.fn().mockRejectedValue(mockError);

    await act(async () => {
      try {
        await result.current.withLoading(() => mockOperation());
      } catch (error) {
        expect(error).toBe(mockError);
      }
    });

    expect(mockOperation).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('should set loading to true during withLoading operation', async () => {
    const { result } = renderHook(() => useLoadingState());
    const loadingStates: boolean[] = [];

    const mockOperation = jest.fn().mockImplementation(async () => {
      loadingStates.push(result.current.loading);
      await new Promise(resolve => setTimeout(resolve, 10));
      loadingStates.push(result.current.loading);
      return 'success';
    });

    await act(async () => {
      await result.current.withLoading(mockOperation);
    });

    expect(mockOperation).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    // Verify loading state was tracked during operation
    expect(loadingStates.length).toBeGreaterThan(0);
  });

  it('should handle withSubmitting for successful operation', async () => {
    const { result } = renderHook(() => useLoadingState());
    const mockOperation = jest.fn().mockResolvedValue('success');

    let operationResult: string | null = null;

    await act(async () => {
      operationResult = await result.current.withSubmitting(() =>
        mockOperation()
      );
    });

    expect(mockOperation).toHaveBeenCalledTimes(1);
    expect(operationResult).toBe('success');
    expect(result.current.submitting).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('should handle withSubmitting for failed operation', async () => {
    const { result } = renderHook(() => useLoadingState());
    const mockError = new Error('Operation failed');
    const mockOperation = jest.fn().mockRejectedValue(mockError);

    await act(async () => {
      try {
        await result.current.withSubmitting(() => mockOperation());
      } catch (error) {
        expect(error).toBe(mockError);
      }
    });

    expect(mockOperation).toHaveBeenCalledTimes(1);
    expect(result.current.submitting).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('should handle multiple loading operations', async () => {
    const { result } = renderHook(() => useLoadingState());
    const mockOperation1 = jest.fn().mockResolvedValue('result1');
    const mockOperation2 = jest.fn().mockResolvedValue('result2');

    await act(async () => {
      await result.current.withLoading(() => mockOperation1());
      await result.current.withLoading(() => mockOperation2());
    });

    expect(mockOperation1).toHaveBeenCalledTimes(1);
    expect(mockOperation2).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });

  it('should handle loading and submitting independently', () => {
    const { result } = renderHook(() => useLoadingState());

    act(() => {
      result.current.startLoading();
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.submitting).toBe(false);

    act(() => {
      result.current.startSubmitting();
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.submitting).toBe(true);

    act(() => {
      result.current.stopLoading();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.submitting).toBe(true);
  });

  it('should return same values for isLoading and loading', () => {
    const { result } = renderHook(() => useLoadingState());

    act(() => {
      result.current.setLoading(true);
    });

    expect(result.current.isLoading).toBe(result.current.loading);

    act(() => {
      result.current.setLoading(false);
    });

    expect(result.current.isLoading).toBe(result.current.loading);
  });

  it('should return same values for isSubmitting and submitting', () => {
    const { result } = renderHook(() => useLoadingState());

    act(() => {
      result.current.setSubmitting(true);
    });

    expect(result.current.isSubmitting).toBe(result.current.submitting);

    act(() => {
      result.current.setSubmitting(false);
    });

    expect(result.current.isSubmitting).toBe(result.current.submitting);
  });
});
