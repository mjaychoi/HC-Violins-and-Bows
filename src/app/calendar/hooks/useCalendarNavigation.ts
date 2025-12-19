import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  getDateRangeForView,
  navigatePrevious,
  navigateNext,
} from '../utils/dateUtils';
import type { ExtendedView } from '../components/CalendarView';

interface UseCalendarNavigationOptions {
  initialView?: ExtendedView;
  initialDate?: Date;
  fetchTasksByDateRange: (
    startDate: string,
    endDate: string
  ) => Promise<unknown>;
  onError?: (error: unknown) => void;
}

export const useCalendarNavigation = ({
  initialView = 'month',
  initialDate = new Date(),
  fetchTasksByDateRange,
  onError,
}: UseCalendarNavigationOptions) => {
  const [currentDate, setCurrentDate] = useState(initialDate);
  const [calendarView, setCalendarView] = useState<ExtendedView>(initialView);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // FIXED: Stash fetchTasksByDateRange and onError in refs to avoid stale closure issues
  const fetchRef = useRef(fetchTasksByDateRange);
  const onErrorRef = useRef(onError);

  // Request deduplication: prevent duplicate fetches for the same range
  const lastRequestKeyRef = useRef<string>('');

  // Race condition prevention: track request ID and abort controller
  const requestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchRef.current = fetchTasksByDateRange;
  }, [fetchTasksByDateRange]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Current date range for the view (memoized)
  const currentRange = useMemo(() => {
    return getDateRangeForView(calendarView, currentDate);
  }, [calendarView, currentDate]);

  // Refetch current range with deduplication and race condition prevention
  const refetchCurrentRange = useCallback(
    async (force = false) => {
      // Create request key for deduplication
      const requestKey = `${calendarView}|${currentRange.startDate}|${currentRange.endDate}`;

      // Skip if this is the same request as the last one (StrictMode double-invoke prevention)
      // Unless force=true (for manual refresh after external changes)
      if (!force && lastRequestKeyRef.current === requestKey) {
        return;
      }

      // Abort previous request if still pending
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Increment request ID
      const currentRequestId = ++requestIdRef.current;
      lastRequestKeyRef.current = requestKey;

      try {
        await fetchRef.current(currentRange.startDate, currentRange.endDate);

        // Only process if this is still the latest request (race condition check)
        if (
          currentRequestId === requestIdRef.current &&
          !abortController.signal.aborted
        ) {
          // Request completed successfully
          abortControllerRef.current = null;
        }
      } catch (error) {
        // Only handle error if this is still the latest request
        if (
          currentRequestId === requestIdRef.current &&
          !abortController.signal.aborted
        ) {
          if (onErrorRef.current) {
            onErrorRef.current(error);
          }
          abortControllerRef.current = null;
        }
      }
    },
    [calendarView, currentRange.startDate, currentRange.endDate]
  );

  // Force refetch: bypass deduplication for manual refresh (e.g., after external task changes)
  const forceRefetch = useCallback(async () => {
    await refetchCurrentRange(true);
  }, [refetchCurrentRange]);

  // Invalidate request key: allows next refetch to bypass deduplication
  const invalidateRequestKey = useCallback(() => {
    lastRequestKeyRef.current = '';
  }, []);

  // Fetch tasks when date or view changes (with deduplication)
  useEffect(() => {
    refetchCurrentRange();
  }, [refetchCurrentRange]);

  // Navigate to previous period
  const handlePrevious = useCallback(() => {
    const newDate = navigatePrevious(calendarView, currentDate);
    setCurrentDate(newDate);
    // Clear selectedDate when navigating to avoid stale selection
    setSelectedDate(null);
  }, [calendarView, currentDate]);

  // Navigate to next period
  const handleNext = useCallback(() => {
    const newDate = navigateNext(calendarView, currentDate);
    setCurrentDate(newDate);
    // Clear selectedDate when navigating to avoid stale selection
    setSelectedDate(null);
  }, [calendarView, currentDate]);

  // Navigate to today
  const handleGoToToday = useCallback(() => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now);
  }, []);

  // Handle view change
  const handleViewChange = useCallback((view: ExtendedView) => {
    setCalendarView(view);
    // Clear selectedDate when changing view to avoid stale selection
    setSelectedDate(null);
  }, []);

  return {
    currentDate,
    calendarView,
    selectedDate,
    setCurrentDate,
    setCalendarView: handleViewChange,
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
