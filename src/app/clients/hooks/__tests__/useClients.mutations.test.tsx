// src/app/clients/hooks/__tests__/useClients.mutations.test.tsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { useClients } from '../useClients';
import { Client } from '@/types';

jest.mock('@/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn(),
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
    created_at: new Date().toISOString(),
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
      note: ' Climt',
    };

    const createdClient = {
      ...newClientData,
      id: '2',
      created_at: new Date().toISOString(),
    };
    (SupabaseHelpers.create as jest.Mock).mockResolvedValueOnce({
      data: createdClient,
      error: null,
    });

    const { result } = renderHook(() => useClients());

    let createdClientResult;
    await act(async () => {
      createdClientResult = await result.current.createClient(newClientData);
    });

    await waitFor(() => {
      expect(result.current.clients).toContainEqual(createdClient);
    });

    expect(createdClientResult).toEqual(createdClient);
    expect(SupabaseHelpers.create).toHaveBeenCalledWith(
      'clients',
      newClientData
    );
  });

  it.skip('create 에러', async () => {
    const newClientData = {
      first_name: 'Jane',
      last_name: 'Smith',
      contact_number: '987-654-3210',
      email: 'jane@example.com',
      tags: ['Musician'],
      interest: 'Passive',
      note: 'New client',
    };

    (SupabaseHelpers.create as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: new Error('Create failed'),
    });

    const { result } = renderHook(() => useClients());

    let createdClientResult;
    await act(async () => {
      createdClientResult = await result.current.createClient(newClientData);
    });

    expect(createdClientResult).toBeNull();
    expect(result.current.clients).toEqual([]);
  });

  it.skip('update 성공', async () => {
    const updatedClient = { ...mockClient, first_name: 'Johnny' };
    (SupabaseHelpers.update as jest.Mock).mockResolvedValueOnce({
      data: updatedClient,
      error: null,
    });

    const { result } = renderHook(() => useClients());
    (SupabaseHelpers.fetchAll as jest.Mock).mockResolvedValueOnce({
      data: [mockClient],
    });

    let updatedClientResult;
    await act(async () => {
      updatedClientResult = await result.current.updateClient('1', {
        first_name: 'Johnny',
      });
    });

    expect(updatedClientResult).toEqual(updatedClient);
    expect(SupabaseHelpers.update).toHaveBeenCalledWith('clients', '1', {
      first_name: 'Johnny',
    });
  });

  it.skip('update 에러', async () => {
    (SupabaseHelpers.update as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: new Error('Update failed'),
    });

    const { result } = renderHook(() => useClients());
    (SupabaseHelpers.fetchAll as jest.Mock).mockResolvedValueOnce({
      data: [mockClient],
    });

    let updatedClientResult;
    await act(async () => {
      updatedClientResult = await result.current.updateClient('1', {
        first_name: 'Johnny',
      });
    });

    expect(updatedClientResult).toBeNull();
  });

  it.skip('delete 성공', async () => {
    (SupabaseHelpers.delete as jest.Mock).mockResolvedValueOnce({
      error: null,
    });

    const { result } = renderHook(() => useClients());
    (SupabaseHelpers.fetchAll as jest.Mock).mockResolvedValueOnce({
      data: [mockClient],
    });

    let deleteResult;
    await act(async () => {
      deleteResult = await result.current.removeClient('1');
    });

    expect(deleteResult).toBe(true);
    expect(result.current.clients).toEqual([]);
    expect(SupabaseHelpers.delete).toHaveBeenCalledWith('clients', '1');
  });

  it.skip('delete 에러', async () => {
    (SupabaseHelpers.delete as jest.Mock).mockResolvedValueOnce({
      error: new Error('Delete failed'),
    });

    const { result } = renderHook(() => useClients());
    (SupabaseHelpers.fetchAll as jest.Mock).mockResolvedValueOnce({
      data: [mockClient],
    });

    let deleteResult;
    await act(async () => {
      deleteResult = await result.current.removeClient('1');
    });

    expect(deleteResult).toBe(false);
  });
});
