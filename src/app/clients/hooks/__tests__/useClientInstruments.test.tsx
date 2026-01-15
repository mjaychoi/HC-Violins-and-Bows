import { renderHook, act } from '@/test-utils/render';
import { useClientInstruments } from '../useClientInstruments';
import { Client, ClientInstrument, Instrument } from '@/types';
import { flushPromises } from '../../../../../tests/utils/flushPromises';
import { withNormalizedDefaults } from '@/test/fixtures/rows';

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

const mockInstrument = withNormalizedDefaults<Instrument>({
  id: '1',
  status: 'Available',
  maker: 'Stradivari',
  type: 'Violin',
  subtype: '4/4',
  year: 1700,
  certificate: true,
  size: '4/4',
  weight: '500g',
  price: 1000000,
  ownership: 'Museum',
  note: 'Famous violin',
  serial_number: 'STR001',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
});

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

// ✅ FIXED: DataContext mock (hook이 DataContext를 사용하도록 변경됨)
// jest.mock은 호이스팅되므로 함수를 사용하여 동적으로 접근
const mockConnectionsRef = { current: [] as ClientInstrument[] };
const mockCreateConnection = jest.fn();
const mockUpdateConnection = jest.fn();
const mockDeleteConnection = jest.fn();

jest.mock('@/hooks/useUnifiedData', () => {
  const actual = jest.requireActual('@/hooks/useUnifiedData');
  return {
    ...actual,
    useUnifiedConnections: jest.fn(() => {
      // ✅ FIXED: 매번 호출될 때마다 현재 connections 반환
      return {
        connections: mockConnectionsRef.current,
      };
    }),
    useConnectedClientsData: jest.fn(() => ({
      createConnection: mockCreateConnection,
      updateConnection: mockUpdateConnection,
      deleteConnection: mockDeleteConnection,
    })),
  };
});

