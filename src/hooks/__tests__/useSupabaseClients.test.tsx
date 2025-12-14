import { renderHook, act } from '@/test-utils/render';
import { useSupabaseClients } from '../useSupabaseClients';

// Mock useSupabaseQuery
const mockFetch = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
const mockSetData = jest.fn();

jest.mock('../useSupabaseQuery', () => ({
  useSupabaseQuery: jest.fn(() => ({
    data: [],
    loading: false,
    error: null,
    fetch: mockFetch,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
    setData: mockSetData,
  })),
}));

describe('useSupabaseClients', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return clients data structure', () => {
    const { result } = renderHook(() => useSupabaseClients());

    expect(result.current).toHaveProperty('clients');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('fetchClients');
    expect(result.current).toHaveProperty('createClient');
    expect(result.current).toHaveProperty('updateClient');
    expect(result.current).toHaveProperty('deleteClient');
  });

  it('should map data to clients', () => {
    const mockClients = [
      { id: '1', first_name: 'John', last_name: 'Doe' },
      { id: '2', first_name: 'Jane', last_name: 'Smith' },
    ];

    const { useSupabaseQuery } = require('../useSupabaseQuery');
    useSupabaseQuery.mockReturnValue({
      data: mockClients,
      loading: false,
      error: null,
      fetch: mockFetch,
      create: mockCreate,
      update: mockUpdate,
      remove: mockRemove,
      setData: mockSetData,
    });

    const { result } = renderHook(() => useSupabaseClients());

    expect(result.current.clients).toEqual(mockClients);
  });

  it('should expose loading state', () => {
    const { useSupabaseQuery } = require('../useSupabaseQuery');
    useSupabaseQuery.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      fetch: mockFetch,
      create: mockCreate,
      update: mockUpdate,
      remove: mockRemove,
      setData: mockSetData,
    });

    const { result } = renderHook(() => useSupabaseClients());

    expect(result.current.loading).toBe(true);
  });

  it('should expose error state', () => {
    const mockError = { message: 'Error occurred' };

    const { useSupabaseQuery } = require('../useSupabaseQuery');
    useSupabaseQuery.mockReturnValue({
      data: [],
      loading: false,
      error: mockError,
      fetch: mockFetch,
      create: mockCreate,
      update: mockUpdate,
      remove: mockRemove,
      setData: mockSetData,
    });

    const { result } = renderHook(() => useSupabaseClients());

    expect(result.current.error).toBe(mockError);
  });

  it('should call fetchClients', async () => {
    const { result } = renderHook(() => useSupabaseClients());

    await act(async () => {
      await result.current.fetchClients();
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  it('should call fetchClients with options', async () => {
    const options = {
      eq: { column: 'status', value: 'active' },
      order: { column: 'last_name', ascending: true },
    };

    const { result } = renderHook(() => useSupabaseClients());

    await act(async () => {
      await result.current.fetchClients(options);
    });

    expect(mockFetch).toHaveBeenCalledWith(options);
  });

  it('should call createClient', async () => {
    const newClient = {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
    };

    const { result } = renderHook(() => useSupabaseClients());

    await act(async () => {
      await result.current.createClient(newClient);
    });

    expect(mockCreate).toHaveBeenCalledWith(newClient);
  });

  it('should call updateClient', async () => {
    const updateData = { first_name: 'Jane' };

    const { result } = renderHook(() => useSupabaseClients());

    await act(async () => {
      await result.current.updateClient('client-id', updateData);
    });

    expect(mockUpdate).toHaveBeenCalledWith('client-id', updateData);
  });

  it('should call deleteClient', async () => {
    const { result } = renderHook(() => useSupabaseClients());

    await act(async () => {
      await result.current.deleteClient('client-id');
    });

    expect(mockRemove).toHaveBeenCalledWith('client-id');
  });

  it('should use clients table', () => {
    const { useSupabaseQuery } = require('../useSupabaseQuery');
    renderHook(() => useSupabaseClients());

    expect(useSupabaseQuery).toHaveBeenCalledWith('clients');
  });
});
