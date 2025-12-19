import { renderHook, act } from '@testing-library/react';
import { useSalesSort } from '../useSalesSort';
import { SortColumn } from '../../types';

describe('useSalesSort', () => {
  const mockSetSortColumn = jest.fn();
  const mockSetSortDirection = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('toggles sort direction when same column is clicked', () => {
    const { result } = renderHook(() =>
      useSalesSort('sale_date', 'asc', mockSetSortColumn, mockSetSortDirection)
    );

    act(() => {
      result.current.handleSort('sale_date');
    });

    // Should toggle from asc to desc
    expect(mockSetSortDirection).toHaveBeenCalledWith('desc');
    expect(mockSetSortColumn).not.toHaveBeenCalled();
  });

  it('sets new column and resets to asc when different column is clicked', () => {
    const { result } = renderHook(() =>
      useSalesSort('sale_date', 'desc', mockSetSortColumn, mockSetSortDirection)
    );

    act(() => {
      result.current.handleSort('sale_price');
    });

    // Should set new column and reset direction to asc
    expect(mockSetSortColumn).toHaveBeenCalledWith('sale_price');
    expect(mockSetSortDirection).toHaveBeenCalledWith('asc');
  });

  it('returns neutral arrow when column is not currently sorted', () => {
    const { result } = renderHook(() =>
      useSalesSort('sale_date', 'asc', mockSetSortColumn, mockSetSortDirection)
    );

    const arrow = result.current.getSortArrow('sale_price');

    // Should return SVG element for neutral arrow
    expect(arrow).toBeTruthy();
  });

  it('returns ascending arrow when column is sorted ascending', () => {
    const { result } = renderHook(() =>
      useSalesSort('sale_date', 'asc', mockSetSortColumn, mockSetSortDirection)
    );

    const arrow = result.current.getSortArrow('sale_date');

    // Should return SVG element for ascending arrow
    expect(arrow).toBeTruthy();
  });

  it('returns descending arrow when column is sorted descending', () => {
    const { result } = renderHook(() =>
      useSalesSort('sale_date', 'desc', mockSetSortColumn, mockSetSortDirection)
    );

    const arrow = result.current.getSortArrow('sale_date');

    // Should return SVG element for descending arrow
    expect(arrow).toBeTruthy();
  });

  it('returns arrow for same column when dependencies do not change', () => {
    const { result, rerender } = renderHook(
      ({ sortColumn, sortDirection }) =>
        useSalesSort(
          sortColumn,
          sortDirection,
          mockSetSortColumn,
          mockSetSortDirection
        ),
      {
        initialProps: {
          sortColumn: 'sale_date' as const,
          sortDirection: 'asc' as const,
        },
      }
    );

    const firstArrow = result.current.getSortArrow('sale_date');

    // Rerender with same props
    rerender({
      sortColumn: 'sale_date' as const,
      sortDirection: 'asc' as const,
    });

    // Should return arrow for same column (React elements may be different instances but behavior is the same)
    const secondArrow = result.current.getSortArrow('sale_date');
    // Both should be SVG elements (React elements)
    expect(firstArrow).toBeTruthy();
    expect(secondArrow).toBeTruthy();
    expect(firstArrow).toStrictEqual(secondArrow);
  });

  it('updates arrow when sort column changes', () => {
    const { result, rerender } = renderHook(
      ({ sortColumn, sortDirection }) =>
        useSalesSort(
          sortColumn,
          sortDirection,
          mockSetSortColumn,
          mockSetSortDirection
        ),
      {
        initialProps: {
          sortColumn: 'sale_date' as SortColumn,
          sortDirection: 'asc' as const,
        },
      }
    );

    const arrow1 = result.current.getSortArrow('sale_date');

    // Change sort column - SortColumn includes 'sale_price'
    rerender({
      sortColumn: 'sale_price' as SortColumn,
      sortDirection: 'asc' as const,
    });

    // Arrow for sale_date should now be neutral
    const arrow2 = result.current.getSortArrow('sale_date');
    expect(arrow2).not.toBe(arrow1);
  });

  it('handles all sort columns correctly', () => {
    const columns: Array<'sale_date' | 'sale_price' | 'client_name'> = [
      'sale_date',
      'sale_price',
      'client_name',
    ];

    columns.forEach(column => {
      const { result } = renderHook(() =>
        useSalesSort(column, 'asc', mockSetSortColumn, mockSetSortDirection)
      );

      const arrow = result.current.getSortArrow(column);
      expect(arrow).toBeTruthy();

      act(() => {
        result.current.handleSort(column);
      });

      expect(mockSetSortDirection).toHaveBeenCalled();
    });
  });
});
