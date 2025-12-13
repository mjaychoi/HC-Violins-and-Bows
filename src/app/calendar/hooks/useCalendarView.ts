import { useState, useCallback } from 'react';

export const useCalendarView = () => {
  const [view, setView] = useState<'calendar' | 'list'>('calendar');

  const setCalendarView = useCallback(() => {
    setView('calendar');
  }, []);

  const setListView = useCallback(() => {
    setView('list');
  }, []);

  return {
    view,
    setView,
    setCalendarView,
    setListView,
  };
};
