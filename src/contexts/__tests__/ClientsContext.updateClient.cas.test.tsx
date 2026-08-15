import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { ClientsProvider, useClients } from '@/contexts/ClientsContext';
import { apiFetch } from '@/utils/apiFetch';
import { ApiResponseError } from '@/utils/handleApiResponse';
import { CLIENT_STALE_VERSION_CODE } from '@/app/api/clients/_utils/concurrency';

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

describe('ClientsContext updateClient CAS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends expected_updated_at and does not auto-retry a 409', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(
      new Response(
        JSON.stringify({
          error:
            'This client was updated elsewhere. Review the latest version before saving again.',
          error_code: CLIENT_STALE_VERSION_CODE,
          success: false,
        }),
        { status: 409, headers: { 'content-type': 'application/json' } }
      )
    );

    const { result } = renderHook(() => useClients(), {
      wrapper: ({ children }) => <ClientsProvider>{children}</ClientsProvider>,
    });

    await act(async () => {
      await expect(
        result.current.updateClient('c1', {
          note: 'A1',
          expected_updated_at: '2024-01-01T00:00:00.000Z',
        })
      ).rejects.toBeInstanceOf(ApiResponseError);
    });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/api/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'c1',
        note: 'A1',
        expected_updated_at: '2024-01-01T00:00:00.000Z',
      }),
    });
    expect(mockToast.handleError).not.toHaveBeenCalled();
    expect(result.current.clients).toEqual([]);
  });

  it('updates cache from the returned server row on success', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: 'c1',
            first_name: 'Ada',
            last_name: 'Lovelace',
            email: 'ada@example.com',
            contact_number: 'P0',
            tags: [],
            interest: null,
            note: 'A1',
            client_number: 'CL001',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:01Z',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const { result } = renderHook(() => useClients(), {
      wrapper: ({ children }) => <ClientsProvider>{children}</ClientsProvider>,
    });

    let updated = null;
    await act(async () => {
      updated = await result.current.updateClient('c1', {
        note: 'A1',
        expected_updated_at: '2024-01-01T00:00:00.000Z',
      });
    });

    expect(updated).toMatchObject({
      id: 'c1',
      note: 'A1',
      updated_at: '2024-01-01T00:00:01Z',
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
