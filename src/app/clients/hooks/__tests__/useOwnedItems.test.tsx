import { renderHook, act } from '@testing-library/react';
import { useOwnedItems } from '../useOwnedItems';
import { Client, Instrument } from '@/types';
import { flushPromises } from '../../../../../tests/utils/flushPromises';

// Mock fetch API (replacing direct Supabase calls)
global.fetch = jest.fn();

// Mock logger
jest.mock('@/utils/logger', () => ({
  logError: jest.fn(),
}));

const mockClient: Client = {
  id: '1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '123-456-7890',
  tags: [],
  interest: null,
  note: null,
  client_number: 'CL001',
  created_at: '2023-01-01T00:00:00Z',
};

const mockOwnedItems: Instrument[] = [
  {
    id: '1',
    maker: 'Stradivari',
    type: 'Violin',
    subtype: null,
    year: 1700,
    certificate: true,
    size: null,
    weight: null,
    price: null,
    ownership: 'John Doe',
    note: null,
    serial_number: 'VI0000001',
    status: 'Available',
    created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: '2',
    maker: 'Guarneri',
    type: 'Violin',
    subtype: null,
    year: 1750,
    certificate: false,
    size: null,
    weight: null,
    price: null,
    ownership: 'John Doe',
    note: null,
    serial_number: 'VI0000002',
    status: 'Available',
    created_at: '2023-01-02T00:00:00Z',
  },
];

describe('useOwnedItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: mockOwnedItems,
        count: mockOwnedItems.length,
      }),
    });
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useOwnedItems());

    expect(result.current.ownedItems).toEqual([]);
    expect(result.current.loadingOwnedItems).toBe(false);
  });

  it('should fetch owned items successfully', async () => {
    const { result } = renderHook(() => useOwnedItems());

    await act(async () => {
      await result.current.fetchOwnedItems(mockClient);
      await flushPromises();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/api\/instruments\?ownership=John\+Doe|John%20Doe.*orderBy=created_at.*ascending=false/
      )
    );
    expect(result.current.ownedItems).toEqual(mockOwnedItems);
    expect(result.current.loadingOwnedItems).toBe(false);
  });

  it('should set loading state during fetch', async () => {
    const { result } = renderHook(() => useOwnedItems());

    let resolveFetch: (value: Response) => void;
    const fetchPromise = new Promise<Response>(resolve => {
      resolveFetch = resolve;
    });

    (global.fetch as jest.Mock).mockImplementationOnce(() => fetchPromise);

    const promise = result.current.fetchOwnedItems(mockClient);

    // 상태 업데이트가 비동기적으로 발생하므로 잠시 대기
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(result.current.loadingOwnedItems).toBe(true);

    await act(async () => {
      resolveFetch!({
        ok: true,
        json: async () => ({
          data: mockOwnedItems,
          count: mockOwnedItems.length,
        }),
      } as Response);
      await promise;
      await flushPromises();
    });

    expect(result.current.loadingOwnedItems).toBe(false);
  });

  it('should handle fetch errors', async () => {
    const { logError } = require('@/utils/logger');
    const { result } = renderHook(() => useOwnedItems());

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      statusText: 'Fetch failed',
    });

    await act(async () => {
      await result.current.fetchOwnedItems(mockClient);
      await flushPromises();
    });

    expect(logError).toHaveBeenCalled();
    expect(result.current.ownedItems).toEqual([]);
    expect(result.current.loadingOwnedItems).toBe(false);
  });

  it('should handle null data response', async () => {
    const { result } = renderHook(() => useOwnedItems());

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: null,
        count: 0,
      }),
    });

    await act(async () => {
      await result.current.fetchOwnedItems(mockClient);
      await flushPromises();
    });

    expect(result.current.ownedItems).toEqual([]);
  });

  it('should clear owned items', () => {
    const { result } = renderHook(() => useOwnedItems());

    act(() => {
      result.current.clearOwnedItems();
    });

    expect(result.current.ownedItems).toEqual([]);
  });

  it('should handle exception during fetch', async () => {
    const { logError } = require('@/utils/logger');
    const { result } = renderHook(() => useOwnedItems());

    const exception = new Error('Network error');
    (global.fetch as jest.Mock).mockRejectedValueOnce(exception);

    await act(async () => {
      await result.current.fetchOwnedItems(mockClient);
      await flushPromises();
    });

    expect(logError).toHaveBeenCalled();
    expect(result.current.ownedItems).toEqual([]);
    expect(result.current.loadingOwnedItems).toBe(false);
  });

  it('should format client name correctly for ownership query', async () => {
    const { result } = renderHook(() => useOwnedItems());

    await act(async () => {
      await result.current.fetchOwnedItems(mockClient);
      await flushPromises();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/ownership=John\+Doe|John%20Doe/)
    );
  });

  it('should handle client with different name', async () => {
    const { result } = renderHook(() => useOwnedItems());
    const differentClient: Client = {
      ...mockClient,
      first_name: 'Jane',
      last_name: 'Smith',
    };

    await act(async () => {
      await result.current.fetchOwnedItems(differentClient);
      await flushPromises();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/ownership=Jane\+Smith|Jane%20Smith/)
    );
  });
});
