import { renderHook, act } from '@testing-library/react';
import { useDashboardClients } from '../useDashboardClients';
import { Client } from '@/types';

// Mock dependencies
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  logError: jest.fn(),
}));

const mockClient: Client = {
  id: 'c1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '010-1234-5678',
  tags: [],
  interest: null,
  note: null,
  client_number: 'CL001',
  created_at: '2024-01-01',
};

describe('useDashboardClients', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useDashboardClients());

    expect(result.current.showClientSearch).toBe(false);
    expect(result.current.clientSearchTerm).toBe('');
    expect(result.current.isSearchingClients).toBe(false);
    expect(result.current.selectedClientsForNew).toEqual([]);
    expect(result.current.showOwnershipSearch).toBe(false);
    expect(result.current.ownershipSearchTerm).toBe('');
    expect(result.current.isSearchingOwnership).toBe(false);
    expect(result.current.selectedOwnershipClient).toBeNull();
    expect(result.current.searchResults).toEqual([]);
    expect(result.current.ownershipSearchResults).toEqual([]);
  });

  it('should update showClientSearch', () => {
    const { result } = renderHook(() => useDashboardClients());

    act(() => {
      result.current.setShowClientSearch(true);
    });

    expect(result.current.showClientSearch).toBe(true);
  });

  it('should update clientSearchTerm', () => {
    const { result } = renderHook(() => useDashboardClients());

    act(() => {
      result.current.setClientSearchTerm('John');
    });

    expect(result.current.clientSearchTerm).toBe('John');
  });

  it('should update showOwnershipSearch', () => {
    const { result } = renderHook(() => useDashboardClients());

    act(() => {
      result.current.setShowOwnershipSearch(true);
    });

    expect(result.current.showOwnershipSearch).toBe(true);
  });

  it('should update ownershipSearchTerm', () => {
    const { result } = renderHook(() => useDashboardClients());

    act(() => {
      result.current.setOwnershipSearchTerm('Jane');
    });

    expect(result.current.ownershipSearchTerm).toBe('Jane');
  });

  it('should add client for new item', () => {
    const { result } = renderHook(() => useDashboardClients());

    act(() => {
      result.current.addClientForNew(mockClient);
    });

    expect(result.current.selectedClientsForNew).toHaveLength(1);
    expect(result.current.selectedClientsForNew[0]).toEqual(mockClient);
    expect(result.current.showClientSearch).toBe(false);
    expect(result.current.clientSearchTerm).toBe('');
  });

  it('should not add duplicate client', () => {
    const { result } = renderHook(() => useDashboardClients());

    act(() => {
      result.current.addClientForNew(mockClient);
    });

    expect(result.current.selectedClientsForNew).toHaveLength(1);

    act(() => {
      result.current.addClientForNew(mockClient);
    });

    expect(result.current.selectedClientsForNew).toHaveLength(1);
  });

  it('should remove client for new item', () => {
    const { result } = renderHook(() => useDashboardClients());

    act(() => {
      result.current.addClientForNew(mockClient);
      result.current.removeClientForNew('c1');
    });

    expect(result.current.selectedClientsForNew).toHaveLength(0);
  });

  it('should select ownership client', () => {
    const { result } = renderHook(() => useDashboardClients());

    act(() => {
      result.current.selectOwnershipClient(mockClient);
    });

    expect(result.current.selectedOwnershipClient).toEqual(mockClient);
    expect(result.current.showOwnershipSearch).toBe(false);
    expect(result.current.ownershipSearchTerm).toBe('');
  });

  it('should clear ownership client', () => {
    const { result } = renderHook(() => useDashboardClients());

    act(() => {
      result.current.selectOwnershipClient(mockClient);
      result.current.clearOwnershipClient();
    });

    expect(result.current.selectedOwnershipClient).toBeNull();
  });

  it('should clear search results when search term is less than 2 characters', async () => {
    const { supabase } = require('@/lib/supabase');
    const mockSelect = jest.fn().mockReturnValue({
      or: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          data: [mockClient],
          error: null,
        }),
      }),
    });
    supabase.from.mockReturnValue({ select: mockSelect });

    const { result } = renderHook(() => useDashboardClients());

    // Search with less than 2 characters should clear results
    await act(async () => {
      await result.current.handleClientSearch('J');
    });

    expect(result.current.searchResults).toEqual([]);
  });

  it('should handle client search error', async () => {
    const { supabase } = require('@/lib/supabase');
    const mockSelect = jest.fn().mockReturnValue({
      or: jest.fn().mockReturnValue({
        limit: jest.fn().mockRejectedValue(new Error('Search failed')),
      }),
    });
    supabase.from.mockReturnValue({ select: mockSelect });

    const { result } = renderHook(() => useDashboardClients());

    await act(async () => {
      await result.current.handleClientSearch('John');
    });

    expect(result.current.searchResults).toEqual([]);
    expect(result.current.isSearchingClients).toBe(false);
  });

  it('should handle ownership search error', async () => {
    const { supabase } = require('@/lib/supabase');
    const mockSelect = jest.fn().mockReturnValue({
      or: jest.fn().mockReturnValue({
        limit: jest.fn().mockRejectedValue(new Error('Search failed')),
      }),
    });
    supabase.from.mockReturnValue({ select: mockSelect });

    const { result } = renderHook(() => useDashboardClients());

    await act(async () => {
      await result.current.handleOwnershipSearch('John');
    });

    expect(result.current.ownershipSearchResults).toEqual([]);
    expect(result.current.isSearchingOwnership).toBe(false);
  });
});
