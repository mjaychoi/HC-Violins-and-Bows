import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  getDateRangeForView,
  navigatePrevious,
  navigateNext,
} from '../utils/dateUtils';

interface UseCalendarNavigationOptions {
  initialDate?: Date;
  /**
   * Tenant identity included in request dedup keys so org switches always refetch
   * even when the visible date range is unchanged.
   */
  tenantIdentityKey?: string | null;
  fetchTasksByDateRange: (
    startDate: string,
    endDate: string,
    options?: {
      signal?: AbortSignal;
      throwOnError?: boolean;
      suppressErrorToast?: boolean;
    }
  ) => Promise<unknown>;
  onError?: (error: unknown) => void;
  /** Fired when the initial range refetch (on mount / range change) fails, so the UI is not left silently stale. */
  onRefetchFailure?: (error: unknown) => void;
}

export const useCalendarNavigation = ({
  initialDate = new Date(),
  tenantIdentityKey = null,
  fetchTasksByDateRange,
  onError,
  onRefetchFailure,
}: UseCalendarNavigationOptions) => {
  const [currentDate, setCurrentDate] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // FIXED: Stash fetchTasksByDateRange and onError in refs to avoid stale closure issues
  const fetchRef = useRef(fetchTasksByDateRange);
  const onErrorRef = useRef(onError);
  const onRefetchFailureRef = useRef(onRefetchFailure);

  // Request deduplication: prevent duplicate fetches for the same tenant+range
  const lastRequestKeyRef = useRef<string>('');
  const lastTenantIdentityKeyRef = useRef<string | null>(tenantIdentityKey);

  // Race condition prevention: track request ID and abort controller
  const requestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchRef.current = fetchTasksByDateRange;
  }, [fetchTasksByDateRange]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onRefetchFailureRef.current = onRefetchFailure;
  }, [onRefetchFailure]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Current date range for the view (memoized)
  const currentRange = useMemo(() => {
    return getDateRangeForView(currentDate);
  }, [currentDate]);

  const tenantKey = tenantIdentityKey ?? '__no_tenant__';

  // Refetch current range with deduplication and race condition prevention
  const refetchCurrentRange = useCallback(
    async (
      force = false,
      options?: {
        suppressErrorToast?: boolean;
      }
    ) => {
      // Include tenant so identical ranges across orgs never dedup together
      const requestKey = `${tenantKey}|${currentRange.startDate}|${currentRange.endDate}`;

      // Skip if this is the same request as the last one (StrictMode double-invoke prevention)
      // Unless force=true (for manual refresh after external changes)
      if (!force && lastRequestKeyRef.current === requestKey) {
        return;
      }

      // Abort previous request if still pending (covers prior-org in-flight)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Increment request ID
      const currentRequestId = ++requestIdRef.current;
      lastRequestKeyRef.current = requestKey;
      lastTenantIdentityKeyRef.current = tenantIdentityKey ?? null;

      try {
        await fetchRef.current(currentRange.startDate, currentRange.endDate, {
          signal: abortController.signal,
          throwOnError: true,
          // Inline error UI on the calendar; avoid duplicate global toasts.
          suppressErrorToast: options?.suppressErrorToast ?? true,
        });

        // Only process if this is still the latest request (race condition check)
        if (
          currentRequestId === requestIdRef.current &&
          !abortController.signal.aborted
        ) {
          // Request completed successfully
          abortControllerRef.current = null;
        }
      } catch (error) {
        const isAbortError =
          abortController.signal.aborted ||
          (error instanceof DOMException && error.name === 'AbortError');

        if (isAbortError) {
          if (currentRequestId === requestIdRef.current) {
            abortControllerRef.current = null;
          }
          return;
        }

        // Only handle error if this is still the latest request
        if (
          currentRequestId === requestIdRef.current &&
          !abortController.signal.aborted
        ) {
          if (onErrorRef.current) {
            onErrorRef.current(error);
          }
          abortControllerRef.current = null;
          throw error;
        }
      }
    },
    [tenantKey, tenantIdentityKey, currentRange.startDate, currentRange.endDate]
  );

  // Force refetch: bypass deduplication for manual refresh (e.g., after external task changes)
  const forceRefetch = useCallback(
    async (options?: { suppressErrorToast?: boolean }) => {
      await refetchCurrentRange(true, options);
    },
    [refetchCurrentRange]
  );

  // Invalidate request key: allows next refetch to bypass deduplication
  const invalidateRequestKey = useCallback(() => {
    lastRequestKeyRef.current = '';
  }, []);

  // When tenant identity changes, drop the dedup key so the visible range refetches for the new org
  useEffect(() => {
    if (lastTenantIdentityKeyRef.current !== (tenantIdentityKey ?? null)) {
      lastRequestKeyRef.current = '';
      lastTenantIdentityKeyRef.current = tenantIdentityKey ?? null;
    }
  }, [tenantIdentityKey]);

  // Fetch tasks when date or tenant changes (with deduplication)
  useEffect(() => {
    void refetchCurrentRange().catch((err: unknown) => {
      onRefetchFailureRef.current?.(err);
    });
  }, [refetchCurrentRange]);

  // Navigate to previous period
  const handlePrevious = useCallback(() => {
    const newDate = navigatePrevious(currentDate);
    setCurrentDate(newDate);
    // Clear selectedDate when navigating to avoid stale selection
    setSelectedDate(null);
  }, [currentDate]);

  // Navigate to next period
  const handleNext = useCallback(() => {
    const newDate = navigateNext(currentDate);
    setCurrentDate(newDate);
    // Clear selectedDate when navigating to avoid stale selection
    setSelectedDate(null);
  }, [currentDate]);

  // Navigate to today
  const handleGoToToday = useCallback(() => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now);
  }, []);

  return {
    currentDate,
    selectedDate,
    setCurrentDate,
    setSelectedDate,
    handlePrevious,
    handleNext,
    handleGoToToday,
    // Expose current range and refetch functions
    currentRange,
    refetchCurrentRange,
    forceRefetch, // Force refetch bypassing deduplication
    invalidateRequestKey, // Invalidate request key to allow next refetch
  };
};
