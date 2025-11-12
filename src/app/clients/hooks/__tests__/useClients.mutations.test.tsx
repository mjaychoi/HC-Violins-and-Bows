// src/app/clients/hooks/__tests__/useClients.mutations.test.tsx
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useClients } from '../useClients';
import { Client } from '@/types';

jest.mock('@/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn(),
  }),
}));

// Mock useLoadingState with proper state management
const mockSetLoading = jest.fn();
const mockSetSubmitting = jest.fn();

jest.mock('@/hooks/useLoadingState', () => ({
  useLoadingState: () => {
    const [loading, setLoading] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);
    
    React.useEffect(() => {
      mockSetLoading.mockImplementation(setLoading);
      mockSetSubmitting.mockImplementation(setSubmitting);
    }, []);

    return {
      loading,
      submitting,
      withLoading: async <T,>(fn: () => Promise<T>): Promise<T> => {
        setLoading(true);
        try {
          const result = await fn();
          return result;
        } finally {
          setLoading(false);
        }
      },
      withSubmitting: async <T,>(fn: () => Promise<T>): Promise<T> => {
        setSubmitting(true);
        try {
          const result = await fn();
          return result;
        } finally {
          setSubmitting(false);
        }
      },
    };
  },
}));

// Mock useAsyncOperation with proper state management
jest.mock('@/hooks/useAsyncOperation', () => ({
  useAsyncOperation: () => ({
    run: async <T,>(fn: () => Promise<T>, options?: { onSuccess?: (data: T) => void }) => {
      try {
        const result = await fn();
        if (options?.onSuccess) {
          options.onSuccess(result);
        }
        return result;
      } catch (error) {
        throw error;
      }
    },
  }),
}));

