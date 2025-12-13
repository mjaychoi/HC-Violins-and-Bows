import { renderHook } from '@testing-library/react';
import { useConnections } from '../useConnections';

// Mock DataContext
const mockFetchConnections = jest.fn();
const mockCreateConnection = jest.fn();
const mockUpdateConnection = jest.fn();
const mockDeleteConnection = jest.fn();

jest.mock('@/contexts/DataContext', () => ({
  useDataContext: () => ({
    state: {
      connections: [],
      loading: { connections: false },
      submitting: { connections: false },
    },
    actions: {
      fetchConnections: mockFetchConnections,
      createConnection: mockCreateConnection,
      updateConnection: mockUpdateConnection,
      deleteConnection: mockDeleteConnection,
    },
  }),
  useConnections: () => ({
    connections: [],
    loading: false,
    submitting: false,
    lastUpdated: null,
    fetchConnections: mockFetchConnections,
    createConnection: mockCreateConnection,
    updateConnection: mockUpdateConnection,
    deleteConnection: mockDeleteConnection,
  }),
}));

describe('useConnections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should re-export useUnifiedConnections', () => {
    const { result } = renderHook(() => useConnections());

    expect(result.current).toBeDefined();
    expect(typeof result.current.fetchConnections).toBe('function');
    expect(typeof result.current.createConnection).toBe('function');
    expect(typeof result.current.updateConnection).toBe('function');
    expect(typeof result.current.deleteConnection).toBe('function');
  });

  it('should return connections array', () => {
    const { result } = renderHook(() => useConnections());

    expect(Array.isArray(result.current.connections)).toBe(true);
  });

  it('should return loading state', () => {
    const { result } = renderHook(() => useConnections());

    expect(typeof result.current.loading).toBe('boolean');
  });

  it('should return submitting state', () => {
    const { result } = renderHook(() => useConnections());

    expect(typeof result.current.submitting).toBe('boolean');
  });
});

