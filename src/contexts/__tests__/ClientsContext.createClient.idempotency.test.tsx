import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { ClientsProvider, useClients } from '@/contexts/ClientsContext';
import { apiFetch } from '@/utils/apiFetch';
import type { Client } from '@/types';

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

const adaPayload: Omit<Client, 'id' | 'created_at'> = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  contact_number: null,
  tags: [],
  interest: '',
  note: '',
  client_number: null,
};

function createdAda(id = 'client-ada'): Client {
  return {
    id,
    ...adaPayload,
    client_number: 'CL001',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };
}

function successResponse(client: Client): Response {
  return new Response(JSON.stringify({ data: client }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(
  status: number,
  body: Record<string, unknown>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function postedIdempotencyKey(callIndex = 0): string {
  const key = (apiFetch as jest.Mock).mock.calls[callIndex]?.[2]
    ?.idempotencyKey;
  expect(typeof key).toBe('string');
  expect(key.length).toBeGreaterThan(0);
  return key as string;
}

describe('ClientsContext createClient idempotency (V2-009)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TEST-1: first valid create sends an Idempotency-Key', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(successResponse(createdAda()));

    const { result } = renderHook(() => useClients(), {
      wrapper: ({ children }) => <ClientsProvider>{children}</ClientsProvider>,
    });

    await act(async () => {
      await result.current.createClient(adaPayload);
    });

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/clients',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(adaPayload),
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^client-create-/),
      })
    );
  });

  it('TEST-2/3/4: duplicate invocation and network-ambiguous retry reuse the same key and payload', async () => {
    (apiFetch as jest.Mock)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(successResponse(createdAda()));

    const { result } = renderHook(() => useClients(), {
      wrapper: ({ children }) => <ClientsProvider>{children}</ClientsProvider>,
    });

    await act(async () => {
      await result.current.createClient({ ...adaPayload });
    });
    await act(async () => {
      await result.current.createClient({ ...adaPayload });
    });

    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(postedIdempotencyKey(0)).toBe(postedIdempotencyKey(1));
    expect((apiFetch as jest.Mock).mock.calls[0][1].body).toBe(
      (apiFetch as jest.Mock).mock.calls[1][1].body
    );
    expect(JSON.parse((apiFetch as jest.Mock).mock.calls[0][1].body)).toEqual(
      adaPayload
    );
  });

  it('TEST-5: rapid double submit emits one POST (same in-flight promise)', async () => {
    let resolveFetch!: (value: Response) => void;
    (apiFetch as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          resolveFetch = resolve;
        })
    );

    const { result } = renderHook(() => useClients(), {
      wrapper: ({ children }) => <ClientsProvider>{children}</ClientsProvider>,
    });

    let first: Promise<Client | null> | undefined;
    let second: Promise<Client | null> | undefined;

    act(() => {
      first = result.current.createClient(adaPayload);
      second = result.current.createClient(adaPayload);
    });

    resolveFetch(successResponse(createdAda()));

    await act(async () => {
      expect(await first).toEqual(createdAda());
      expect(await second).toEqual(createdAda());
    });

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('TEST-8/9/10: success retires KEY-A so the next create, even with the same fields, uses KEY-B', async () => {
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce(successResponse(createdAda('c-a')))
      .mockResolvedValueOnce(successResponse(createdAda('c-b')));

    const { result } = renderHook(() => useClients(), {
      wrapper: ({ children }) => <ClientsProvider>{children}</ClientsProvider>,
    });

    await act(async () => {
      await result.current.createClient(adaPayload);
    });
    await act(async () => {
      await result.current.createClient({ ...adaPayload });
    });

    expect(postedIdempotencyKey(0)).not.toBe(postedIdempotencyKey(1));
    expect(result.current.clients.map(client => client.id)).toEqual([
      'c-b',
      'c-a',
    ]);
  });

  it('TEST-12: a changed payload after a failed attempt mints a new key', async () => {
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce(
        errorResponse(400, { error: 'Invalid client data' })
      )
      .mockResolvedValueOnce(successResponse(createdAda()));

    const { result } = renderHook(() => useClients(), {
      wrapper: ({ children }) => <ClientsProvider>{children}</ClientsProvider>,
    });

    await act(async () => {
      await result.current.createClient(adaPayload);
    });
    await act(async () => {
      await result.current.createClient({ ...adaPayload, note: 'P2' });
    });

    expect(postedIdempotencyKey(0)).not.toBe(postedIdempotencyKey(1));
  });

  it('TEST-13: replay after a lost response adds the created Client once', async () => {
    (apiFetch as jest.Mock)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(successResponse(createdAda('client-ada')));

    const { result } = renderHook(() => useClients(), {
      wrapper: ({ children }) => <ClientsProvider>{children}</ClientsProvider>,
    });

    await act(async () => {
      await result.current.createClient(adaPayload);
    });
    expect(result.current.clients).toEqual([]);

    await act(async () => {
      await result.current.createClient(adaPayload);
    });

    expect(result.current.clients).toHaveLength(1);
    expect(result.current.clients[0]?.id).toBe('client-ada');
  });

  it('does not append a duplicate local row when ADD_CLIENT sees the same id twice', async () => {
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce(successResponse(createdAda('client-ada')))
      .mockResolvedValueOnce(successResponse(createdAda('client-ada')));

    const { result } = renderHook(() => useClients(), {
      wrapper: ({ children }) => <ClientsProvider>{children}</ClientsProvider>,
    });

    await act(async () => {
      await result.current.createClient(adaPayload);
    });
    await act(async () => {
      await result.current.createClient(adaPayload);
    });

    expect(
      result.current.clients.filter(c => c.id === 'client-ada')
    ).toHaveLength(1);
  });

  it('keeps the same key across a 500 until the unchanged retry completes', async () => {
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce(errorResponse(500, { error: 'Temporary failure' }))
      .mockResolvedValueOnce(successResponse(createdAda()));

    const { result } = renderHook(() => useClients(), {
      wrapper: ({ children }) => <ClientsProvider>{children}</ClientsProvider>,
    });

    await act(async () => {
      await result.current.createClient(adaPayload);
    });
    await act(async () => {
      await result.current.createClient(adaPayload);
    });

    expect(postedIdempotencyKey(0)).toBe(postedIdempotencyKey(1));
  });
});
