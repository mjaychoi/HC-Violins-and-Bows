import { renderHook, act } from '@testing-library/react';
import { useInvoiceSort } from '../useInvoiceSort';

describe('useInvoiceSort', () => {
  it('initializes with default values', () => {
    const { result } = renderHook(() => useInvoiceSort());

    expect(result.current.sortColumn).toBe('invoice_date');
    expect(result.current.sortDirection).toBe('desc');
  });

  it('initializes with custom values', () => {
    const { result } = renderHook(() => useInvoiceSort('total', 'asc'));

    expect(result.current.sortColumn).toBe('total');
    expect(result.current.sortDirection).toBe('asc');
  });

  it('handles sort click on new column', () => {
    const { result } = renderHook(() => useInvoiceSort());

    act(() => {
      result.current.handleSort('total');
    });

    expect(result.current.sortColumn).toBe('total');
    expect(result.current.sortDirection).toBe('desc'); // Default direction
  });

  it('toggles direction when same column is clicked', () => {
    const { result } = renderHook(() => useInvoiceSort());

    act(() => {
      result.current.handleSort('invoice_date');
    });

    expect(result.current.sortColumn).toBe('invoice_date');
    expect(result.current.sortDirection).toBe('asc'); // Toggled from desc

    act(() => {
      result.current.handleSort('invoice_date');
    });

    expect(result.current.sortDirection).toBe('desc'); // Toggled back
  });

  it('uses per-column default direction', () => {
    const { result } = renderHook(() => useInvoiceSort());

    act(() => {
      result.current.handleSort('invoice_number');
    });

    expect(result.current.sortColumn).toBe('invoice_number');
    expect(result.current.sortDirection).toBe('asc');
  });

  it('returns correct sort state', () => {
    const { result } = renderHook(() => useInvoiceSort('invoice_date', 'asc'));

    expect(result.current.getSortState('invoice_date')).toEqual({
      active: true,
      direction: 'asc',
    });
    expect(result.current.getSortState('total')).toEqual({ active: false });
  });

  it('returns down direction for desc sort state', () => {
    const { result } = renderHook(() => useInvoiceSort('invoice_date', 'desc'));

    expect(result.current.getSortState('invoice_date')).toEqual({
      active: true,
      direction: 'desc',
    });
  });

  it('allows setting sort column directly', () => {
    const { result } = renderHook(() => useInvoiceSort());

    act(() => {
      result.current.setSortColumn('status');
    });

    expect(result.current.sortColumn).toBe('status');
  });

  it('allows setting sort direction directly', () => {
    const { result } = renderHook(() => useInvoiceSort());

    act(() => {
      result.current.setSortDirection('asc');
    });

    expect(result.current.sortDirection).toBe('asc');
  });
});
