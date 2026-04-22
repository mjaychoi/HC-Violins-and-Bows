import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { ClientsProvider, useClients } from '@/contexts/ClientsContext';
import { Client } from '@/types';

const mockToast = { handleError: jest.fn() };
jest.mock('@/contexts/ToastContext', () => ({
  useErrorHandler: () => mockToast,
}));

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: () => ({ tenantIdentityKey: 'test-tenant' }),
}));

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '@/utils/apiFetch';

describe('ClientsContext fetchClients callback identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiFetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'a',
            first_name: 'A',
            last_name: 'One',
            email: 'a@x.com',
            contact_number: '',
            tags: [],
            interest: '',
            note: '',
            client_number: '1',
            created_at: '2024-01-01',
          } as Client,
        ],
      }),
    });
  });

  it('keeps fetchClients referentially stable when client list state changes (upsert)', () => {
    const { result, rerender } = renderHook(() => useClients(), {
      wrapper: ({ children }) => <ClientsProvider>{children}</ClientsProvider>,
    });

    const first = result.current.fetchClients;
    const created: Client = {
      id: 'b',
      first_name: 'B',
      last_name: 'Two',
      email: 'b@x.com',
      contact_number: '',
      tags: [],
      interest: '',
      note: '',
      client_number: '2',
      created_at: '2024-01-02',
    };

    act(() => {
      result.current.upsertClient(created);
    });
    rerender();
    const second = result.current.fetchClients;

    expect(first).toBe(second);
  });

  it('applies upsert without duplicate when id exists', () => {
    const { result } = renderHook(() => useClients(), {
      wrapper: ({ children }) => <ClientsProvider>{children}</ClientsProvider>,
    });
    const c1: Client = {
      id: 'z',
      first_name: 'Z',
      last_name: 'Z',
      email: 'z@x.com',
      contact_number: '',
      tags: [],
      interest: '',
      note: '',
      client_number: 'z',
      created_at: '2024-01-01',
    };
    act(() => {
      result.current.upsertClient(c1);
    });
    act(() => {
      result.current.upsertClient({ ...c1, first_name: 'Z2' });
    });
    const row = result.current.clients.filter(c => c.id === 'z');
    expect(row).toHaveLength(1);
    expect(row[0].first_name).toBe('Z2');
  });
});