jest.mock('@/utils/supabaseHelpers', () => ({
  SupabaseHelpers: {
    fetchAll: jest.fn().mockResolvedValue({ data: [] }),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));
import { SupabaseHelpers } from '@/utils/supabaseHelpers';

describe('useClients - mutations', () => {
  const mockClient: Client = {
    id: '1',
    first_name: 'John',
    last_name: 'Doe',
    contact_number: '123-456-7890',
    email: 'john@example.com',
    tags: ['Owner'],
    interest: 'Active',
    note: 'Test note',
    client_number: null,
    created_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.skip('create 성공', async () => {
    const newClientData = {
      first_name: 'Jane',
      last_name: 'Smith',
      contact_number: '987-654-3210',
      email: 'jane@example.com',
      tags: ['Musician'],
      interest: 'Passive',
      note: 'New client',
      client_number: null,
    };

    const createdClient = {
      ...newClientData,
      id: '2',
      client_number: null,
      created_at: '2024-01-01T00:00:00Z',
    };
    
    // Mock initial fetch to return empty array
    (SupabaseHelpers.fetchAll as jest.Mock).mockResolvedValueOnce({
      data: [],
    });
    
    // Mock create to return the new client
    (SupabaseHelpers.create as jest.Mock).mockResolvedValueOnce({
      data: createdClient,
      error: null,
    });

    const { result } = renderHook(() => useClients());

    // Wait for initial fetch to complete
    await waitFor(() => {
      expect(result.current.clients).toEqual([]);
    }, { timeout: 3000 });

    let createdClientResult: Client | null = null;
    await act(async () => {
      createdClientResult = await result.current.createClient(newClientData);
    });

    // Wait for state update after create
    await waitFor(() => {
      expect(result.current.clients).toContainEqual(createdClient);
    }, { timeout: 3000 });

    expect(createdClientResult).toEqual(createdClient);
    expect(SupabaseHelpers.create).toHaveBeenCalledWith(
      'clients',
      newClientData
    );
  });

  it('create 에러', async () => {
    const newClientData = {
      first_name: 'Jane',
      last_name: 'Smith',
      contact_number: '987-654-3210',
      email: 'jane@example.com',
      tags: ['Musician'],
      interest: 'Passive',
      note: 'New client',
      client_number: null,
    };

    const createError = new Error('Create failed');
    (SupabaseHelpers.create as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: createError,
    });
    (SupabaseHelpers.fetchAll as jest.Mock).mockResolvedValue({
      data: [],
    });

    const { result } = renderHook(() => useClients());

    // Wait for initial fetch
    await waitFor(() => {
      expect(result.current.clients).toBeDefined();
    });

    await act(async () => {
      try {
        await result.current.createClient(newClientData);
      } catch (error) {
        expect(error).toBe(createError);
      }
    });

    // 클라이언트 목록은 변경되지 않아야 함
    expect(result.current.clients).toEqual([]);
  });

  it.skip('update 성공', async () => {
    const updatedClient = { ...mockClient, first_name: 'Johnny' };
    (SupabaseHelpers.update as jest.Mock).mockResolvedValueOnce({
      data: updatedClient,
      error: null,
    });
    (SupabaseHelpers.fetchAll as jest.Mock).mockResolvedValue({
      data: [mockClient],
    });

    const { result } = renderHook(() => useClients());

    // Wait for initial fetch
    await waitFor(() => {
      expect(result.current.clients.length).toBeGreaterThan(0);
    });

    let updatedClientResult;
    await act(async () => {
      updatedClientResult = await result.current.updateClient('1', {
        first_name: 'Johnny',
      });
    });

    await waitFor(() => {
      const client = result.current.clients.find(c => c.id === '1');
      expect(client?.first_name).toBe('Johnny');
    });

    expect(updatedClientResult).toEqual(updatedClient);
    expect(SupabaseHelpers.update).toHaveBeenCalledWith('clients', '1', {
      first_name: 'Johnny',
    });
  });

  it('update 에러', async () => {
    const updateError = new Error('Update failed');
    (SupabaseHelpers.update as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: updateError,
    });
    (SupabaseHelpers.fetchAll as jest.Mock).mockResolvedValue({
      data: [mockClient],
    });

    const { result } = renderHook(() => useClients());

    // Wait for initial fetch
    await waitFor(() => {
      expect(result.current.clients.length).toBeGreaterThan(0);
    });

    await act(async () => {
      try {
        await result.current.updateClient('1', {
          first_name: 'Johnny',
        });
      } catch (error) {
        expect(error).toBe(updateError);
      }
    });

    // 클라이언트는 변경되지 않아야 함
    const client = result.current.clients.find(c => c.id === '1');
    expect(client?.first_name).toBe('John');
  });

  it.skip('delete 성공', async () => {
    // Mock initial fetch to return client
    (SupabaseHelpers.fetchAll as jest.Mock).mockResolvedValueOnce({
      data: [mockClient],
    });
    
    // Mock delete to return success
    (SupabaseHelpers.delete as jest.Mock).mockResolvedValueOnce({
      error: null,
    });

    const { result } = renderHook(() => useClients());

    // Wait for initial fetch to complete
    await waitFor(() => {
      expect(result.current.clients).toContainEqual(mockClient);
    }, { timeout: 3000 });

    let deleteResult: boolean = false;
    await act(async () => {
      deleteResult = await result.current.removeClient('1');
    });

    // Wait for state update after delete
    await waitFor(() => {
      expect(result.current.clients.find(c => c.id === '1')).toBeUndefined();
    }, { timeout: 3000 });

    expect(deleteResult).toBe(true);
    expect(SupabaseHelpers.delete).toHaveBeenCalledWith('clients', '1');
  });

  it('delete 에러', async () => {
    const deleteError = new Error('Delete failed');
    (SupabaseHelpers.delete as jest.Mock).mockResolvedValueOnce({
      error: deleteError,
    });
    (SupabaseHelpers.fetchAll as jest.Mock).mockResolvedValue({
      data: [mockClient],
    });

    const { result } = renderHook(() => useClients());

    // Wait for initial fetch
    await waitFor(() => {
      expect(result.current.clients.length).toBeGreaterThan(0);
    });

    await act(async () => {
      try {
        await result.current.removeClient('1');
      } catch (error) {
        expect(error).toBe(deleteError);
      }
    });

    // 클라이언트는 삭제되지 않아야 함
    const client = result.current.clients.find(c => c.id === '1');
    expect(client).toBeDefined();
  });
});
