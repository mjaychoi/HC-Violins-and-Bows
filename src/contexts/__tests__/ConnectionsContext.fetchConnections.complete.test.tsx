import React from 'react';
import { renderHook, act } from '@/test-utils/render';
import {
  ConnectionsProvider,
  useConnectionsContext,
} from '../ConnectionsContext';
import { CONNECTIONS_COMPLETE_PAGE_SIZE } from '../fetchCompleteConnectionCollection';
import type { ClientInstrument } from '@/types';

const mockHandleError = jest.fn();

jest.mock('@/contexts/ToastContext', () => {
  const actual = jest.requireActual('@/contexts/ToastContext');
  return {
    ...actual,
    useErrorHandler: () => ({
      handleError: mockHandleError,
    }),
  };
});

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: jest.fn(() => ({
    tenantIdentityKey: 'tenant-unit-test',
  })),
}));

jest.mock('@/utils/apiFetch', () => {
  const actual =
    jest.requireActual<typeof import('@/utils/apiFetch')>('@/utils/apiFetch');
  return {
    ...actual,
    apiFetch: jest.fn(),
  };
});

import { apiFetch } from '@/utils/apiFetch';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';

function wrapper({ children }: { children: React.ReactNode }) {
  return <ConnectionsProvider>{children}</ConnectionsProvider>;
}

function connectionRow(
  id: string,
  extra?: Partial<ClientInstrument>
): ClientInstrument {
  return {
    id,
    client_id: extra?.client_id ?? `client-${id}`,
    instrument_id: extra?.instrument_id ?? `instrument-${id}`,
    relationship_type: extra?.relationship_type ?? 'Interested',
    notes: extra?.notes ?? null,
    created_at: extra?.created_at ?? '2024-01-01T00:00:00Z',
    ...extra,
  };
}

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

function failResponse() {
  return {
    ok: false,
    status: 500,
    json: async () => ({ error: 'Server error' }),
  };
}

function pagedEnvelope(
  rows: ClientInstrument[],
  page: number,
  totalCount: number,
  totalPages: number,
  pageSize = CONNECTIONS_COMPLETE_PAGE_SIZE
) {
  return {
    data: rows,
    count: totalCount,
    page,
    pageSize,
    totalPages,
    truncated: false,
    pagination: { page, pageSize, totalCount, totalPages },
  };
}

function parsePage(url: string): number {
  return Number(
    new URL(url, 'http://localhost').searchParams.get('page') || '1'
  );
}

function assertNeverAllTrue(url: string) {
  expect(new URL(url, 'http://localhost').searchParams.get('all')).not.toBe(
    'true'
  );
}

