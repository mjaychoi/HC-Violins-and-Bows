import { useState, useCallback, useEffect } from 'react';

/**
 * Top-level Calendar page surface: Month grid vs List.
 */
export type CalendarViewMode = 'calendar' | 'list';

const MOBILE_CALENDAR_QUERY = '(max-width: 767px)';

export const useCalendarView = () => {
  const [view, setView] = useState<CalendarViewMode>('calendar');
  const [hasInitializedMobileDefault, setHasInitializedMobileDefault] =
    useState(false);

  useEffect(() => {
    if (hasInitializedMobileDefault) return;
    setHasInitializedMobileDefault(true);
    if (window.matchMedia?.(MOBILE_CALENDAR_QUERY)?.matches) {
      setView('list');
    }
  }, [hasInitializedMobileDefault]);

  useEffect(() => {
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 767px)').matches
    ) {
      setView('list');
    }
  }, []);

  const setViewMode = useCallback((mode: CalendarViewMode) => {
    setView(mode);
  }, []);

  const setCalendarView = useCallback(() => {
    setView('calendar');
  }, []);

  const setListView = useCallback(() => {
    setView('list');
  }, []);

  return {
    view,
    setView: setViewMode,
    setCalendarView,
    setListView,
  };
};
