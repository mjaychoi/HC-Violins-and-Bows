import { renderHook, act } from '@testing-library/react';
import { useCalendarView } from '../useCalendarView';
import type { CalendarViewMode } from '../useCalendarView';

describe('useCalendarView', () => {
  it('should initialize with calendar view by default', () => {
    const { result } = renderHook(() => useCalendarView());

    expect(result.current.view).toBe('calendar');
  });

  it('should change view using setView', () => {
    const { result } = renderHook(() => useCalendarView());

    act(() => {
      result.current.setView('list');
    });

    expect(result.current.view).toBe('list');
  });

  it('should change view to timeline', () => {
    const { result } = renderHook(() => useCalendarView());

    act(() => {
      result.current.setView('timeline');
    });

    expect(result.current.view).toBe('timeline');
  });

  it('should change view to year', () => {
    const { result } = renderHook(() => useCalendarView());

    act(() => {
      result.current.setView('year');
    });

    expect(result.current.view).toBe('year');
  });

  it('should support all view modes', () => {
    const viewModes: CalendarViewMode[] = [
      'calendar',
      'list',
      'timeline',
      'year',
    ];
    const { result } = renderHook(() => useCalendarView());

    viewModes.forEach(mode => {
      act(() => {
        result.current.setView(mode);
      });

      expect(result.current.view).toBe(mode);
    });
  });

  it('should change view using legacy setCalendarView', () => {
    const { result } = renderHook(() => useCalendarView());

    // Change to list first
    act(() => {
      result.current.setView('list');
    });
    expect(result.current.view).toBe('list');

    // Use legacy setter
    act(() => {
      result.current.setCalendarView();
    });

    expect(result.current.view).toBe('calendar');
  });

  it('should change view using legacy setListView', () => {
    const { result } = renderHook(() => useCalendarView());

    // Start with calendar
    expect(result.current.view).toBe('calendar');

    // Use legacy setter
    act(() => {
      result.current.setListView();
    });

    expect(result.current.view).toBe('list');
  });

  it('should allow multiple view changes', () => {
    const { result } = renderHook(() => useCalendarView());

    act(() => {
      result.current.setView('list');
    });
    expect(result.current.view).toBe('list');

    act(() => {
      result.current.setView('timeline');
    });
    expect(result.current.view).toBe('timeline');

    act(() => {
      result.current.setView('year');
    });
    expect(result.current.view).toBe('year');

    act(() => {
      result.current.setView('calendar');
    });
    expect(result.current.view).toBe('calendar');
  });

  it('should maintain view state across re-renders', () => {
    const { result, rerender } = renderHook(() => useCalendarView());

    act(() => {
      result.current.setView('list');
    });

    rerender();

    expect(result.current.view).toBe('list');
  });

  it('should return all expected methods and state', () => {
    const { result } = renderHook(() => useCalendarView());

    expect(result.current).toHaveProperty('view');
    expect(result.current).toHaveProperty('setView');
    expect(result.current).toHaveProperty('setCalendarView');
    expect(result.current).toHaveProperty('setListView');

    expect(typeof result.current.setView).toBe('function');
    expect(typeof result.current.setCalendarView).toBe('function');
    expect(typeof result.current.setListView).toBe('function');
  });
});
