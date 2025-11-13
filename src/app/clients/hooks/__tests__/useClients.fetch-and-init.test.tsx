// src/app/clients/hooks/__tests__/useClients.fetch-and-init.test.tsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { useClients } from '../useClients';
import { Client } from '@/types';
import { flushPromises } from '../../../../../tests/utils/flushPromises';

jest.mock('@/utils/apiClient', () => ({
  apiClient: {
    query: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn(),
  }),
}));

jest.mock('@/utils/supabaseHelpers', () => ({
  SupabaseHelpers: {
    fetchAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

import { SupabaseHelpers } from '@/utils/supabaseHelpers';

describe('useClients - init & fetch', () => {
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

  it('초기 상태: 빈 clients, loading=false, submitting=false', async () => {
    const { result } = renderHook(() => useClients());

    expect(result.current.clients).toEqual([]);
    // useLoadingState 기본값은 false
    expect(result.current.loading).toBe(false);
    expect(result.current.submitting).toBe(false);

    await act(async () => {
      await flushPromises();
    });
  });

  it('clients 조회 성공', async () => {
    const mockClients = [mockClient];
    (SupabaseHelpers.fetchAll as jest.Mock).mockResolvedValue({
      data: mockClients,
    });

    const { result } = renderHook(() => useClients());

    await waitFor(() => expect(result.current.clients).toEqual(mockClients), {
      timeout: 10000,
    });
    expect(SupabaseHelpers.fetchAll).toHaveBeenCalledWith('clients', {
      orderBy: { column: 'created_at', ascending: false },
    });
  });

  it('clients 조회 에러 처리', async () => {
    (SupabaseHelpers.fetchAll as jest.Mock).mockRejectedValue(
      new Error('Fetch failed')
    );

    const { result } = renderHook(() => useClients());

    await waitFor(() => expect(result.current.clients).toEqual([]), {
      timeout: 10000,
    });
  }, 15000);
});
