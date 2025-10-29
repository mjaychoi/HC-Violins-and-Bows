// src/app/clients/hooks/__tests__/useClients.mutations.test.tsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { useClients } from '../useClients';
import { Client } from '@/types';
import { flushPromises } from '../../../../../tests/utils/flushPromises';

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

  it('create 성공', async () => {
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

    await act(async () => {
      await flushPromises();
    });

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

  it('create 에러', async () => {
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

    await act(async () => {
      await flushPromises();
    });

    let createdClientResult;
    await act(async () => {
      createdClientResult = await result.current.createClient(newClientData);
    });

    expect(createdClientResult).toBeNull();
    expect(result.current.clients).toEqual([]);
  });

  it('update 성공', async () => {
    const updatedClient = { ...mockClient, first_name: 'Johnny' };
    (SupabaseHelpers.update as jest.Mock).mockResolvedValueOnce({
      data: updatedClient,
      error: null,
    });

    const { result } = renderHook(() => useClients());

    await act(async () => {
      await flushPromises();
    });

    act(() => {
      result.current.clients = [mockClient];
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

  it('update 에러', async () => {
    (SupabaseHelpers.update as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: new Error('Update failed'),
    });

    const { result } = renderHook(() => useClients());

    await act(async () => {
      await flushPromises();
    });

    let updatedClientResult;
    await act(async () => {
      updatedClientResult = await result.current.updateClient('1', {
        first_name: 'Johnny',
      });
    });

    expect(updatedClientResult).toBeNull();
  });

  it('delete 성공', async () => {
    (SupabaseHelpers.delete as jest.Mock).mockResolvedValueOnce({
      error: null,
    });

    const { result } = renderHook(() => useClients());

    await act(async () => {
      await flushPromises();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    act(() => {
      result.current.clients = [mockClient];
    });

    let deleteResult;
    await act(async () => {
      deleteResult = await result.current.removeClient('1');
      await flushPromises();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(deleteResult).toBe(true);
    expect(result.current.clients).toEqual([]);
    expect(SupabaseHelpers.delete).toHaveBeenCalledWith('clients', '1');
  }, 10000);

  it('delete 에러', async () => {
    (SupabaseHelpers.delete as jest.Mock).mockResolvedValueOnce({
      error: new Error('Delete failed'),
    });

    const { result } = renderHook(() => useClients());

    await act(async () => {
      await flushPromises();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    let deleteResult;
    await act(async () => {
      deleteResult = await result.current.removeClient('1');
      await flushPromises();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(deleteResult).toBe(false);
  }, 10000);
});
