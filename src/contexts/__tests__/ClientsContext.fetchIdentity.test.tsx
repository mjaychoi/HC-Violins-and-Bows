import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { ClientsProvider, useClients } from '@/contexts/ClientsContext';
import { Client } from '@/types';

const mockToast = { handleError: jest.fn() };
let mockTenantIdentityKey = 'test-tenant';

jest.mock('@/contexts/ToastContext', () => ({
  useErrorHandler: () => mockToast,
}));

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: () => ({ tenantIdentityKey: mockTenantIdentityKey }),
}));

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '@/utils/apiFetch';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

function clientsResponse(id: string): Response {
  return new Response(
    JSON.stringify({
      data: [
        {
          id,
          first_name: id,
          last_name: 'Client',
          email: `${id}@x.com`,
          contact_number: '',
          tags: [],
          interest: '',
          note: '',
          client_number: id,
          created_at: '2024-01-01',
        },
      ],
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }
  );
}

describe('ClientsContext fetchClients callback identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantIdentityKey = 'test-tenant';
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

  it('does not let a stale tenant fetch decrement the current tenant loading count', async () => {
    const tenantA = deferred<Response>();
    const tenantB = deferred<Response>();
    (apiFetch as jest.Mock)
      .mockReturnValueOnce(tenantA.promise)
      .mockReturnValueOnce(tenantB.promise);

    const { result, rerender } = renderHook(() => useClients(), {
      wrapper: ({ children }) => <ClientsProvider>{children}</ClientsProvider>,
    });

    let fetchA!: Promise<void>;
    act(() => {
      fetchA = result.current.fetchClients({ force: true });
    });
    expect(result.current.loading).toBe(true);

    mockTenantIdentityKey = 'tenant-b';
    await act(async () => {
      rerender();
    });

    let fetchB!: Promise<void>;
    act(() => {
      fetchB = result.current.fetchClients({ force: true });
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      tenantA.resolve(clientsResponse('tenant-a-client'));
      await fetchA;
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.clients).toEqual([]);

    await act(async () => {
      tenantB.resolve(clientsResponse('tenant-b-client'));
      await fetchB;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.clients.map(client => client.id)).toEqual([
      'tenant-b-client',
    ]);
  });
});
