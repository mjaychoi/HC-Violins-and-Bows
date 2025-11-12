// src/app/clients/hooks/__tests__/useClients.state.test.tsx
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

describe('useClients - state', () => {
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

  it.skip('loading 상태 전환 확인', async () => {
    (SupabaseHelpers.create as jest.Mock).mockImplementation(
      () =>
        new Promise(resolve =>
          setTimeout(() => resolve({ data: mockClient, error: null }), 100)
        )
    );

    const { result } = renderHook(() => useClients());

    expect(result.current.loading).toBe(false);

    const createPromise = result.current.createClient({
      first_name: 'Jane',
      last_name: 'Smith',
      contact_number: '987-654-3210',
      email: 'jane@example.com',
      tags: ['Musician'],
      interest: 'Passive',
      note: 'New client',
      client_number: null,
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await createPromise;
    });

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
      },
      { timeout: 10000 }
    );
  }, 15000);
});
