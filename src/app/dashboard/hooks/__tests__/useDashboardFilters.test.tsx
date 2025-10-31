import { renderHook, act } from '@testing-library/react';
import { useDashboardFilters } from '../useDashboardFilters';
import { Instrument } from '@/types';

describe('useDashboardFilters', () => {
  const mockItems: Instrument[] = [
    {
      id: '1',
      status: 'Available',
      maker: 'Stradivari',
      type: 'Violin',
      year: '1700',
      price: 10000,
      ownership: 'Store',
      created_at: '2024-01-01',
      certificate: true,
    },
    {
      id: '2',
      status: 'Sold',
      maker: 'Guarneri',
      type: 'Violin',
      year: '1750',
      price: 20000,
      ownership: 'Owner',
      created_at: '2024-01-02',
      certificate: false,
    },
    {
      id: '3',
      status: 'Available',
      maker: 'Amati',
      type: 'Cello',
      year: null,
      price: null,
      ownership: 'Store',
      created_at: '2024-01-03',
      certificate: true,
    },
  ];

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    expect(result.current.searchTerm).toBe('');
    expect(result.current.sortBy).toBe('created_at');
    expect(result.current.sortOrder).toBe('desc');
    expect(result.current.showFilters).toBe(false);
    expect(result.current.filteredItems).toHaveLength(3);
  });

  it('should filter by search term', () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.setSearchTerm('Stradivari');
    });

    expect(result.current.filteredItems).toHaveLength(1);
    expect(result.current.filteredItems[0].maker).toBe('Stradivari');
  });

  it('should filter by status', () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.handleFilterChange('status', 'Available');
    });

    expect(result.current.filteredItems).toHaveLength(2);
    expect(
      result.current.filteredItems.every(item => item.status === 'Available')
    ).toBe(true);
  });

  it('should filter by maker', () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.handleFilterChange('maker', 'Guarneri');
    });

    expect(result.current.filteredItems).toHaveLength(1);
    expect(result.current.filteredItems[0].maker).toBe('Guarneri');
  });

  it('should filter by type', () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.handleFilterChange('type', 'Violin');
    });

    expect(result.current.filteredItems).toHaveLength(2);
    expect(
      result.current.filteredItems.every(item => item.type === 'Violin')
    ).toBe(true);
  });

  it('should filter by ownership', () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.handleFilterChange('ownership', 'Store');
    });

    expect(result.current.filteredItems).toHaveLength(2);
    expect(
      result.current.filteredItems.every(item => item.ownership === 'Store')
    ).toBe(true);
  });

  it('should filter by certificate', () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.handleFilterChange('certificate', true);
    });

    expect(result.current.filteredItems).toHaveLength(2);
    expect(
      result.current.filteredItems.every(item => item.certificate === true)
    ).toBe(true);
  });

  it('should filter by price range', () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.handlePriceRangeChange('min', '15000');
    });

    expect(result.current.filteredItems).toHaveLength(1);
    expect(result.current.filteredItems[0].price).toBe(20000);
  });

  it('should combine multiple filters', () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.setSearchTerm('Violin');
    });
    act(() => {
      result.current.handleFilterChange('status', 'Available');
    });

    expect(result.current.filteredItems).toHaveLength(1);
    expect(result.current.filteredItems[0].status).toBe('Available');
    expect(result.current.filteredItems[0].type).toBe('Violin');
  });

  it('should clear all filters', () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.setSearchTerm('test');
    });
    act(() => {
      result.current.handleFilterChange('status', 'Available');
    });

    expect(result.current.filteredItems).toHaveLength(0);

    act(() => {
      result.current.clearAllFilters();
    });

    expect(result.current.searchTerm).toBe('');
    expect(result.current.filteredItems).toHaveLength(3);
  });

  it('should provide filter options', () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    expect(result.current.filterOptions.status).toContain('Available');
    expect(result.current.filterOptions.status).toContain('Sold');
    expect(result.current.filterOptions.maker).toContain('Stradivari');
    expect(result.current.filterOptions.maker).toContain('Guarneri');
    expect(result.current.filterOptions.type).toContain('Violin');
    expect(result.current.filterOptions.type).toContain('Cello');
  });

  it('should handle sort', () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.handleSort('maker');
    });

    // Should still have items, just sorted
    expect(result.current.filteredItems.length).toBeGreaterThan(0);
  });

  it('should return active filters count', () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    expect(result.current.getActiveFiltersCount()).toBe(0);

    act(() => {
      result.current.handleFilterChange('status', 'Available');
    });

    expect(result.current.getActiveFiltersCount()).toBe(1);
  });

  it('should toggle show filters', () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.setShowFilters(true);
    });

    expect(result.current.showFilters).toBe(true);

    act(() => {
      result.current.setShowFilters(false);
    });

    expect(result.current.showFilters).toBe(false);
  });
});
