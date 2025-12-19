import React from 'react';
import { renderHook, act, waitFor } from '@/test-utils/render';
import {
  ConnectionsProvider,
  useConnectionsContext,
  useConnections,
} from '../ConnectionsContext';
import { ClientInstrument } from '@/types';

// Mock fetch
global.fetch = jest.fn();

// Mock useErrorHandler
const mockHandleError = jest.fn();
jest.mock('@/contexts/ToastContext', () => {
  const actual = jest.requireActual('@/contexts/ToastContext');
  return {
    __esModule: true,
    ...actual,
    useErrorHandler: () => ({
      handleError: mockHandleError,
    }),
  };
});

describe('ConnectionsContext', () => {
  const mockConnection: ClientInstrument = {
    id: 'conn1',
    client_id: 'client1',
    instrument_id: 'inst1',
    relationship_type: 'Interested',
    notes: 'Test connection',
    display_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    client: {
      id: 'client1',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      contact_number: '123-456-7890',
      tags: [],
      interest: '',
      note: '',
      client_number: null,
      created_at: '2024-01-01T00:00:00Z',
    },
    instrument: {
      id: 'inst1',
      maker: 'Stradivarius',
      type: 'Violin',
      subtype: null,
      serial_number: 'SN123',
      year: 1700,
      ownership: null,
      size: null,
      weight: null,
      note: null,
      price: null,
      certificate: false,
      status: 'Available',
      created_at: '2024-01-01T00:00:00Z',
    },
  };

  const mockConnection2: ClientInstrument = {
    id: 'conn2',
    client_id: 'client2',
    instrument_id: 'inst2',
    relationship_type: 'Owned',
    notes: 'Second connection',
    display_order: 1,
    created_at: '2024-01-02T00:00:00Z',
    client: {
      id: 'client2',
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane@example.com',
      contact_number: '098-765-4321',
      tags: [],
      interest: '',
      note: '',
      client_number: null,
      created_at: '2024-01-02T00:00:00Z',
    },
    instrument: {
      id: 'inst2',
      maker: 'Guarneri',
      type: 'Violin',
      subtype: null,
      serial_number: 'SN456',
      year: 1740,
      ownership: null,
      size: null,
      weight: null,
      note: null,
      price: null,
      certificate: false,
      status: 'Available',
      created_at: '2024-01-02T00:00:00Z',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('Provider and hooks', () => {
    it('provides initial state', () => {
      const { result } = renderHook(() => useConnectionsContext(), {
        wrapper: ConnectionsProvider,
      });

      expect(result.current.state.connections).toEqual([]);
      expect(result.current.state.loading).toBe(false);
      expect(result.current.state.submitting).toBe(false);
      expect(result.current.state.lastUpdated).toBeNull();
    });

    it('throws error when used outside provider', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      const NoProviderWrapper = ({
        children,
      }: {
        children: React.ReactNode;
      }) => <>{children}</>;

      expect(() => {
        renderHook(() => useConnectionsContext(), {
          wrapper: NoProviderWrapper,
        });
      }).toThrow(
        'useConnectionsContext must be used within a ConnectionsProvider'
      );

      consoleError.mockRestore();
    });

    it('useConnections hook returns correct structure', () => {
      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      expect(result.current.connections).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.submitting).toBe(false);
      expect(result.current.lastUpdated).toBeNull();
      expect(typeof result.current.fetchConnections).toBe('function');
      expect(typeof result.current.createConnection).toBe('function');
      expect(typeof result.current.updateConnection).toBe('function');
      expect(typeof result.current.deleteConnection).toBe('function');
    });
  });

  describe('fetchConnections', () => {
    it('fetches connections successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [mockConnection, mockConnection2] }),
      });

      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      await act(async () => {
        await result.current.fetchConnections();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.connections).toEqual([
        mockConnection,
        mockConnection2,
      ]);
      expect(result.current.lastUpdated).not.toBeNull();
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/connections?orderBy=created_at&ascending=false'
      );
    });

    it('sets loading state during fetch', async () => {
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ data: [mockConnection] }),
                }),
              100
            )
          )
      );

      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      act(() => {
        result.current.fetchConnections();
      });

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('handles fetch error', async () => {
      const error = { error: new Error('Network error') };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => error,
      });

      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      await act(async () => {
        await result.current.fetchConnections();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockHandleError).toHaveBeenCalledWith(
        error.error,
        'Fetch connections'
      );
    });

    it('handles empty data response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: null }),
      });

      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      await act(async () => {
        await result.current.fetchConnections();
      });

      expect(result.current.connections).toEqual([]);
    });

    it('deduplicates concurrent fetch requests', async () => {
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ data: [mockConnection] }),
                }),
              100
            )
          )
      );

      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      await act(async () => {
        const promise1 = result.current.fetchConnections();
        const promise2 = result.current.fetchConnections();
        const promise3 = result.current.fetchConnections();

        await Promise.all([promise1, promise2, promise3]);
      });

      // Should only call fetch once (deduplicated)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('createConnection', () => {
    it('creates connection successfully', async () => {
      const newConnection = {
        client_id: 'client1',
        instrument_id: 'inst1',
        relationship_type: 'Interested' as const,
        notes: 'New connection',
        display_order: 0,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockConnection }),
      });

      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      let createdConnection: ClientInstrument | null = null;
      await act(async () => {
        createdConnection =
          await result.current.createConnection(newConnection);
      });

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
      });

      expect(createdConnection).toEqual(mockConnection);
      expect(result.current.connections).toContainEqual(mockConnection);
      expect(global.fetch).toHaveBeenCalledWith('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConnection),
      });
    });

    it('sets submitting state during creation', async () => {
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ data: mockConnection }),
                }),
              100
            )
          )
      );

      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      act(() => {
        result.current.createConnection({
          client_id: 'client1',
          instrument_id: 'inst1',
          relationship_type: 'Interested',
          notes: '',
          display_order: 0,
        });
      });

      expect(result.current.submitting).toBe(true);

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
      });
    });

    it('handles create error', async () => {
      const error = { error: new Error('Create failed') };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => error,
      });

      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      let createdConnection: ClientInstrument | null = null;
      await act(async () => {
        createdConnection = await result.current.createConnection({
          client_id: 'client1',
          instrument_id: 'inst1',
          relationship_type: 'Interested',
          notes: '',
          display_order: 0,
        });
      });

      expect(createdConnection).toBeNull();
      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe('updateConnection', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      // Setup initial state with a connection
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [mockConnection] }),
      });
    });

    it('updates connection successfully', async () => {
      // First fetch
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockConnection] }),
      });

      const updatedConnection = {
        ...mockConnection,
        notes: 'Updated notes',
      };

      // Then update
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: updatedConnection }),
      });

      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      // Fetch first
      await act(async () => {
        await result.current.fetchConnections();
      });

      await waitFor(() => {
        expect(result.current.connections).toHaveLength(1);
      });

      let updated: ClientInstrument | null = null;
      await act(async () => {
        updated = await result.current.updateConnection(mockConnection.id, {
          notes: 'Updated notes',
        });
      });

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
      });

      expect(updated).toEqual(updatedConnection);
      const connectionInState = result.current.connections.find(
        c => c.id === mockConnection.id
      );
      expect(connectionInState?.notes).toBe('Updated notes');
    });

    it('handles update error', async () => {
      // First fetch
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockConnection] }),
      });

      const error = { error: new Error('Update failed') };
      // Then update (error)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => error,
      });

      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      await act(async () => {
        await result.current.fetchConnections();
      });

      await waitFor(() => {
        expect(result.current.connections).toHaveLength(1);
      });

      let updated: ClientInstrument | null = null;
      await act(async () => {
        updated = await result.current.updateConnection(mockConnection.id, {
          notes: 'Updated',
        });
      });

      expect(updated).toBeNull();
      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe('deleteConnection', () => {
    beforeEach(async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [mockConnection] }),
      });

      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      await act(async () => {
        await result.current.fetchConnections();
      });
    });

    it('deletes connection successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      await act(async () => {
        await result.current.fetchConnections();
      });

      let deleted = false;
      await act(async () => {
        deleted = await result.current.deleteConnection(mockConnection.id);
      });

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
      });

      expect(deleted).toBe(true);
      expect(
        result.current.connections.find(c => c.id === mockConnection.id)
      ).toBeUndefined();
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/connections?id=${mockConnection.id}`,
        { method: 'DELETE' }
      );
    });

    it('handles delete error', async () => {
      const error = { error: new Error('Delete failed') };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => error,
      });

      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      await act(async () => {
        await result.current.fetchConnections();
      });

      let deleted = false;
      await act(async () => {
        deleted = await result.current.deleteConnection(mockConnection.id);
      });

      expect(deleted).toBe(false);
      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe('invalidateCache', () => {
    it('invalidates cache', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [mockConnection] }),
      });

      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      await act(async () => {
        await result.current.fetchConnections();
      });

      expect(result.current.lastUpdated).not.toBeNull();

      act(() => {
        result.current.invalidateCache();
      });

      expect(result.current.lastUpdated).toBeNull();
    });
  });

  describe('resetState', () => {
    it('resets state to initial', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [mockConnection] }),
      });

      const { result } = renderHook(() => useConnections(), {
        wrapper: ConnectionsProvider,
      });

      await act(async () => {
        await result.current.fetchConnections();
      });

      expect(result.current.connections).toHaveLength(1);

      act(() => {
        result.current.resetState();
      });

      expect(result.current.connections).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.submitting).toBe(false);
      expect(result.current.lastUpdated).toBeNull();
    });
  });
});
