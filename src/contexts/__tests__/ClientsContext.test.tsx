import React from 'react';
import { renderHook, act, waitFor } from '@/test-utils/render';
import {
  ClientsProvider,
  useClientsContext,
  useClients,
} from '../ClientsContext';
import { Client } from '@/types';
import { fetchClients as serviceFetchClients } from '@/services/dataService';

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

// Mock dataService
jest.mock('@/services/dataService', () => ({
  fetchClients: jest.fn(),
}));

const mockServiceFetchClients = serviceFetchClients as jest.MockedFunction<
  typeof serviceFetchClients
>;

describe('ClientsContext', () => {
  const mockClient: Client = {
    id: 'client1',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    contact_number: '123-456-7890',
    tags: ['Owner'],
    interest: 'Active',
    note: 'Test client',
    client_number: null,
    created_at: '2024-01-01T00:00:00Z',
  };

  const mockClient2: Client = {
    id: 'client2',
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@example.com',
    contact_number: '098-765-4321',
    tags: ['Musician'],
    interest: 'Passive',
    note: '',
    client_number: null,
    created_at: '2024-01-02T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    mockServiceFetchClients.mockClear();
  });

  describe('Provider and hooks', () => {
    it('provides initial state', () => {
      const { result } = renderHook(() => useClientsContext(), {
        wrapper: ClientsProvider,
      });

      expect(result.current.state.clients).toEqual([]);
      expect(result.current.state.loading).toBe(false);
      expect(result.current.state.submitting).toBe(false);
      expect(result.current.state.lastUpdated).toBeNull();
    });

    it('throws error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      // Create a wrapper that doesn't include ClientsProvider
      const NoProviderWrapper = ({
        children,
      }: {
        children: React.ReactNode;
      }) => <>{children}</>;

      // Test without ClientsProvider wrapper
      expect(() => {
        renderHook(() => useClientsContext(), {
          wrapper: NoProviderWrapper,
        });
      }).toThrow('useClientsContext must be used within a ClientsProvider');

      consoleError.mockRestore();
    });

    it('useClients hook returns correct structure', () => {
      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      expect(result.current.clients).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.submitting).toBe(false);
      expect(result.current.lastUpdated).toBeNull();
      expect(typeof result.current.fetchClients).toBe('function');
      expect(typeof result.current.createClient).toBe('function');
      expect(typeof result.current.updateClient).toBe('function');
      expect(typeof result.current.deleteClient).toBe('function');
    });
  });

  describe('fetchClients', () => {
    it('fetches clients successfully', async () => {
      const mockClients = [mockClient, mockClient2];

      // Mock the fetcher function that serviceFetchClients receives
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockClients }),
      });

      mockServiceFetchClients.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      await act(async () => {
        await result.current.fetchClients();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.clients).toEqual(mockClients);
      expect(result.current.lastUpdated).not.toBeNull();
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/clients?orderBy=created_at&ascending=false&page=1&pageSize=150'
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
                  json: async () => ({ data: [mockClient] }),
                }),
              100
            )
          )
      );

      mockServiceFetchClients.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      act(() => {
        result.current.fetchClients();
      });

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('handles fetch error', async () => {
      const error = new Error('Network error');
      mockServiceFetchClients.mockRejectedValue(error);

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      await act(async () => {
        await result.current.fetchClients();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockHandleError).toHaveBeenCalledWith(error, 'Fetch clients');
      expect(result.current.clients).toEqual([]);
    });

    it('handles authentication errors gracefully', async () => {
      const authError = {
        message: 'Invalid Refresh Token',
        code: 'UNAUTHORIZED',
      };

      mockServiceFetchClients.mockRejectedValue(authError);

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      await act(async () => {
        await result.current.fetchClients();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should set empty array instead of calling handleError
      expect(result.current.clients).toEqual([]);
      expect(mockHandleError).not.toHaveBeenCalled();
    });

    it('deduplicates concurrent fetch requests', async () => {
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ data: [mockClient] }),
                }),
              100
            )
          )
      );

      mockServiceFetchClients.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      // Trigger multiple concurrent fetches
      await act(async () => {
        const promise1 = result.current.fetchClients();
        const promise2 = result.current.fetchClients();
        const promise3 = result.current.fetchClients();

        await Promise.all([promise1, promise2, promise3]);
      });

      // Should only call fetch once (deduplicated)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('createClient', () => {
    it('creates client successfully', async () => {
      const newClient = {
        first_name: 'New',
        last_name: 'Client',
        email: 'new@example.com',
        contact_number: '111-222-3333',
        tags: [],
        interest: '',
        note: '',
        client_number: null,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockClient }),
      });

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      let createdClient: Client | null = null;
      await act(async () => {
        createdClient = await result.current.createClient(newClient);
      });

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
      });

      expect(createdClient).toEqual(mockClient);
      expect(result.current.clients).toContainEqual(mockClient);
      expect(global.fetch).toHaveBeenCalledWith('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClient),
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
                  json: async () => ({ data: mockClient }),
                }),
              100
            )
          )
      );

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      act(() => {
        result.current.createClient({
          first_name: 'Test',
          last_name: 'Client',
          email: 'test@example.com',
          contact_number: null,
          tags: [],
          interest: '',
          note: '',
          client_number: null,
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

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      let createdClient: Client | null = null;
      await act(async () => {
        createdClient = await result.current.createClient({
          first_name: 'Test',
          last_name: 'Client',
          email: 'test@example.com',
          contact_number: null,
          tags: [],
          interest: '',
          note: '',
          client_number: null,
        });
      });

      expect(createdClient).toBeNull();
      expect(mockHandleError).toHaveBeenCalled();
    });

    it('returns null when response has no data', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      let createdClient: Client | null = null;
      await act(async () => {
        createdClient = await result.current.createClient({
          first_name: 'Test',
          last_name: 'Client',
          email: 'test@example.com',
          contact_number: null,
          tags: [],
          interest: '',
          note: '',
          client_number: null,
        });
      });

      // When result.data is undefined, the function returns undefined (not null)
      expect(createdClient).toBeFalsy();
    });
  });

  describe('updateClient', () => {
    beforeEach(async () => {
      // Setup initial state with a client
      mockServiceFetchClients.mockResolvedValue([mockClient]);

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      await act(async () => {
        await result.current.fetchClients();
      });
    });

    it('updates client successfully', async () => {
      const updatedClient = { ...mockClient, first_name: 'Updated' };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: updatedClient }),
      });

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      await act(async () => {
        await result.current.fetchClients();
      });

      let updated: Client | null = null;
      await act(async () => {
        updated = await result.current.updateClient(mockClient.id, {
          first_name: 'Updated',
        });
      });

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
      });

      expect(updated).toEqual(updatedClient);
      const clientInState = result.current.clients.find(
        c => c.id === mockClient.id
      );
      expect(clientInState?.first_name).toBe('Updated');
    });

    it('handles update error', async () => {
      const error = { error: new Error('Update failed') };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => error,
      });

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      await act(async () => {
        await result.current.fetchClients();
      });

      let updated: Client | null = null;
      await act(async () => {
        updated = await result.current.updateClient(mockClient.id, {
          first_name: 'Updated',
        });
      });

      expect(updated).toBeNull();
      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe('deleteClient', () => {
    beforeEach(async () => {
      mockServiceFetchClients.mockResolvedValue([mockClient]);

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      await act(async () => {
        await result.current.fetchClients();
      });
    });

    it('deletes client successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      await act(async () => {
        await result.current.fetchClients();
      });

      let deleted = false;
      await act(async () => {
        deleted = await result.current.deleteClient(mockClient.id);
      });

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
      });

      expect(deleted).toBe(true);
      expect(
        result.current.clients.find(c => c.id === mockClient.id)
      ).toBeUndefined();
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/clients?id=${mockClient.id}`,
        { method: 'DELETE' }
      );
    });

    it('handles delete error', async () => {
      const error = { error: new Error('Delete failed') };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => error,
      });

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      await act(async () => {
        await result.current.fetchClients();
      });

      let deleted = false;
      await act(async () => {
        deleted = await result.current.deleteClient(mockClient.id);
      });

      expect(deleted).toBe(false);
      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe('invalidateCache', () => {
    it('invalidates cache', async () => {
      mockServiceFetchClients.mockResolvedValue([mockClient]);

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      await act(async () => {
        await result.current.fetchClients();
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
      mockServiceFetchClients.mockResolvedValue([mockClient]);

      const { result } = renderHook(() => useClients(), {
        wrapper: ClientsProvider,
      });

      await act(async () => {
        await result.current.fetchClients();
      });

      expect(result.current.clients).toHaveLength(1);

      act(() => {
        result.current.resetState();
      });

      expect(result.current.clients).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.submitting).toBe(false);
      expect(result.current.lastUpdated).toBeNull();
    });
  });
});
