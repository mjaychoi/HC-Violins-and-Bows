import { act, renderHook, waitFor } from '@/test-utils/render';
import { ClientsProvider, useClients } from '../ClientsContext';
import { ConnectionsProvider, useConnections } from '../ConnectionsContext';
import { InstrumentsProvider, useInstruments } from '../InstrumentsContext';

global.fetch = jest.fn();

const mockHandleError = jest.fn();
let mockTenantIdentityKey = 'tenant-a';

jest.mock('@/contexts/ToastContext', () => {
  const actual = jest.requireActual('@/contexts/ToastContext');
  return {
    __esModule: true,
    ...actual,
    useErrorHandler: () => ({
      handleError: mockHandleError,
    }),
  };
});

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: jest.fn(() => ({
    tenantIdentityKey: mockTenantIdentityKey,
    isTenantTransitioning: false,
  })),
}));

function createDeferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(res => {
    resolve = res;
  });

  return { promise, resolve };
}

function jsonResponse(
  payload: unknown,
  init?: { ok?: boolean; status?: number }
) {
  const ok = init?.ok ?? true;
  const status = init?.status ?? (ok ? 200 : 500);

  return {
    ok,
    status,
    json: async () => payload,
    clone() {
      return this;
    },
  } as unknown as Response;
}

describe('tenant-scoped provider hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantIdentityKey = 'tenant-a';
    (global.fetch as jest.Mock).mockReset();
  });

  it('allows a new-tenant fetch immediately while an old-tenant fetch is still inflight and never commits the stale result', async () => {
    const deferredA = createDeferredResponse();

    (global.fetch as jest.Mock)
      .mockReturnValueOnce(deferredA.promise)
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: 'client-b',
              first_name: 'Tenant',
              last_name: 'B',
              email: null,
              contact_number: null,
              tags: [],
              interest: '',
              note: '',
              client_number: null,
              created_at: '2024-01-02T00:00:00Z',
            },
          ],
        })
      );

    const { result, rerender } = renderHook(() => useClients(), {
      wrapper: ClientsProvider,
    });

    let firstFetchPromise: Promise<void> | undefined;
    await act(async () => {
      firstFetchPromise = result.current.fetchClients();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    mockTenantIdentityKey = 'tenant-b';
    rerender();

    await act(async () => {
      await result.current.fetchClients();
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.current.clients.map(client => client.id)).toEqual([
      'client-b',
    ]);

    await act(async () => {
      deferredA.resolve(
        jsonResponse({
          data: [
            {
              id: 'client-a',
              first_name: 'Tenant',
              last_name: 'A',
              email: null,
              contact_number: null,
              tags: [],
              interest: '',
              note: '',
              client_number: null,
              created_at: '2024-01-01T00:00:00Z',
            },
          ],
        })
      );
      await firstFetchPromise;
    });

    expect(result.current.clients.map(client => client.id)).toEqual([
      'client-b',
    ]);
  });

  it('still dedupes concurrent fetches for the same tenant', async () => {
    const deferred = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValue(deferred.promise);

    const { result } = renderHook(() => useConnections(), {
      wrapper: ConnectionsProvider,
    });

    let firstPromise: Promise<void> | undefined;
    let secondPromise: Promise<void> | undefined;

    await act(async () => {
      firstPromise = result.current.fetchConnections();
      secondPromise = result.current.fetchConnections();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve(jsonResponse({ data: [] }));
      await Promise.all([firstPromise, secondPromise]);
    });
  });

  it('does not dedupe fetches across different tenants', async () => {
    const deferredA = createDeferredResponse();
    const deferredB = createDeferredResponse();

    (global.fetch as jest.Mock)
      .mockReturnValueOnce(deferredA.promise)
      .mockReturnValueOnce(deferredB.promise);

    const { result, rerender } = renderHook(() => useConnections(), {
      wrapper: ConnectionsProvider,
    });

    await act(async () => {
      void result.current.fetchConnections();
    });

    mockTenantIdentityKey = 'tenant-b';
    rerender();

    await act(async () => {
      void result.current.fetchConnections();
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      deferredA.resolve(jsonResponse({ data: [] }));
      deferredB.resolve(jsonResponse({ data: [] }));
    });
  });

  it('never commits a stale mutation result after a tenant switch', async () => {
    const deferred = createDeferredResponse();
    (global.fetch as jest.Mock).mockReturnValue(deferred.promise);

    const { result, rerender } = renderHook(() => useInstruments(), {
      wrapper: InstrumentsProvider,
    });

    let mutationPromise: Promise<unknown> | undefined;
    await act(async () => {
      mutationPromise = result.current.createInstrument({
        maker: 'Old Tenant Maker',
        type: 'Violin',
        subtype: null,
        serial_number: null,
        year: null,
        ownership: null,
        size: null,
        weight: null,
        note: null,
        price: null,
        certificate: false,
        status: 'Available',
      });
    });

    expect(result.current.submitting).toBe(true);

    mockTenantIdentityKey = 'tenant-b';
    rerender();

    await waitFor(() => {
      expect(result.current.submitting).toBe(false);
    });

    await act(async () => {
      deferred.resolve(
        jsonResponse({
          data: {
            id: 'inst-a',
            maker: 'Old Tenant Maker',
            type: 'Violin',
            subtype: null,
            serial_number: null,
            year: null,
            ownership: null,
            size: null,
            weight: null,
            note: null,
            price: null,
            certificate: false,
            status: 'Available',
            created_at: '2024-01-01T00:00:00Z',
          },
        })
      );
      await expect(mutationPromise!).rejects.toThrow(
        'Instrument creation aborted'
      );
    });

    expect(result.current.instruments).toEqual([]);
    expect(result.current.submitting).toBe(false);
  });
});
