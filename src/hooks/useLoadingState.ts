import { useState, useCallback } from 'react';

interface UseLoadingStateOptions {
  initialLoading?: boolean;
  initialSubmitting?: boolean;
}

interface UseLoadingStateReturn {
  loading: boolean;
  submitting: boolean;
  setLoading: (loading: boolean) => void;
  setSubmitting: (submitting: boolean) => void;
  startLoading: () => void;
  stopLoading: () => void;
  startSubmitting: () => void;
  stopSubmitting: () => void;
  withLoading: <T>(operation: () => Promise<T>) => Promise<T>;
  withSubmitting: <T>(operation: () => Promise<T>) => Promise<T>;
  isLoading: boolean;
  isSubmitting: boolean;
}

/**
 * FIXED: Uses counter pattern to handle nested/overlapping async operations safely
 * This prevents race conditions where an earlier operation finishes after a later one,
 * incorrectly clearing the loading state
 */
export function useLoadingState(
  options: UseLoadingStateOptions = {}
): UseLoadingStateReturn {
  const { initialLoading = false, initialSubmitting = false } = options;

  // Use counters instead of boolean to handle nested calls
  const [loadingCount, setLoadingCount] = useState(initialLoading ? 1 : 0);
  const [submittingCount, setSubmittingCount] = useState(initialSubmitting ? 1 : 0);

  const loading = loadingCount > 0;
  const submitting = submittingCount > 0;

  const startLoading = useCallback(() => {
    setLoadingCount(c => c + 1);
  }, []);

  const stopLoading = useCallback(() => {
    setLoadingCount(c => Math.max(0, c - 1));
  }, []);

  const startSubmitting = useCallback(() => {
    setSubmittingCount(c => c + 1);
  }, []);

  const stopSubmitting = useCallback(() => {
    setSubmittingCount(c => Math.max(0, c - 1));
  }, []);

  const setLoading = useCallback((value: boolean) => {
    setLoadingCount(value ? 1 : 0);
  }, []);

  const setSubmitting = useCallback((value: boolean) => {
    setSubmittingCount(value ? 1 : 0);
  }, []);

  const withLoading = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      startLoading();
      try {
        const result = await operation();
        return result;
      } finally {
        stopLoading();
      }
    },
    [startLoading, stopLoading]
  );

  const withSubmitting = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T> => {
      startSubmitting();
      try {
        const result = await operation();
        return result;
      } finally {
        stopSubmitting();
      }
    },
    [startSubmitting, stopSubmitting]
  );

  return {
    loading,
    submitting,
    setLoading,
    setSubmitting,
    startLoading,
    stopLoading,
    startSubmitting,
    stopSubmitting,
    withLoading,
    withSubmitting,
    // Alias for convenience (pick one naming scheme)
    isLoading: loading,
    isSubmitting: submitting,
  };
}
