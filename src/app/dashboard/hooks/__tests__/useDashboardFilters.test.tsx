import { renderHook, act, waitFor } from '@/test-utils/render';
import { useDashboardFilters } from '../useDashboardFilters';
import { Instrument, ClientInstrument } from '@/types';
import { withNormalizedDefaults } from '@/test/fixtures/rows';

// Mock useURLState to keep URL syncing logic from resetting filters
jest.mock('@/hooks/useURLState', () => {
  const React: typeof import('react') = require('react');
  return {
    useURLState: jest.fn(() => {
      const [urlState, setUrlState] = React.useState<
        Record<string, string | string[] | null>
      >({});

      const updateURLState = React.useCallback(
        (updates: Record<string, string | string[] | null | undefined>) => {
          setUrlState((prevState: Record<string, string | string[] | null>) => {
            const nextState = { ...prevState };
            let hasChanges = false;

            Object.entries(updates).forEach(([key, value]) => {
              if (
                value === null ||
                value === undefined ||
                (typeof value === 'string' && value === '')
              ) {
                if (Object.prototype.hasOwnProperty.call(nextState, key)) {
                  delete nextState[key];
                  hasChanges = true;
                }
                return;
              }

              const normalized = Array.isArray(value)
                ? [...value]
                : (value as string);

              const existing = nextState[key];
              const valueChanged =
                Array.isArray(normalized) && Array.isArray(existing)
                  ? normalized.length !== existing.length ||
                    normalized.some((item, index) => item !== existing[index])
                  : normalized !== existing;

              if (valueChanged) {
                nextState[key] = normalized;
                hasChanges = true;
              }
            });

            return hasChanges ? nextState : prevState;
          });
        },
        []
      );

      const clearURLState = React.useCallback(() => {
        setUrlState({});
      }, []);

      return {
        urlState,
        updateURLState,
        clearURLState,
      };
    }),
  };
});

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

type InstrumentWithClients = Instrument & { clients: ClientInstrument[] };

/**
 * IMPORTANT:
 * Certificate "Yes" should reflect actual file existence (S3-backed),
 * so for test fixtures we set `certificate_name` for instruments that
 * are expected to be included when filtering certificate=true.
 */
const rawMockItems: Instrument[] = [
  {
    id: '1',
    status: 'Available',
    maker: 'Stradivari',
    type: 'Violin',
    subtype: '4/4',
    year: 1700,
    price: 10000,
    ownership: 'Store',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    certificate: true,
    certificate_name: '1234567890_cert-1.pdf', // ✅ file exists
    has_certificate: true,
    size: null,
    weight: null,
    note: null,
    serial_number: 'SN123',
    cost_price: null,
    consignment_price: null,
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
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    certificate: false,
    certificate_name: null,
    has_certificate: false,
    size: null,
    weight: null,
    note: null,
    serial_number: null,
    cost_price: null,
    consignment_price: null,
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
    created_at: '2024-01-03T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
    certificate: true,
    certificate_name: '1234567890_cert-3.pdf', // ✅ file exists
    has_certificate: true,
    size: null,
    weight: null,
    note: null,
    serial_number: null,
    cost_price: null,
    consignment_price: null,
  },
];

const mockItems: InstrumentWithClients[] = rawMockItems.map(item =>
  withNormalizedDefaults<Instrument>(item)
) as InstrumentWithClients[];

