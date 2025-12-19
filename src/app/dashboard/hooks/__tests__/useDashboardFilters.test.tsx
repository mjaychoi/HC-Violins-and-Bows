import { renderHook, act, waitFor } from '@/test-utils/render';
import { useDashboardFilters } from '../useDashboardFilters';
import { Instrument } from '@/types';

// Mock useURLState to avoid browser API issues in tests
jest.mock('@/hooks/useURLState', () => ({
  useURLState: jest.fn(() => ({
    urlState: {},
    updateURLState: jest.fn(),
    clearURLState: jest.fn(),
  })),
}));

// Mock next/navigation for useURLState and useSearchParams
jest.mock('next/navigation', () => {
  const createSearchParams = (urlString?: string) => {
    try {
      const url = new URL(urlString || 'http://localhost/dashboard');
      return url.searchParams;
    } catch {
      return new URL('http://localhost/dashboard').searchParams;
    }
  };

  return {
    useRouter: jest.fn(() => ({
      push: jest.fn(),
      replace: jest.fn(),
      refresh: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      prefetch: jest.fn(),
    })),
    usePathname: jest.fn(() => '/dashboard'),
    useSearchParams: jest.fn(() =>
      createSearchParams('http://localhost/dashboard')
    ),
  };
});

describe('useDashboardFilters', () => {
  const mockItems: Instrument[] = [
    {
      id: '1',
      status: 'Available',
      maker: 'Stradivari',
      type: 'Violin',
      subtype: null,
      year: 1700,
      price: 10000,
      ownership: 'Store',
      created_at: '2024-01-01',
      certificate: true,
      size: null,
      weight: null,
      note: null,
      serial_number: null,
    },
    {
      id: '2',
      status: 'Sold',
      maker: 'Guarneri',
      type: 'Violin',
      subtype: null,
      year: 1750,
      price: 20000,
      ownership: 'Owner',
      created_at: '2024-01-02',
      certificate: false,
      size: null,
      weight: null,
      note: null,
      serial_number: null,
    },
    {
      id: '3',
      status: 'Available',
      maker: 'Amati',
      type: 'Cello',
      subtype: null,
      year: null,
      price: null,
      ownership: 'Store',
      created_at: '2024-01-03',
      certificate: true,
      size: null,
      weight: null,
      note: null,
      serial_number: null,
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

  it('should filter by search term', async () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.setSearchTerm('Stradivari');
    });

    await waitFor(
      () => {
        expect(result.current.filteredItems).toHaveLength(1);
        expect(result.current.filteredItems[0].maker).toBe('Stradivari');
      },
      { timeout: 1000 }
    );
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

  it('should combine multiple filters', async () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.setSearchTerm('Violin');
    });
    act(() => {
      result.current.handleFilterChange('status', 'Available');
    });

    await waitFor(
      () => {
        expect(result.current.filteredItems).toHaveLength(1);
        expect(result.current.filteredItems[0].status).toBe('Available');
        expect(result.current.filteredItems[0].type).toBe('Violin');
      },
      { timeout: 1000 }
    );
  });

  it('should clear all filters', async () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.setSearchTerm('test');
    });
    act(() => {
      result.current.handleFilterChange('status', 'Available');
    });

    await waitFor(
      () => {
        expect(result.current.filteredItems).toHaveLength(0);
      },
      { timeout: 1000 }
    );

    act(() => {
      result.current.clearAllFilters();
    });

    await waitFor(
      () => {
        expect(result.current.searchTerm).toBe('');
        expect(result.current.filteredItems).toHaveLength(3);
      },
      { timeout: 1000 }
    );
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
