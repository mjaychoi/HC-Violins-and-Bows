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

  it('should support calendar and list view modes', () => {
    const viewModes: CalendarViewMode[] = ['calendar', 'list'];
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

    act(() => {
      result.current.setView('list');
    });
    expect(result.current.view).toBe('list');

    act(() => {
      result.current.setCalendarView();
    });

    expect(result.current.view).toBe('calendar');
  });

  it('should change view using legacy setListView', () => {
    const { result } = renderHook(() => useCalendarView());

    expect(result.current.view).toBe('calendar');

    act(() => {
      result.current.setListView();
    });

    expect(result.current.view).toBe('list');
  });

  it('should allow switching between calendar and list', () => {
    const { result } = renderHook(() => useCalendarView());

    act(() => {
      result.current.setView('list');
    });
    expect(result.current.view).toBe('list');

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
