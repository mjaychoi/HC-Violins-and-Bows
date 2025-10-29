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

export function useLoadingState(
  options: UseLoadingStateOptions = {}
): UseLoadingStateReturn {
  const { initialLoading = false, initialSubmitting = false } = options;

  const [loading, setLoading] = useState(initialLoading);
  const [submitting, setSubmitting] = useState(initialSubmitting);

  const startLoading = useCallback(() => setLoading(true), []);
  const stopLoading = useCallback(() => setLoading(false), []);
  const startSubmitting = useCallback(() => setSubmitting(true), []);
  const stopSubmitting = useCallback(() => setSubmitting(false), []);

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
    isLoading: loading,
    isSubmitting: submitting,
  };
}