describe('useDashboardFilters', () => {
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

  it.skip('should filter by status', async () => {
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

  it.skip('should filter by certificate (S3 file-backed)', async () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.handleFilterChange('certificate', true);
    });

    await waitFor(() => {
      expect(result.current.filters.certificate).toEqual(['true']);
      expect(result.current.filteredItems).toHaveLength(2);
      expect(
        result.current.filteredItems.every(item =>
          Boolean(
            item.has_certificate ?? item.certificate_name ?? item.certificate
          )
        )
      ).toBe(true);
    });
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
    await waitFor(() => {
      expect(result.current.filteredItems.length).toBeGreaterThanOrEqual(1);
      expect(
        result.current.filteredItems.every(item => item.type === 'Violin')
      ).toBe(true);
    });

    act(() => {
      result.current.handleFilterChange('status', 'Available');
    });

    await waitFor(() => {
      expect(result.current.filters.status).toContain('Available');
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

    await waitFor(() => {
      expect(result.current.filteredItems).toHaveLength(0);
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

  it('keeps the full sorted result set before UI pagination', () => {
    const manyItems = Array.from({ length: 25 }, (_, index) => ({
      ...mockItems[0],
      id: `item-${index}`,
      maker: `Maker ${String(24 - index).padStart(2, '0')}`,
      created_at: `2024-01-${String((index % 25) + 1).padStart(2, '0')}T00:00:00Z`,
    }));
    const { result } = renderHook(() => useDashboardFilters(manyItems));

    act(() => {
      result.current.handleSort('maker');
    });

    expect(result.current.filteredItems).toHaveLength(25);
    expect(result.current.paginatedItems).toHaveLength(20);
    expect(result.current.filteredItems.map(item => item.maker)).toEqual(
      [...result.current.filteredItems]
        .map(item => item.maker)
        .sort((a, b) => (a ?? '').localeCompare(b ?? ''))
    );

    act(() => {
      result.current.setPage(2);
    });

    expect(result.current.filteredItems).toHaveLength(25);
    expect(result.current.paginatedItems).toHaveLength(5);
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

  it('S1-S3: matches exact, partial, and case-insensitive serial numbers', async () => {
    const items = [
      {
        ...mockItems[0],
        id: 'serial-1',
        maker: 'Vuillaume',
        type: 'Bow',
        subtype: 'Pernambuco',
        serial_number: 'SM703171000026',
        status: 'Available' as const,
      },
      {
        ...mockItems[1],
        id: 'serial-2',
        maker: 'Tourte',
        serial_number: 'AB999',
      },
    ];
    const { result } = renderHook(() => useDashboardFilters(items));

    act(() => {
      result.current.setSearchTerm('SM703171000026');
    });
    await waitFor(() => {
      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].serial_number).toBe(
        'SM703171000026'
      );
    });

    act(() => {
      result.current.setSearchTerm('3171000026');
    });
    await waitFor(() => {
      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].id).toBe('serial-1');
    });

    act(() => {
      result.current.setSearchTerm('sm703');
    });
    await waitFor(() => {
      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].id).toBe('serial-1');
    });
  });

  it('S4: returns no rows for a non-matching serial', async () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.setSearchTerm('NO-SUCH-SERIAL');
    });

    await waitFor(() => {
      expect(result.current.filteredItems).toHaveLength(0);
    });
  });

  it('S5: does not crash or match when serial_number is null', async () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.setSearchTerm('SN123');
    });

    await waitFor(() => {
      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].serial_number).toBe('SN123');
    });
  });

  it('S6: intersects serial search with the status filter', async () => {
    const items = [
      {
        ...mockItems[0],
        id: 'available-serial',
        serial_number: 'SM703171000026',
        status: 'Available' as const,
      },
      {
        ...mockItems[1],
        id: 'sold-serial',
        serial_number: 'SM703999',
        status: 'Sold' as const,
      },
    ];
    const { result } = renderHook(() => useDashboardFilters(items));

    act(() => {
      result.current.setSearchTerm('SM703');
      result.current.handleFilterChange('status', 'Available');
    });

    await waitFor(() => {
      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].id).toBe('available-serial');
      expect(result.current.filteredItems[0].status).toBe('Available');
    });
  });

  it('S7: still matches maker, type, and subtype search', async () => {
    const { result } = renderHook(() => useDashboardFilters(mockItems));

    act(() => {
      result.current.setSearchTerm('Cello');
    });
    await waitFor(() => {
      expect(result.current.filteredItems).toHaveLength(1);
      expect(result.current.filteredItems[0].type).toBe('Cello');
    });

    act(() => {
      result.current.setSearchTerm('4/4');
    });
    await waitFor(() => {
      // Assert subtype first so waitFor does not pass on the previous
      // one-item "Cello" result while search debounce is still pending.
      expect(result.current.filteredItems[0]?.subtype).toBe('4/4');
      expect(result.current.filteredItems).toHaveLength(1);
    });
  });

  it('S8: resets to page 1 when the search term changes', async () => {
    const manyItems = Array.from({ length: 41 }, (_, index) => ({
      ...mockItems[0],
      id: `item-${index}`,
      serial_number: `SN${String(index).padStart(4, '0')}`,
      maker: `Maker ${index}`,
    }));
    const { result } = renderHook(() => useDashboardFilters(manyItems));

    act(() => {
      result.current.setPage(2);
    });
    expect(result.current.currentPage).toBe(2);

    act(() => {
      result.current.setSearchTerm('Maker 0');
    });

    await waitFor(() => {
      expect(result.current.currentPage).toBe(1);
      expect(result.current.filteredItems.length).toBeGreaterThan(0);
    });
  });

  function makePagedItems(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      ...mockItems[0],
      id: `paged-${index}`,
      maker: `Maker ${String(index).padStart(3, '0')}`,
      serial_number: `SN${String(index).padStart(4, '0')}`,
    }));
  }

  it('P1: 41 → 40 on page 3 clamps to page 2 with items', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useDashboardFilters(items),
      { initialProps: { items: makePagedItems(41) } }
    );

    act(() => {
      result.current.setPage(3);
    });
    expect(result.current.currentPage).toBe(3);
    expect(result.current.paginatedItems).toHaveLength(1);

    rerender({ items: makePagedItems(40) });

    expect(result.current.totalPages).toBe(2);
    expect(result.current.currentPage).toBe(2);
    expect(result.current.paginatedItems).toHaveLength(20);
  });

  it('P2: 21 → 20 on page 2 clamps to page 1', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useDashboardFilters(items),
      { initialProps: { items: makePagedItems(21) } }
    );

    act(() => {
      result.current.setPage(2);
    });
    expect(result.current.paginatedItems).toHaveLength(1);

    rerender({ items: makePagedItems(20) });

    expect(result.current.currentPage).toBe(1);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.paginatedItems).toHaveLength(20);
  });

  it('P3: deleting one item on a still-valid last page stays on that page', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useDashboardFilters(items),
      { initialProps: { items: makePagedItems(45) } }
    );

    act(() => {
      result.current.setPage(3);
    });
    expect(result.current.paginatedItems).toHaveLength(5);

    rerender({ items: makePagedItems(44) });

    expect(result.current.currentPage).toBe(3);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.paginatedItems).toHaveLength(4);
  });

  it('P4: deleting the last remaining item stays on page 1 empty', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useDashboardFilters(items),
      { initialProps: { items: makePagedItems(1) } }
    );

    expect(result.current.currentPage).toBe(1);

    rerender({ items: [] });

    expect(result.current.currentPage).toBe(1);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.paginatedItems).toHaveLength(0);
  });

  it('P5: shrinking multiple pages at once clamps to the new last page', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useDashboardFilters(items),
      { initialProps: { items: makePagedItems(100) } }
    );

    act(() => {
      result.current.setPage(5);
    });
    expect(result.current.currentPage).toBe(5);

    rerender({ items: makePagedItems(15) });

    expect(result.current.currentPage).toBe(1);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.paginatedItems).toHaveLength(15);
  });

  it('P6: does not render an empty slice solely because currentPage exceeded totalPages', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useDashboardFilters(items),
      { initialProps: { items: makePagedItems(41) } }
    );

    act(() => {
      result.current.setPage(3);
    });

    rerender({ items: makePagedItems(40) });

    expect(result.current.paginatedItems).not.toHaveLength(0);
    expect(result.current.currentPage).toBeLessThanOrEqual(
      result.current.totalPages
    );
  });

  it('P7: manual navigation still clamps to 1..totalPages', () => {
    const { result } = renderHook(() =>
      useDashboardFilters(makePagedItems(41))
    );

    act(() => {
      result.current.setPage(0);
    });
    expect(result.current.currentPage).toBe(1);

    act(() => {
      result.current.setPage(999);
    });
    expect(result.current.currentPage).toBe(3);

    act(() => {
      result.current.setPage(2);
    });
    expect(result.current.currentPage).toBe(2);
    expect(result.current.paginatedItems).toHaveLength(20);
  });

  it('P8: filter changes still reset pagination to page 1', () => {
    const { result } = renderHook(() =>
      useDashboardFilters(makePagedItems(45))
    );

    act(() => {
      result.current.setPage(3);
    });
    expect(result.current.currentPage).toBe(3);

    act(() => {
      result.current.handleFilterChange('status', 'Available');
    });

    expect(result.current.currentPage).toBe(1);
  });

  it('D14: valid clientId filtering remains unchanged', () => {
    const { useSearchParams } = require('next/navigation');
    (useSearchParams as jest.Mock).mockReturnValue(
      new URL('http://localhost/dashboard?clientId=client-1').searchParams
    );

    const items = [
      {
        ...mockItems[0],
        id: 'with-client',
        clients: [
          {
            id: 'rel-1',
            client_id: 'client-1',
            instrument_id: 'with-client',
            relationship_type: 'Sold' as const,
            notes: null,
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      },
      {
        ...mockItems[1],
        id: 'without-client',
        clients: [],
      },
    ];

    const { result } = renderHook(() => useDashboardFilters(items));

    expect(result.current.filteredItems).toHaveLength(1);
    expect(result.current.filteredItems[0].id).toBe('with-client');

    (useSearchParams as jest.Mock).mockReturnValue(
      new URL('http://localhost/dashboard').searchParams
    );
  });
});
