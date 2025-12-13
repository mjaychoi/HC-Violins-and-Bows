// src/app/clients/hooks/__tests__/useClients.state.test.tsx
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useClients } from '../useClients';
import { Client } from '@/types';

jest.mock('@/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    handleError: jest.fn(),
  }),
}));

jest.mock('@/hooks/useUnifiedData', () => {
  const { SupabaseHelpers } = require('@/utils/supabaseHelpers');
  return {
    useUnifiedClients: () => {
      const [clients, setClients] = React.useState<Client[]>([]);
      const [loading, setLoading] = React.useState(false);
      const [submitting, setSubmitting] = React.useState(false);

      const fetchClients = React.useCallback(async () => {
        setLoading(true);
        const { data } = await SupabaseHelpers.fetchAll('clients');
        setClients(data || []);
        setLoading(false);
      }, []);

      const createClient = React.useCallback(
        async (client: Partial<Client>) => {
          setLoading(true);
          const { data, error } = await SupabaseHelpers.create(
            'clients',
            client
          );
          setLoading(false);
          if (error) {
            throw error;
          }
          if (data) {
            setClients(prev => [...prev, data]);
          }
          return data ?? null;
        },
        []
      );

      const updateClient = React.useCallback(
        async (id: string, updates: Partial<Client>) => {
          setSubmitting(true);
          const { data, error } = await SupabaseHelpers.update(
            'clients',
            id,
            updates
          );
          setSubmitting(false);
          if (error) {
            throw error;
          }
          if (data) {
            setClients(prev =>
              prev.map(client => (client.id === id ? data : client))
            );
          }
          return data ?? null;
        },
        []
      );

      const deleteClient = React.useCallback(async (id: string) => {
        setSubmitting(true);
        const { error } = await SupabaseHelpers.delete('clients', id);
        setSubmitting(false);
        if (error) {
          throw error;
        }
        setClients(prev => prev.filter(client => client.id !== id));
        return true;
      }, []);

      return {
        clients,
        loading: {
          clients: loading,
          any: loading,
        },
        submitting: {
          clients: submitting,
          any: submitting,
        },
        fetchClients,
        createClient,
        updateClient,
        deleteClient,
      };
    },
  };
});

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

  it('loading 상태 전환 확인', async () => {
    (SupabaseHelpers.create as jest.Mock).mockImplementation(
      () =>
        new Promise(resolve =>
          setTimeout(() => resolve({ data: mockClient, error: null }), 100)
        )
    );

    const { result } = renderHook(() => useClients());

    expect(result.current.loading.any).toBe(false);

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

    await waitFor(() => {
      expect(result.current.loading.any).toBe(true);
    });

    await act(async () => {
      await createPromise;
    });

    await waitFor(
      () => {
        expect(result.current.loading.any).toBe(false);
      },
      { timeout: 10000 }
    );
  }, 15000);
});
