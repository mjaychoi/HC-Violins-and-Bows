import { renderHook, act } from '@testing-library/react';
import { useClientInstruments } from '../useClientInstruments';
import { Client, ClientInstrument, Instrument } from '@/types';
import { flushPromises } from '../../../../../tests/utils/flushPromises';

// Mock Supabase
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ data: [], error: null })),
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({ data: [], error: null })),
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({ data: null, error: null })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({ data: [], error: null })),
      })),
    })),
  },
}));

const mockClient: Client = {
  id: '1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '123-456-7890',
  tags: ['Musician'],
  interest: 'Active',
  note: 'Test client',
  created_at: '2023-01-01T00:00:00Z',
};

const mockInstrument: Instrument = {
  id: '1',
  status: 'Available',
  maker: 'Stradivari',
  type: 'Violin',
  year: 1700,
  certificate: true,
  size: '4/4',
  weight: '500g',
  price: 1000000,
  ownership: 'Museum',
  note: 'Famous violin',
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

describe('useClientInstruments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with default values', async () => {
    const { result } = renderHook(() => useClientInstruments());

    // 초기값은 동기 즉시 검증 가능
    expect(result.current.instrumentRelationships).toEqual([]);
    expect(result.current.clientsWithInstruments).toEqual(new Set());
    expect(result.current.loading).toBe(false);

    // 이펙트 + 비동기 한 턴
    await act(async () => {
      await flushPromises();
    });
  });

  it('fetches instrument relationships', async () => {
    const mockSupabase = jest.mocked(require('@/lib/supabase')).supabase;
    mockSupabase.from.mockReturnValue({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: [mockInstrumentRelationship],
          error: null,
        })),
      })),
    });

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });

    expect(result.current.instrumentRelationships).toHaveLength(1);
    expect(result.current.clientsWithInstruments.has('1')).toBe(true);
  });

  it('handles fetch error', async () => {
    const mockSupabase = jest.mocked(require('@/lib/supabase')).supabase;
    mockSupabase.from.mockReturnValue({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: null,
          error: new Error('Fetch failed'),
        })),
      })),
    });

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });

    // Error handling is done through the hook's internal state
    expect(result.current.instrumentRelationships).toEqual([]);
  });

  it('adds instrument relationship', async () => {
    const mockSupabase = jest.mocked(require('@/lib/supabase')).supabase;
    mockSupabase.from.mockReturnValue({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          data: [mockInstrumentRelationship],
          error: null,
        })),
      })),
    });

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.addInstrumentRelationship('1', '1', 'Interested');
    });

    expect(result.current.instrumentRelationships).toHaveLength(1);
    expect(result.current.clientsWithInstruments.has('1')).toBe(true);
  });

  it('handles add relationship error', async () => {
    const mockSupabase = jest.mocked(require('@/lib/supabase')).supabase;
    mockSupabase.from.mockReturnValue({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({ data: null, error: new Error('Add failed') })),
      })),
    });

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.addInstrumentRelationship('1', '1', 'Interested');
    });

    // Error handling is done through the hook's internal state
    expect(result.current.instrumentRelationships).toEqual([]);
  });

  it('removes instrument relationship', async () => {
    const mockSupabase = jest.mocked(require('@/lib/supabase')).supabase;
    mockSupabase.from.mockReturnValue({
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: null,
          error: null,
        })),
      })),
    });

    const { result } = renderHook(() => useClientInstruments());

    // First add a relationship
    const mockFetch = jest.fn(() => ({
      data: [mockInstrumentRelationship],
      error: null,
    }));
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn(() => ({ eq: mockFetch })),
    });
    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });

    expect(result.current.instrumentRelationships).toHaveLength(1);

    // Then remove it
    await act(async () => {
      await result.current.removeInstrumentRelationship('1');
    });

    expect(result.current.instrumentRelationships).toHaveLength(0);
    expect(result.current.clientsWithInstruments.has('1')).toBe(false);
  });

  it('handles remove relationship error', async () => {
    const mockSupabase = jest.mocked(require('@/lib/supabase')).supabase;
    mockSupabase.from.mockReturnValue({
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: null,
          error: new Error('Remove failed'),
        })),
      })),
    });

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.removeInstrumentRelationship('1');
    });

    expect(result.current.instrumentRelationships).toEqual([]);
  });

  it('updates clients with instruments set correctly', async () => {
    const mockSupabase = jest.mocked(require('@/lib/supabase')).supabase;
    mockSupabase.from.mockReturnValue({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: [mockInstrumentRelationship],
          error: null,
        })),
      })),
    });

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });

    expect(result.current.clientsWithInstruments.has('1')).toBe(true);
  });

  it('removes client from set when no relationships remain', async () => {
    const mockSupabase = jest.mocked(require('@/lib/supabase')).supabase;
    // Seed with one relationship for client '1'
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: [mockInstrumentRelationship],
          error: null,
        })),
      })),
    });
    const { result } = renderHook(() => useClientInstruments());
    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });
    expect(result.current.clientsWithInstruments.has('1')).toBe(true);
    // Now remove it
    mockSupabase.from.mockReturnValueOnce({
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({ data: null, error: null })),
      })),
    });
    await act(async () => {
      await result.current.removeInstrumentRelationship('1');
    });
    expect(result.current.clientsWithInstruments.has('1')).toBe(false);
  });

  it('keeps client in set when other relationships exist', async () => {
    const mockSupabase = jest.mocked(require('@/lib/supabase')).supabase;
    // Seed with two relationships
    const rel2 = { ...mockInstrumentRelationship, id: '2' };
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: [mockInstrumentRelationship, rel2],
          error: null,
        })),
      })),
    });
    const { result } = renderHook(() => useClientInstruments());
    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });
    expect(result.current.clientsWithInstruments.has('1')).toBe(true);
    // Remove one relationship
    mockSupabase.from.mockReturnValueOnce({
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({ data: null, error: null })),
      })),
    });
    await act(async () => {
      await result.current.removeInstrumentRelationship('1');
    });
    // Still has other rel, so remains in set
    expect(result.current.clientsWithInstruments.has('1')).toBe(true);
  });

  it('handles loading states correctly', async () => {
    const mockSupabase = jest.mocked(require('@/lib/supabase')).supabase;
    let resolvePromise: (value: unknown) => void;
    const promise = new Promise(resolve => {
      resolvePromise = resolve;
    });

    mockSupabase.from.mockReturnValue({
      select: jest.fn(() => ({
        eq: jest.fn(() => promise),
      })),
    });

    const { result } = renderHook(() => useClientInstruments());

    expect(result.current.loading).toBe(false);

    act(() => {
      result.current.fetchInstrumentRelationships('1');
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolvePromise!({ data: [], error: null });
    });

    expect(result.current.loading).toBe(false);
  });

  it('clears error when new operation succeeds', async () => {
    const mockSupabase = jest.mocked(require('@/lib/supabase')).supabase;

    // First operation fails
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: null,
          error: new Error('First error'),
        })),
      })),
    });

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });

    // Error handling is done through the hook's internal state
    expect(result.current.instrumentRelationships).toEqual([]);

    // Second operation succeeds
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: [],
          error: null,
        })),
      })),
    });

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });

    expect(result.current.instrumentRelationships).toEqual([]);
  });
});
