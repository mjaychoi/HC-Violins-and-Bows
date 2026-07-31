import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ClientsProvider, useClients } from '@/contexts/ClientsContext';

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

function wrapper({ children }: { children: React.ReactNode }) {
  return <ClientsProvider>{children}</ClientsProvider>;
}

describe('ClientsContext truncation and error retention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantIdentityKey = 'tenant-a';
  });

  it('stores truncated flag from API envelope', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(
      new Response(
        JSON.stringify({
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
              updated_at: '2024-01-01',
            },
          ],
          truncated: true,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const { result } = renderHook(() => useClients(), { wrapper });

    await act(async () => {
      await result.current.fetchClients({ force: true });
    });

    await waitFor(() => {
      expect(result.current.truncated).toBe(true);
      expect(result.current.clients).toHaveLength(1);
    });
  });

  it('retains loaded clients on refetch failure', async () => {
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
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
                updated_at: '2024-01-01',
              },
            ],
            truncated: false,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useClients(), { wrapper });

    await act(async () => {
      await result.current.fetchClients({ force: true });
    });

    await act(async () => {
      await result.current.fetchClients({ force: true });
    });

    await waitFor(() => {
      expect(result.current.clients).toHaveLength(1);
      expect(result.current.error).toBeTruthy();
    });
    expect(mockToast.handleError).not.toHaveBeenCalled();
  });

  it('clears truncated on tenant switch via RESET_STATE', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          truncated: true,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const { result, rerender } = renderHook(() => useClients(), { wrapper });

    await act(async () => {
      await result.current.fetchClients({ force: true });
    });

    mockTenantIdentityKey = 'tenant-b';
    rerender();

    await waitFor(() => {
      expect(result.current.truncated).toBe(false);
      expect(result.current.clients).toEqual([]);
    });
  });
});
