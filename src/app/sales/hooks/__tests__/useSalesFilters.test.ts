import { renderHook, act } from '@testing-library/react';
import { useSalesFilters } from '../useSalesFilters';
import { SalesFilters } from '../../types';

// Mock useURLState
const mockUpdateURLState = jest.fn();
jest.mock('@/hooks/useURLState', () => ({
  useURLState: jest.fn(() => ({
    urlState: {},
    updateURLState: mockUpdateURLState,
    clearURLState: jest.fn(),
  })),
}));

// Mock getDateRangeFromPreset - use same path as in useSalesFilters.ts
jest.mock('../../utils/salesUtils', () => ({
  getDateRangeFromPreset: jest.fn(preset => {
    const presets: Record<string, { from: string; to: string }> = {
      last7: { from: '2024-01-08', to: '2024-01-15' },
      thisMonth: { from: '2024-01-01', to: '2024-01-15' },
      lastMonth: { from: '2023-12-01', to: '2023-12-31' },
    };
    return presets[preset] || { from: '', to: '' };
  }),
}));

describe('useSalesFilters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset sessionStorage
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: jest.fn(() => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      },
      writable: true,
    });
  });

  it('initializes with default values', () => {
    const { result } = renderHook(() => useSalesFilters());

    expect(result.current.from).toBe('');
    expect(result.current.to).toBe('');
    expect(result.current.search).toBe('');
    expect(result.current.sortColumn).toBe('sale_date');
    expect(result.current.sortDirection).toBe('desc');
    expect(result.current.hasClient).toBeNull();
    expect(result.current.showFilters).toBe(true);
  });

  it('initializes with provided initialFilters', () => {
    const initialFilters: Partial<SalesFilters> = {
      from: '2024-01-01',
      to: '2024-01-31',
      search: 'test',
      sortColumn: 'sale_price',
      sortDirection: 'asc',
    };

    const { result } = renderHook(() => useSalesFilters(initialFilters));

    expect(result.current.from).toBe('2024-01-01');
    expect(result.current.to).toBe('2024-01-31');
    expect(result.current.search).toBe('test');
    expect(result.current.sortColumn).toBe('sale_price');
    expect(result.current.sortDirection).toBe('asc');
  });

  it('updates from date', () => {
    const { result } = renderHook(() => useSalesFilters());

    act(() => {
      result.current.setFrom('2024-01-15');
    });

    expect(result.current.from).toBe('2024-01-15');
  });

  it('updates to date', () => {
    const { result } = renderHook(() => useSalesFilters());

    act(() => {
      result.current.setTo('2024-01-31');
    });

    expect(result.current.to).toBe('2024-01-31');
  });

  it('updates search term', () => {
    const { result } = renderHook(() => useSalesFilters());

    act(() => {
      result.current.setSearch('test search');
    });

    expect(result.current.search).toBe('test search');
  });

  it('updates sort column', () => {
    const { result } = renderHook(() => useSalesFilters());

    act(() => {
      result.current.setSortColumn('client_name');
    });

    expect(result.current.sortColumn).toBe('client_name');
  });

  it('updates sort direction', () => {
    const { result } = renderHook(() => useSalesFilters());

    act(() => {
      result.current.setSortDirection('asc');
    });

    expect(result.current.sortDirection).toBe('asc');
  });

  it('updates hasClient filter', () => {
    const { result } = renderHook(() => useSalesFilters());

    act(() => {
      result.current.setHasClient(true);
    });

    expect(result.current.hasClient).toBe(true);

    act(() => {
      result.current.setHasClient(false);
    });

    expect(result.current.hasClient).toBe(false);

    act(() => {
      result.current.setHasClient(null);
    });

    expect(result.current.hasClient).toBeNull();
  });

  it('handles date preset correctly', () => {
    const { result } = renderHook(() => useSalesFilters());

    act(() => {
      result.current.handleDatePreset('last7');
    });

    expect(result.current.from).toBe('2024-01-08');
    expect(result.current.to).toBe('2024-01-15');
  });

  it('clears all filters', () => {
    const initialFilters: Partial<SalesFilters> = {
      from: '2024-01-01',
      to: '2024-01-31',
      search: 'test',
      hasClient: true,
    };

    const { result } = renderHook(() => useSalesFilters(initialFilters));

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.from).toBe('');
    expect(result.current.to).toBe('');
    expect(result.current.search).toBe('');
    expect(result.current.hasClient).toBeNull();
  });

  it('toggles showFilters', () => {
    const { result } = renderHook(() => useSalesFilters());

    expect(result.current.showFilters).toBe(true);

    act(() => {
      result.current.setShowFilters(false);
    });

    expect(result.current.showFilters).toBe(false);

    act(() => {
      result.current.setShowFilters(true);
    });

    expect(result.current.showFilters).toBe(true);
  });

  it('returns filters object with current state', () => {
    const { result } = renderHook(() => useSalesFilters());

    act(() => {
      result.current.setFrom('2024-01-01');
      result.current.setTo('2024-01-31');
      result.current.setSearch('test');
    });

    expect(result.current.filters).toEqual({
      from: '2024-01-01',
      to: '2024-01-31',
      search: 'test',
      sortColumn: 'sale_date',
      sortDirection: 'desc',
      hasClient: null,
    });
  });
});
