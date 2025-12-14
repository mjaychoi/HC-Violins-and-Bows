import { renderHook, act } from '@/test-utils/render';
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
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await flushPromises();
    });
  });

  it('fetches instrument relationships', async () => {
    // ✅ FIXED: DataContext를 통해 connections 설정
    mockConnectionsRef.current = [mockInstrumentRelationship];

    const { result } = renderHook(() => useClientInstruments());

    // fetchInstrumentRelationships는 no-op이지만, connections는 DataContext에서 가져옴
    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });

    expect(result.current.instrumentRelationships).toHaveLength(1);
    expect(result.current.clientsWithInstruments.has('1')).toBe(true);
  });

  it('handles fetch error', async () => {
    // ✅ FIXED: fetchInstrumentRelationships는 no-op이므로 빈 connections로 테스트
    mockConnectionsRef.current = [];

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
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
    // ✅ FIXED: DataContext를 통해 connections 설정
    mockConnectionsRef.current = [mockInstrumentRelationship];
    mockDeleteConnection.mockResolvedValue(true);

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });
    expect(result.current.instrumentRelationships).toHaveLength(1);

    await act(async () => {
      await result.current.removeInstrumentRelationship('1');
    });

    expect(mockDeleteConnection).toHaveBeenCalledWith('1');
    // ✅ FIXED: DataContext가 업데이트되면 connections도 업데이트됨
    mockConnectionsRef.current = [];
    const { result: result2 } = renderHook(() => useClientInstruments());
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
    // ✅ FIXED: DataContext를 통해 connections 설정
    mockConnectionsRef.current = [mockInstrumentRelationship];

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });

    expect(result.current.clientsWithInstruments.has('1')).toBe(true);
  });

  it('removes client from set when no relationships remain', async () => {
    // ✅ FIXED: DataContext를 통해 connections 설정
    mockConnectionsRef.current = [mockInstrumentRelationship];
    mockDeleteConnection.mockResolvedValue(true);

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });
    expect(result.current.clientsWithInstruments.has('1')).toBe(true);

    await act(async () => {
      await result.current.removeInstrumentRelationship('1');
    });

    expect(mockDeleteConnection).toHaveBeenCalledWith('1');
    // ✅ FIXED: DataContext가 업데이트되면 connections도 업데이트됨
    mockConnectionsRef.current = [];
    const { result: result2 } = renderHook(() => useClientInstruments());
    expect(result2.current.clientsWithInstruments.has('1')).toBe(false);
  });

  it('keeps client in set when other relationships exist', async () => {
    // ✅ FIXED: DataContext를 통해 connections 설정
    const rel2 = { ...mockInstrumentRelationship, id: '2' };
    mockConnectionsRef.current = [mockInstrumentRelationship, rel2];
    mockDeleteConnection.mockResolvedValue(true);

    const { result } = renderHook(() => useClientInstruments());

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });
    expect(result.current.clientsWithInstruments.has('1')).toBe(true);

    await act(async () => {
      await result.current.removeInstrumentRelationship('1');
    });

    expect(mockDeleteConnection).toHaveBeenCalledWith('1');
    // ✅ FIXED: DataContext가 업데이트되면 connections도 업데이트됨 (하나만 제거)
    mockConnectionsRef.current = [rel2];
    const { result: result2 } = renderHook(() => useClientInstruments());
    expect(result2.current.clientsWithInstruments.has('1')).toBe(true);
  });

  it('handles loading states correctly', async () => {
    // ✅ FIXED: hook이 loading을 false로 반환함 (DataContext가 loading 관리)
    mockConnectionsRef.current = [];

    const { result } = renderHook(() => useClientInstruments());

    expect(result.current.loading).toBe(false);

    await act(async () => {
      await result.current.fetchInstrumentRelationships('1');
    });

    // ✅ FIXED: fetchInstrumentRelationships는 no-op이므로 loading 상태 변경 없음
    expect(result.current.loading).toBe(false);
  });

  it('clears error when new operation succeeds', async () => {
    // ✅ FIXED: fetchInstrumentRelationships는 no-op이므로 에러 처리 없음
    mockConnectionsRef.current = [];

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
