import { useState, useCallback } from 'react';

/**
 * Top-level Calendar page surface: Month grid vs List.
 */
export type CalendarViewMode = 'calendar' | 'list';

export const useCalendarView = () => {
  const [view, setView] = useState<CalendarViewMode>('calendar');

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
