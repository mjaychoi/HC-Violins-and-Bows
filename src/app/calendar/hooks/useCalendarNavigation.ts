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

  // Refetch current range (reuse memoized currentRange for consistency)
  const refetchCurrentRange = useCallback(async () => {
    try {
      await fetchRef.current(currentRange.startDate, currentRange.endDate);
    } catch (error) {
      if (onErrorRef.current) {
        onErrorRef.current(error);
      }
    }
  }, [currentRange]);

  // Fetch tasks when date or view changes
  useEffect(() => {
    refetchCurrentRange();
  }, [refetchCurrentRange]);

  // Navigate to previous period
  const handlePrevious = useCallback(() => {
    const newDate = navigatePrevious(calendarView, currentDate);
    setCurrentDate(newDate);
  }, [calendarView, currentDate]);

  // Navigate to next period
  const handleNext = useCallback(() => {
    const newDate = navigateNext(calendarView, currentDate);
    setCurrentDate(newDate);
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
    // Expose current range and refetch function
    currentRange,
    refetchCurrentRange,
  };
};