describe('useClientInstruments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnectionsRef.current = [];
    mockCreateConnection.mockResolvedValue(mockInstrumentRelationship);
    mockUpdateConnection.mockResolvedValue(null);
    mockDeleteConnection.mockResolvedValue(true);
  });

  it('initializes with default values', async () => {
    const { result } = renderHook(() => useClientInstruments());

    expect(result.current.instrumentRelationships).toEqual([]);
    expect(result.current.clientsWithInstruments).toEqual(new Set());

    await act(async () => {
      await flushPromises();
    });
  });

  it('returns instrument relationships from DataContext', async () => {
    // DataContext를 통해 connections 설정
    mockConnectionsRef.current = [mockInstrumentRelationship];

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.instrumentRelationships).toHaveLength(1);
    expect(result.current.clientsWithInstruments.has('1')).toBe(true);
  });

  it('returns empty relationships when DataContext has no connections', async () => {
    mockConnectionsRef.current = [];

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.instrumentRelationships).toEqual([]);
  });

  it('adds instrument relationship', async () => {
    // ✅ FIXED: createConnection이 호출되고, 성공 시 connections에 추가됨
    mockCreateConnection.mockResolvedValue(mockInstrumentRelationship);
    mockConnectionsRef.current = [];

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.addInstrumentRelationship('1', '1', 'Interested');
    });

    expect(mockCreateConnection).toHaveBeenCalledWith(
      '1',
      '1',
      'Interested',
      ''
    );
    // ✅ FIXED: DataContext가 업데이트되면 connections도 업데이트됨 (테스트에서는 수동으로 설정)
    mockConnectionsRef.current = [mockInstrumentRelationship];
    // hook을 다시 렌더링하여 업데이트된 connections 반영
    const { result: result2 } = renderHook(() => useClientInstruments());
    expect(result2.current.instrumentRelationships).toHaveLength(1);
    expect(result2.current.clientsWithInstruments.has('1')).toBe(true);
  });

  it('handles add relationship error', async () => {
    // ✅ FIXED: createConnection이 실패하면 null 반환
    mockCreateConnection.mockResolvedValue(null);
    mockConnectionsRef.current = [];

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.addInstrumentRelationship('1', '1', 'Interested');
    });

    expect(mockCreateConnection).toHaveBeenCalled();
    expect(result.current.instrumentRelationships).toEqual([]);
  });

  it('removes instrument relationship', async () => {
    // DataContext를 통해 connections 설정
    mockConnectionsRef.current = [mockInstrumentRelationship];
    mockDeleteConnection.mockResolvedValue(true);

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await flushPromises();
    });
    expect(result.current.instrumentRelationships).toHaveLength(1);

    await act(async () => {
      await result.current.removeInstrumentRelationship('1');
    });

    expect(mockDeleteConnection).toHaveBeenCalledWith('1');
    // DataContext가 업데이트되면 connections도 업데이트됨
    mockConnectionsRef.current = [];
    const { result: result2 } = renderHook(() => useClientInstruments());
    await act(async () => {
      await flushPromises();
    });
    expect(result2.current.instrumentRelationships).toHaveLength(0);
    expect(result2.current.clientsWithInstruments.has('1')).toBe(false);
  });

  it('handles remove relationship error', async () => {
    // ✅ FIXED: deleteConnection이 실패하면 false 반환
    mockDeleteConnection.mockResolvedValue(false);
    mockConnectionsRef.current = [mockInstrumentRelationship];

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.removeInstrumentRelationship('1');
    });

    expect(mockDeleteConnection).toHaveBeenCalledWith('1');
    // 실패 시 connections는 그대로 유지됨
    expect(result.current.instrumentRelationships).toHaveLength(1);
  });

  it('updates clients with instruments set correctly', async () => {
    // DataContext를 통해 connections 설정
    mockConnectionsRef.current = [mockInstrumentRelationship];

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.clientsWithInstruments.has('1')).toBe(true);
  });

  it('removes client from set when no relationships remain', async () => {
    // DataContext를 통해 connections 설정
    mockConnectionsRef.current = [mockInstrumentRelationship];
    mockDeleteConnection.mockResolvedValue(true);

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await flushPromises();
    });
    expect(result.current.clientsWithInstruments.has('1')).toBe(true);

    await act(async () => {
      await result.current.removeInstrumentRelationship('1');
    });

    expect(mockDeleteConnection).toHaveBeenCalledWith('1');
    // DataContext가 업데이트되면 connections도 업데이트됨
    mockConnectionsRef.current = [];
    const { result: result2 } = renderHook(() => useClientInstruments());
    await act(async () => {
      await flushPromises();
    });
    expect(result2.current.clientsWithInstruments.has('1')).toBe(false);
  });

  it('keeps client in set when other relationships exist', async () => {
    // DataContext를 통해 connections 설정
    const rel2 = { ...mockInstrumentRelationship, id: '2' };
    mockConnectionsRef.current = [mockInstrumentRelationship, rel2];
    mockDeleteConnection.mockResolvedValue(true);

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await flushPromises();
    });
    expect(result.current.clientsWithInstruments.has('1')).toBe(true);

    await act(async () => {
      await result.current.removeInstrumentRelationship('1');
    });

    expect(mockDeleteConnection).toHaveBeenCalledWith('1');
    // DataContext가 업데이트되면 connections도 업데이트됨 (하나만 제거)
    mockConnectionsRef.current = [rel2];
    const { result: result2 } = renderHook(() => useClientInstruments());
    await act(async () => {
      await flushPromises();
    });
    expect(result2.current.clientsWithInstruments.has('1')).toBe(true);
  });

  it('provides utility functions', async () => {
    mockConnectionsRef.current = [mockInstrumentRelationship];

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await flushPromises();
    });

    // Test getClientInstruments
    const clientInstruments = result.current.getClientInstruments('1');
    expect(clientInstruments).toHaveLength(1);
    expect(clientInstruments[0].id).toBe('1');

    // Test hasInstrumentRelationship
    expect(result.current.hasInstrumentRelationship('1', '1')).toBe(true);
    expect(result.current.hasInstrumentRelationship('1', '2')).toBe(false);
  });
});
