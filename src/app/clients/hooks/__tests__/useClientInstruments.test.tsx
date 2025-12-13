import { renderHook, act } from '@testing-library/react';
import { useClientInstruments } from '../useClientInstruments';
import { Client, ClientInstrument, Instrument } from '@/types';
import { flushPromises } from '../../../../../tests/utils/flushPromises';

const mockClient: Client = {
  id: '1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '123-456-7890',
  tags: ['Musician'],
  interest: 'Active',
  note: 'Test client',
  client_number: null,
  created_at: '2023-01-01T00:00:00Z',
};

const mockInstrument: Instrument = {
  id: '1',
  status: 'Available',
  maker: 'Stradivari',
  type: 'Violin',
  subtype: null,
  year: 1700,
  certificate: true,
  size: '4/4',
  weight: '500g',
  price: 1000000,
  ownership: 'Museum',
  note: 'Famous violin',
  serial_number: null,
  created_at: '2023-01-01T00:00:00Z',
};

const mockInstrumentRelationship: ClientInstrument = {
  id: '1',
  client_id: '1',
  instrument_id: '1',
  relationship_type: 'Interested',
  notes: 'Test relationship',
  created_at: '2023-01-01T00:00:00Z',
  client: mockClient,
  instrument: mockInstrument,
};

const mockFetchResponse = (data: unknown, ok = true) =>
  Promise.resolve({
    ok,
    json: () => Promise.resolve(data),
  });

describe('useClientInstruments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn(() => mockFetchResponse({ data: [] }));
  });

  it('initializes with default values', async () => {
    const { result } = renderHook(() => useClientInstruments());

    expect(result.current.instrumentRelationships).toEqual([]);
    expect(result.current.clientsWithInstruments).toEqual(new Set());
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await flushPromises();
    });
  });

  it('fetches instrument relationships', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      mockFetchResponse({ data: [mockInstrumentRelationship] })
    );

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });

    expect(result.current.instrumentRelationships).toHaveLength(1);
    expect(result.current.clientsWithInstruments.has('1')).toBe(true);
  });

  it('handles fetch error', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: new Error('Fetch failed') }),
      })
    );

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });

    expect(result.current.instrumentRelationships).toEqual([]);
  });

  it('adds instrument relationship', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      mockFetchResponse({ data: mockInstrumentRelationship })
    );

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.addInstrumentRelationship('1', '1', 'Interested');
    });

    expect(result.current.instrumentRelationships).toHaveLength(1);
    expect(result.current.clientsWithInstruments.has('1')).toBe(true);
  });

  it('handles add relationship error', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: new Error('Add failed') }),
      })
    );

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.addInstrumentRelationship('1', '1', 'Interested');
    });

    expect(result.current.instrumentRelationships).toEqual([]);
  });

  it('removes instrument relationship', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockFetchResponse({ data: [mockInstrumentRelationship] })
      ) // fetchInstrumentRelationships
      .mockResolvedValueOnce(mockFetchResponse({ data: null })); // removeInstrumentRelationship

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });
    expect(result.current.instrumentRelationships).toHaveLength(1);

    await act(async () => {
      await result.current.removeInstrumentRelationship('1');
    });

    expect(result.current.instrumentRelationships).toHaveLength(0);
    expect(result.current.clientsWithInstruments.has('1')).toBe(false);
  });

  it('handles remove relationship error', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: new Error('Remove failed') }),
      })
    );

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.removeInstrumentRelationship('1');
    });

    expect(result.current.instrumentRelationships).toEqual([]);
  });

  it('updates clients with instruments set correctly', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(
      mockFetchResponse({ data: [mockInstrumentRelationship] })
    );

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });

    expect(result.current.clientsWithInstruments.has('1')).toBe(true);
  });

  it('removes client from set when no relationships remain', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockFetchResponse({ data: [mockInstrumentRelationship] })
      )
      .mockResolvedValueOnce(mockFetchResponse({ data: null }));

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });
    expect(result.current.clientsWithInstruments.has('1')).toBe(true);

    await act(async () => {
      await result.current.removeInstrumentRelationship('1');
    });

    expect(result.current.clientsWithInstruments.has('1')).toBe(false);
  });

  it('keeps client in set when other relationships exist', async () => {
    const rel2 = { ...mockInstrumentRelationship, id: '2' };
    (fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockFetchResponse({ data: [mockInstrumentRelationship, rel2] })
      )
      .mockResolvedValueOnce(mockFetchResponse({ data: null }));

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });
    expect(result.current.clientsWithInstruments.has('1')).toBe(true);

    await act(async () => {
      await result.current.removeInstrumentRelationship('1');
    });

    expect(result.current.clientsWithInstruments.has('1')).toBe(true);
  });

  it('handles loading states correctly', async () => {
    let resolveJson: (value: unknown) => void;
    const jsonPromise = new Promise(resolve => {
      resolveJson = resolve;
    });

    (fetch as jest.Mock).mockResolvedValueOnce(
      Promise.resolve({
        ok: true,
        json: () => jsonPromise,
      })
    );

    const { result } = renderHook(() => useClientInstruments());

    expect(result.current.loading).toBe(false);

    act(() => {
      result.current.fetchInstrumentRelationships('1');
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveJson!({ data: [] });
      await flushPromises();
    });

    expect(result.current.loading).toBe(false);
  });

  it('clears error when new operation succeeds', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce(
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: new Error('First error') }),
        })
      )
      .mockResolvedValueOnce(mockFetchResponse({ data: [] }));

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });
    expect(result.current.instrumentRelationships).toEqual([]);

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });

    expect(result.current.instrumentRelationships).toEqual([]);
  });
});
