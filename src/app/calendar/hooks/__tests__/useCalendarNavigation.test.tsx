import { renderHook, act, waitFor } from '@/test-utils/render';
import { useCalendarNavigation } from '../useCalendarNavigation';

// Mock date utilities
jest.mock('../../utils/dateUtils', () => ({
  getDateRangeForView: jest.fn((view, date) => {
    const start = new Date(date);
    start.setDate(1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }),
  navigatePrevious: jest.fn((view, date) => {
    const newDate = new Date(date);
    newDate.setMonth(newDate.getMonth() - 1);
    return newDate;
  }),
  navigateNext: jest.fn((view, date) => {
    const newDate = new Date(date);
    newDate.setMonth(newDate.getMonth() + 1);
    return newDate;
  }),
}));

describe('useCalendarNavigation', () => {
  const mockFetchTasksByDateRange = jest.fn().mockResolvedValue(undefined);
  const mockOnError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() =>
      useCalendarNavigation({
        fetchTasksByDateRange: mockFetchTasksByDateRange,
      })
    );

    expect(result.current.calendarView).toBe('month');
    expect(result.current.currentDate).toBeInstanceOf(Date);
    expect(result.current.selectedDate).toBeNull();
  });

  it('should initialize with custom values', () => {
    const initialDate = new Date('2024-06-15');
    const { result } = renderHook(() =>
      useCalendarNavigation({
        initialView: 'week',
        initialDate,
        fetchTasksByDateRange: mockFetchTasksByDateRange,
      })
    );

    expect(result.current.calendarView).toBe('week');
    expect(result.current.currentDate).toEqual(initialDate);
  });

  it('should fetch tasks on mount', async () => {
    renderHook(() =>
      useCalendarNavigation({
        fetchTasksByDateRange: mockFetchTasksByDateRange,
      })
    );

    await waitFor(() => {
      expect(mockFetchTasksByDateRange).toHaveBeenCalled();
    });
  });

  it('should navigate to previous period', async () => {
    const initialDate = new Date('2024-06-15');
    const { result } = renderHook(() =>
      useCalendarNavigation({
        initialDate,
        fetchTasksByDateRange: mockFetchTasksByDateRange,
      })
    );

    const previousDate = result.current.currentDate;
    act(() => {
      result.current.handlePrevious();
    });

    await waitFor(() => {
      expect(result.current.currentDate.getTime()).toBeLessThan(
        previousDate.getTime()
      );
    });
  });

  it('should navigate to next period', async () => {
    const initialDate = new Date('2024-06-15');
    const { result } = renderHook(() =>
      useCalendarNavigation({
        initialDate,
        fetchTasksByDateRange: mockFetchTasksByDateRange,
      })
    );

    const nextDate = result.current.currentDate;
    act(() => {
      result.current.handleNext();
    });

    await waitFor(() => {
      expect(result.current.currentDate.getTime()).toBeGreaterThan(
        nextDate.getTime()
      );
    });
  });

  it('should navigate to today', () => {
    const { result } = renderHook(() =>
      useCalendarNavigation({
        fetchTasksByDateRange: mockFetchTasksByDateRange,
      })
    );

    act(() => {
      result.current.handleGoToToday();
    });

    expect(result.current.selectedDate).toBeInstanceOf(Date);
  });

  it('should change view', () => {
    const { result } = renderHook(() =>
      useCalendarNavigation({
        fetchTasksByDateRange: mockFetchTasksByDateRange,
      })
    );

    act(() => {
      result.current.setCalendarView('week');
    });

    expect(result.current.calendarView).toBe('week');
  });

  it('should handle fetch error', async () => {
    const mockError = new Error('Fetch failed');
    const failingFetch = jest.fn().mockRejectedValue(mockError);

    renderHook(() =>
      useCalendarNavigation({
        fetchTasksByDateRange: failingFetch,
        onError: mockOnError,
      })
    );

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(mockError);
    });
  });

  it('should refetch when date changes', async () => {
    const { result } = renderHook(() =>
      useCalendarNavigation({
        fetchTasksByDateRange: mockFetchTasksByDateRange,
      })
    );

    mockFetchTasksByDateRange.mockClear();

    act(() => {
      result.current.setCurrentDate(new Date('2024-07-15'));
    });

    await waitFor(() => {
      expect(mockFetchTasksByDateRange).toHaveBeenCalled();
    });
  });

  it('should refetch when view changes', async () => {
    const { result } = renderHook(() =>
      useCalendarNavigation({
        fetchTasksByDateRange: mockFetchTasksByDateRange,
      })
    );

    mockFetchTasksByDateRange.mockClear();

    act(() => {
      result.current.setCalendarView('week');
    });

    await waitFor(() => {
      expect(mockFetchTasksByDateRange).toHaveBeenCalled();
    });
  });

  it('should expose current range', () => {
    const { result } = renderHook(() =>
      useCalendarNavigation({
        fetchTasksByDateRange: mockFetchTasksByDateRange,
      })
    );

    expect(result.current.currentRange).toBeDefined();
    expect(result.current.currentRange.startDate).toBeDefined();
    expect(result.current.currentRange.endDate).toBeDefined();
  });

  it('should expose refetch function', () => {
    const { result } = renderHook(() =>
      useCalendarNavigation({
        fetchTasksByDateRange: mockFetchTasksByDateRange,
      })
    );

    expect(typeof result.current.refetchCurrentRange).toBe('function');
  });
});