describe('ConnectionsContext complete org-wide cache drain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiFetch as jest.Mock).mockReset();
    (useTenantIdentity as jest.Mock).mockReturnValue({
      tenantIdentityKey: 'tenant-unit-test',
    });
  });

  it('C1: commits a complete one-page org and does not call all=true', async () => {
    const row = connectionRow('c1');
    (apiFetch as jest.Mock).mockImplementation(async (url: string) => {
      assertNeverAllTrue(url);
      return okResponse(pagedEnvelope([row], 1, 1, 1));
    });

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({ all: true });
    });

    expect(result.current.state.connections).toEqual([row]);
    expect(result.current.state.truncated).toBe(false);
    expect(apiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.actions.fetchConnections({ all: true });
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('C2/C4: drains every page into the shared cache, including later-page rows', async () => {
    const page1 = Array.from({ length: 100 }, (_, index) =>
      connectionRow(`p1-${index}`)
    );
    const page2 = Array.from({ length: 100 }, (_, index) =>
      connectionRow(`p2-${index}`)
    );
    const later = connectionRow('later-rel', {
      client_id: 'client-later',
      instrument_id: 'instrument-later',
    });
    const page3 = [
      later,
      ...Array.from({ length: 36 }, (_, index) => connectionRow(`p3-${index}`)),
    ];

    (apiFetch as jest.Mock).mockImplementation(async (url: string) => {
      assertNeverAllTrue(url);
      const page = parsePage(url);
      const pages = [page1, page2, page3];
      return okResponse(pagedEnvelope(pages[page - 1] ?? [], page, 237, 3));
    });

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({
        all: true,
        force: true,
      });
    });

    expect(result.current.state.connections).toHaveLength(237);
    expect(result.current.state.truncated).toBe(false);
    expect(
      result.current.state.connections.some(row => row.id === 'later-rel')
    ).toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(3);
  });

  it('C3: loads every row beyond the old 1000-row all=true cap', async () => {
    (apiFetch as jest.Mock).mockImplementation(async (url: string) => {
      assertNeverAllTrue(url);
      const page = parsePage(url);
      const start = (page - 1) * 100;
      const rows = Array.from({ length: Math.min(100, 1001 - start) }, (_, i) =>
        connectionRow(`cap-${start + i}`)
      );
      return okResponse(pagedEnvelope(rows, page, 1001, 11));
    });

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({ all: true });
    });

    expect(result.current.state.connections).toHaveLength(1001);
    expect(result.current.state.truncated).toBe(false);
    expect(apiFetch).toHaveBeenCalledTimes(11);
  });

  it('C8/C9: a successful empty org is complete and does not refetch', async () => {
    (apiFetch as jest.Mock).mockImplementation(async (url: string) => {
      assertNeverAllTrue(url);
      return okResponse(pagedEnvelope([], 1, 0, 1));
    });

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({ all: true });
    });

    expect(result.current.state.connections).toEqual([]);
    expect(result.current.state.lastUpdated).not.toBeNull();
    expect(result.current.state.truncated).toBe(false);
    expect(result.current.state.error).toBeNull();
    expect(apiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.actions.fetchConnections({ all: true });
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('C10: never uses /api/connections?all=true as the complete-cache path', async () => {
    (apiFetch as jest.Mock).mockImplementation(async (url: string) => {
      assertNeverAllTrue(url);
      return okResponse(pagedEnvelope([connectionRow('c1')], 1, 1, 1));
    });

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({
        all: true,
        force: true,
      });
    });

    const urls = (apiFetch as jest.Mock).mock.calls.map(call =>
      String(call[0])
    );
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every(url => !url.includes('all=true'))).toBe(true);
    expect(result.current.state.truncated).toBe(false);
  });

  it('F1: initial page-2 failure does not publish a partial cache', async () => {
    (apiFetch as jest.Mock).mockImplementation(async (url: string) => {
      const page = parsePage(url);
      if (page === 1) {
        return okResponse(
          pagedEnvelope(
            Array.from({ length: 100 }, (_, i) => connectionRow(`p1-${i}`)),
            1,
            150,
            2
          )
        );
      }
      return failResponse();
    });

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({
        all: true,
        suppressErrorToast: true,
      });
    });

    expect(result.current.state.connections).toEqual([]);
    expect(result.current.state.lastUpdated).toBeNull();
    expect(result.current.state.error).not.toBeNull();
    expect(result.current.state.truncated).toBe(false);

    (apiFetch as jest.Mock).mockImplementation(async (url: string) => {
      const page = parsePage(url);
      const rows =
        page === 1
          ? Array.from({ length: 100 }, (_, i) => connectionRow(`p1-${i}`))
          : Array.from({ length: 50 }, (_, i) => connectionRow(`p2-${i}`));
      return okResponse(pagedEnvelope(rows, page, 150, 2));
    });

    await act(async () => {
      await result.current.actions.fetchConnections({
        all: true,
        suppressErrorToast: true,
      });
    });

    expect(result.current.state.connections).toHaveLength(150);
  });

  it('F2: background page-2 failure preserves the prior complete cache', async () => {
    const initial = [connectionRow('kept')];
    (apiFetch as jest.Mock).mockResolvedValueOnce(
      okResponse(pagedEnvelope(initial, 1, 1, 1))
    );

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({ all: true });
    });
    expect(result.current.state.connections).toEqual(initial);

    (apiFetch as jest.Mock).mockImplementation(async (url: string) => {
      if (parsePage(url) === 1) {
        return okResponse(
          pagedEnvelope(
            Array.from({ length: 100 }, (_, i) => connectionRow(`new-${i}`)),
            1,
            150,
            2
          )
        );
      }
      return failResponse();
    });

    await act(async () => {
      await result.current.actions.fetchConnections({
        all: true,
        force: true,
        suppressErrorToast: true,
      });
    });

    expect(result.current.state.connections).toEqual(initial);
    expect(result.current.state.error).not.toBeNull();

    await act(async () => {
      await result.current.actions.fetchConnections({ all: true });
    });
    expect(apiFetch).toHaveBeenCalledTimes(1 + 2);
  });

  it('F5: auth-like failure resets tenant state instead of keeping stale rows', async () => {
    const { ApiFetchAuthError } = jest.requireActual('@/utils/apiFetch');
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce(
        okResponse(pagedEnvelope([connectionRow('stale')], 1, 1, 1))
      )
      .mockRejectedValueOnce(
        new ApiFetchAuthError('Authentication required', 401)
      );

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({ all: true });
    });
    expect(result.current.state.connections).toHaveLength(1);

    await act(async () => {
      await result.current.actions.fetchConnections({
        all: true,
        force: true,
        suppressErrorToast: true,
      });
    });

    expect(result.current.state.connections).toEqual([]);
    expect(result.current.state.lastUpdated).toBeNull();
  });

  it('F6: a malformed later page fails the whole complete fetch', async () => {
    (apiFetch as jest.Mock).mockImplementation(async (url: string) => {
      if (parsePage(url) === 1) {
        return okResponse(
          pagedEnvelope(
            Array.from({ length: 100 }, (_, i) => connectionRow(`p1-${i}`)),
            1,
            150,
            2
          )
        );
      }
      return okResponse({ data: { not: 'an-array' } });
    });

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({
        all: true,
        suppressErrorToast: true,
      });
    });

    expect(result.current.state.connections).toEqual([]);
    expect(result.current.state.error).not.toBeNull();
  });

  it('R1: concurrent complete fetches share one drain', async () => {
    let resolvePage!: (value: unknown) => void;
    const pagePromise = new Promise(resolve => {
      resolvePage = resolve;
    });
    (apiFetch as jest.Mock).mockReturnValue(pagePromise);

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;

    await act(async () => {
      first = result.current.actions.fetchConnections({ all: true });
      second = result.current.actions.fetchConnections({ all: true });
    });

    expect(apiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePage(
        okResponse(pagedEnvelope([connectionRow('shared')], 1, 1, 1))
      );
      await Promise.all([first, second]);
    });

    expect(result.current.state.connections).toHaveLength(1);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('R2: force while an older drain is in flight still runs a fresh drain', async () => {
    const responses: Array<(value: unknown) => void> = [];
    (apiFetch as jest.Mock).mockImplementation(
      () =>
        new Promise(resolve => {
          responses.push(resolve);
        })
    );

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    let first: Promise<void> | undefined;
    let forced: Promise<void> | undefined;

    await act(async () => {
      first = result.current.actions.fetchConnections({ all: true });
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      forced = result.current.actions.fetchConnections({
        all: true,
        force: true,
      });
    });

    await act(async () => {
      responses[0]?.(
        okResponse(pagedEnvelope([connectionRow('stale')], 1, 1, 1))
      );
      await first;
    });

    await act(async () => {
      responses[1]?.(
        okResponse(pagedEnvelope([connectionRow('fresh')], 1, 1, 1))
      );
      await forced;
    });

    expect(result.current.state.connections.map(row => row.id)).toEqual([
      'fresh',
    ]);
  });

  it('R3: tenant A pages arriving after switch to B are discarded', async () => {
    let resolveAPage2!: (value: unknown) => void;
    const aPage2 = new Promise(resolve => {
      resolveAPage2 = resolve;
    });
    let call = 0;

    (apiFetch as jest.Mock).mockImplementation(async (url: string) => {
      const page = parsePage(url);
      call += 1;
      if (call === 1) {
        return okResponse(
          pagedEnvelope(
            Array.from({ length: 100 }, (_, i) =>
              connectionRow(`a-${i}`, { notes: 'tenant-a' })
            ),
            1,
            150,
            2
          )
        );
      }
      if (call === 2 && page === 2) {
        return aPage2;
      }
      return okResponse(
        pagedEnvelope([connectionRow('b-1', { notes: 'tenant-b' })], page, 1, 1)
      );
    });

    const { result, rerender } = renderHook(() => useConnectionsContext(), {
      wrapper,
    });

    let tenantAFetch: Promise<void> | undefined;
    await act(async () => {
      tenantAFetch = result.current.actions.fetchConnections({ all: true });
    });

    (useTenantIdentity as jest.Mock).mockReturnValue({
      tenantIdentityKey: 'tenant-b',
    });
    rerender();

    await act(async () => {
      await result.current.actions.fetchConnections({ all: true });
    });

    await act(async () => {
      resolveAPage2(
        okResponse(
          pagedEnvelope(
            Array.from({ length: 50 }, (_, i) =>
              connectionRow(`a-late-${i}`, { notes: 'tenant-a' })
            ),
            2,
            150,
            2
          )
        )
      );
      await tenantAFetch;
    });

    expect(result.current.state.connections.map(row => row.notes)).toEqual([
      'tenant-b',
    ]);
  });

  it('R5: page-boundary duplicate ids are not stored twice', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      connectionRow(`p1-${i}`)
    );
    const overlap = page1[99];
    const page2 = [
      overlap,
      ...Array.from({ length: 50 }, (_, i) => connectionRow(`p2-${i}`)),
    ];

    (apiFetch as jest.Mock).mockImplementation(async (url: string) => {
      const page = parsePage(url);
      return okResponse(
        pagedEnvelope(page === 1 ? page1 : page2, page, 150, 2)
      );
    });

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({ all: true });
    });

    const ids = result.current.state.connections.map(row => row.id);
    expect(ids).toHaveLength(150);
    expect(new Set(ids).size).toBe(150);
  });

  it('R6: paged fetch cannot replace a complete org-wide cache', async () => {
    const complete = Array.from({ length: 5 }, (_, i) =>
      connectionRow(`full-${i}`)
    );
    (apiFetch as jest.Mock).mockResolvedValueOnce(
      okResponse(pagedEnvelope(complete, 1, 5, 1))
    );

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({ all: true });
    });
    expect(result.current.state.connections).toHaveLength(5);

    (apiFetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ data: [connectionRow('page-only')], truncated: true })
    );

    await act(async () => {
      await result.current.actions.fetchConnections({
        all: false,
        force: true,
        page: 1,
        pageSize: 50,
      });
    });

    expect(result.current.state.connections).toHaveLength(5);
    expect(result.current.state.connections.map(row => row.id).sort()).toEqual(
      complete.map(row => row.id).sort()
    );
  });

  it('local ADD against a complete cache does not require a refetch and stays complete', async () => {
    (apiFetch as jest.Mock).mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/connections?')) {
        return okResponse(pagedEnvelope([connectionRow('existing')], 1, 1, 1));
      }
      return okResponse({ data: connectionRow('created') });
    });

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({ all: true });
    });
    const completeCalls = (apiFetch as jest.Mock).mock.calls.length;

    await act(async () => {
      await result.current.actions.createConnection({
        client_id: 'client-created',
        instrument_id: 'instrument-created',
        relationship_type: 'Interested',
        notes: null,
      });
    });

    expect(
      result.current.state.connections.some(row => row.id === 'created')
    ).toBe(true);

    await act(async () => {
      await result.current.actions.fetchConnections({ all: true });
    });
    expect((apiFetch as jest.Mock).mock.calls.length).toBe(completeCalls + 1);
  });

  it('local ADD against a partial cache does not mark the cache complete', async () => {
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce(
        okResponse({ data: [connectionRow('page-1')], truncated: true })
      )
      .mockImplementation(async (url: string) => {
        if (String(url).startsWith('/api/connections?')) {
          return okResponse(
            pagedEnvelope(
              [connectionRow('page-1'), connectionRow('page-2')],
              1,
              2,
              1
            )
          );
        }
        return okResponse({ data: connectionRow('created') });
      });

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({
        all: false,
        force: true,
        page: 1,
        pageSize: 50,
      });
    });
    expect(result.current.state.connections).toHaveLength(1);

    await act(async () => {
      await result.current.actions.createConnection({
        client_id: 'client-created',
        instrument_id: 'instrument-created',
        relationship_type: 'Interested',
        notes: null,
      });
    });

    await act(async () => {
      await result.current.actions.fetchConnections({ all: true });
    });

    expect(result.current.state.connections.map(row => row.id).sort()).toEqual(
      ['page-1', 'page-2'].sort()
    );
  });
});
