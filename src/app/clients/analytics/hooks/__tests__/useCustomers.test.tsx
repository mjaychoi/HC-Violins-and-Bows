import { renderHook, act } from '@/test-utils/render';
import { useCustomers } from '../useCustomers';
import { waitFor } from '@/test-utils/render';

const mockClients = [
  {
    id: 'c1',
    first_name: 'Jane',
    last_name: 'Kim',
    email: 'jane@example.com',
    tags: ['VIP'],
    created_at: '2024-01-01',
  },
  {
    id: 'c2',
    first_name: 'Minho',
    last_name: 'Lee',
    email: 'minho@example.com',
    tags: ['Musician', 'New'],
    created_at: '2024-02-01',
  },
  {
    id: 'c3',
    first_name: 'Ara',
    last_name: 'Park',
    email: 'ara@example.com',
    tags: ['Collector'],
    created_at: '2024-03-01',
  },
];

const salesData = [
  {
    id: 's1',
    client_id: 'c1',
    instrument_id: 'i1',
    sale_price: 100000,
    sale_date: '2024-05-12',
    notes: null,
    created_at: '2024-05-12',
  },
  {
    id: 's2',
    client_id: 'c1',
    instrument_id: 'i2',
    sale_price: 58000,
    sale_date: '2024-04-10',
    notes: null,
    created_at: '2024-04-10',
  },
  {
    id: 's3',
    client_id: 'c2',
    instrument_id: 'i2',
    sale_price: 60500,
    sale_date: '2024-06-01',
    notes: null,
    created_at: '2024-06-01',
  },
];

const instrumentsData = [
  {
    id: 'i1',
    maker: 'Maker1',
    type: 'Violin',
    subtype: null,
    serial_number: 'VI0000001',
    created_at: '2024-01-01',
  },
  {
    id: 'i2',
    maker: 'Maker2',
    type: 'Violin',
    subtype: null,
    serial_number: 'VI0000002',
    created_at: '2024-01-02',
  },
];

jest.mock('@/hooks/useUnifiedData', () => ({
  useUnifiedClients: () => ({
    clients: mockClients,
    loading: false,
  }),
}));

// ✅ FIXED: ToastProvider도 export하도록 mock 수정
jest.mock('@/contexts/ToastContext', () => {
  const actual = jest.requireActual('@/contexts/ToastContext');
  return {
    ...actual,
    useErrorHandler: () => ({
      handleError: jest.fn(),
    }),
  };
});

beforeEach(() => {
  // FIXED: Use mockResolvedValue instead of mockResolvedValueOnce to reset for each test
  (global.fetch as unknown) = jest.fn((url: string) => {
    if (url.includes('/api/sales')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: salesData }),
      } as Response);
    }
    if (url.includes('/api/instruments')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: instrumentsData }),
      } as Response);
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
});

