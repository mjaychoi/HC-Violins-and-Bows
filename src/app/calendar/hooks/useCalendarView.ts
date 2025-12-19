import { useState, useCallback } from 'react';

/**
 * View mode for calendar page
 * Extended to support future timeline and year views
 */
export type CalendarViewMode = 'calendar' | 'list' | 'timeline' | 'year';

export const useCalendarView = () => {
  const [view, setView] = useState<CalendarViewMode>('calendar');

  // Unified setter for all view modes (more extensible)
  const setViewMode = useCallback((mode: CalendarViewMode) => {
    setView(mode);
  }, []);

  // Legacy setters for backward compatibility (can be removed later)
  const setCalendarView = useCallback(() => {
    setView('calendar');
  }, []);

  const setListView = useCallback(() => {
    setView('list');
  }, []);

  return {
    view,
    setView: setViewMode, // Unified setter
    setCalendarView, // Legacy (deprecated, use setView('calendar'))
    setListView, // Legacy (deprecated, use setView('list'))
  };
};