describe('useCustomers', () => {
  it('should initialize with default values', () => {
    const { result } = renderHook(() => useCustomers());

    expect(result.current.searchTerm).toBe('');
    expect(result.current.tagFilter).toBeNull();
    expect(result.current.sortBy).toBe('name');
    expect(result.current.rawCustomers).toHaveLength(3);
    expect(result.current.availableTags).toContain('VIP');
    expect(result.current.availableTags).toContain('Musician');
    expect(result.current.availableTags).toContain('Collector');
  });

  it('should filter customers by search term', () => {
    const { result } = renderHook(() => useCustomers());

    act(() => {
      result.current.setSearchTerm('Jane');
    });

    expect(result.current.customers).toHaveLength(1);
    expect(result.current.customers[0].first_name).toBe('Jane');
  });

  it('should filter customers by email', () => {
    const { result } = renderHook(() => useCustomers());

    act(() => {
      result.current.setSearchTerm('jane@example.com');
    });

    expect(result.current.customers).toHaveLength(1);
    expect(result.current.customers[0].email).toBe('jane@example.com');
  });

  it('should filter customers by tag', () => {
    const { result } = renderHook(() => useCustomers());

    act(() => {
      result.current.setSearchTerm('VIP');
    });

    expect(result.current.customers.length).toBeGreaterThan(0);
    expect(result.current.customers.every(c => c.tags.includes('VIP'))).toBe(
      true
    );
  });

  it('should filter customers by tagFilter', () => {
    const { result } = renderHook(() => useCustomers());

    act(() => {
      result.current.setTagFilter('VIP');
    });

    expect(result.current.customers).toHaveLength(1);
    expect(result.current.customers[0].tags).toContain('VIP');
  });

  it('should return all customers when tagFilter is null', () => {
    const { result } = renderHook(() => useCustomers());

    act(() => {
      result.current.setTagFilter(null);
    });

    expect(result.current.customers).toHaveLength(3);
  });

  it('should sort customers by name', () => {
    const { result } = renderHook(() => useCustomers());

    act(() => {
      result.current.setSortBy('name');
    });

    const customers = result.current.customers;
    expect(customers[0].first_name).toBe('Ara');
    expect(customers[1].first_name).toBe('Jane');
    expect(customers[2].first_name).toBe('Minho');
  });

  it('should sort customers by total spend', () => {
    const { result } = renderHook(() => useCustomers());

    act(() => {
      result.current.setSortBy('spend');
    });

    const customers = result.current.customers;
    // Jane has 158000, Minho has 60500, Ara has 0
    expect(customers[0].first_name).toBe('Jane');
    expect(customers[1].first_name).toBe('Minho');
    expect(customers[2].first_name).toBe('Ara');
  });

  it('should sort customers by recent activity', async () => {
    const { result } = renderHook(() => useCustomers());

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.customers.length).toBeGreaterThan(0);
    });

    act(() => {
      result.current.setSortBy('recent');
    });

    await waitFor(() => {
      const customers = result.current.customers;
      expect(customers.length).toBe(3);

      // Based on test data:
      // - Minho (c2): purchase date 2024-06-01 (most recent)
      // - Jane (c1): purchase dates 2024-05-12, 2024-04-10 → most recent: 2024-05-12
      // - Ara (c3): no purchases → uses created_at: 2024-03-01
      // Expected order: Minho (2024-06-01) > Jane (2024-05-12) > Ara (2024-03-01)

      // Verify Minho has purchase data
      const minho = customers.find(c => c.first_name === 'Minho');
      expect(minho).toBeDefined();
      expect(minho?.purchases.length).toBeGreaterThan(0);

      // Verify Jane has purchase data
      const jane = customers.find(c => c.first_name === 'Jane');
      expect(jane).toBeDefined();
      expect(jane?.purchases.length).toBeGreaterThan(0);

      // Verify Ara has no purchases
      const ara = customers.find(c => c.first_name === 'Ara');
      expect(ara).toBeDefined();
      expect(ara?.purchases.length).toBe(0);

      // Minho should be first (most recent purchase: 2024-06-01)
      expect(customers[0].first_name).toBe('Minho');
      // Jane should be second (most recent purchase: 2024-05-12)
      expect(customers[1].first_name).toBe('Jane');
      // Ara should be last (no purchases, uses created_at: 2024-03-01)
      expect(customers[2].first_name).toBe('Ara');
    });
  });

  it('should combine search and tag filter', () => {
    const { result } = renderHook(() => useCustomers());

    act(() => {
      result.current.setSearchTerm('Jane');
      result.current.setTagFilter('VIP');
    });

    expect(result.current.customers).toHaveLength(1);
    expect(result.current.customers[0].first_name).toBe('Jane');
    expect(result.current.customers[0].tags).toContain('VIP');
  });

  it('should select first customer by default', () => {
    const { result } = renderHook(() => useCustomers());

    expect(result.current.selectedCustomer).not.toBeNull();
    expect(result.current.selectedCustomerId).toBe(
      result.current.customers[0].id
    );
  });

  it('should update selectedCustomerId', () => {
    const { result } = renderHook(() => useCustomers());

    act(() => {
      result.current.setSelectedCustomerId('c2');
    });

    expect(result.current.selectedCustomerId).toBe('c2');
    expect(result.current.selectedCustomer?.id).toBe('c2');
  });

  it('should update selectedCustomer when filtered customers change', async () => {
    const { result } = renderHook(() => useCustomers());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setSelectedCustomerId('c1');
      result.current.setTagFilter('New');
    });

    await waitFor(() => {
      expect(result.current.selectedCustomer?.id).toBe('c2');
    });
  });

  it('should handle case-insensitive search', () => {
    const { result } = renderHook(() => useCustomers());

    act(() => {
      result.current.setSearchTerm('JANE');
    });

    expect(result.current.customers).toHaveLength(1);
    expect(result.current.customers[0].first_name).toBe('Jane');
  });

  it('should handle empty search term', () => {
    const { result } = renderHook(() => useCustomers());

    act(() => {
      result.current.setSearchTerm('');
    });

    expect(result.current.customers).toHaveLength(3);
  });

  it('should extract available tags from all customers', () => {
    const { result } = renderHook(() => useCustomers());

    const tags = result.current.availableTags;
    expect(tags).toContain('VIP');
    expect(tags).toContain('Musician');
    expect(tags).toContain('Collector');
    expect(tags).toContain('New');
  });
});
