import React from 'react';
import { renderHook, act } from '@/test-utils/render';
import {
  ConnectionsProvider,
  useConnectionsContext,
} from '../ConnectionsContext';

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

describe('ConnectionsContext F2 truncation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiFetch as jest.Mock).mockReset();
    (useTenantIdentity as jest.Mock).mockReturnValue({
      tenantIdentityKey: 'tenant-unit-test',
    });
  });

  function okResponse(body: unknown) {
    return {
      ok: true,
      status: 200,
      json: async () => body,
    };
  }

  it('sets truncated=false after a successful complete org-wide drain', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce(
      okResponse({
        data: [{ id: 'c1' }],
        truncated: false,
        count: 1,
        page: 1,
        pageSize: 100,
        totalPages: 1,
        pagination: { page: 1, pageSize: 100, totalCount: 1, totalPages: 1 },
      })
    );

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({
        force: true,
        all: true,
      });
    });

    expect(result.current.state.truncated).toBe(false);
    expect(String((apiFetch as jest.Mock).mock.calls[0][0])).not.toContain(
      'all=true'
    );
  });

  it('never treats a truncated all=true-shaped payload as a complete shared cache', async () => {
    (apiFetch as jest.Mock).mockImplementation(async (url: string) => {
      expect(String(url)).not.toContain('all=true');
      return okResponse({
        data: [{ id: 'c1' }],
        truncated: true,
        count: 1,
        page: 1,
        pageSize: 100,
        totalPages: 1,
        pagination: { page: 1, pageSize: 100, totalCount: 1, totalPages: 1 },
      });
    });

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({
        force: true,
        all: true,
      });
    });

    expect(result.current.state.truncated).toBe(false);
    expect(result.current.state.connections).toHaveLength(1);
  });

  it('ignores a server truncated flag on a paginated (non-all) fetch', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ data: [{ id: 'c1' }], truncated: true })
    );

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({
        force: true,
        all: false,
        page: 1,
        pageSize: 50,
      });
    });

    // A page is truncated by design (by page), so it must never surface the
    // org-wide incomplete-collection warning.
    expect(result.current.state.truncated).toBe(false);
  });

  it('clears truncated on tenant switch (RESET_STATE)', async () => {
    const { result, rerender } = renderHook(() => useConnectionsContext(), {
      wrapper,
    });

    act(() => {
      result.current.dispatch({
        type: 'SET_CONNECTIONS',
        payload: { connections: [{ id: 'c1' } as never], truncated: true },
      });
    });
    expect(result.current.state.truncated).toBe(true);

    (useTenantIdentity as jest.Mock).mockReturnValue({
      tenantIdentityKey: 'tenant-other-org',
    });
    rerender();

    expect(result.current.state.truncated).toBe(false);
    expect(result.current.state.connections).toEqual([]);
  });

  it('clears a leftover truncated flag after a subsequent complete drain', async () => {
    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    act(() => {
      result.current.dispatch({
        type: 'SET_CONNECTIONS',
        payload: { connections: [{ id: 'c1' } as never], truncated: true },
      });
    });
    expect(result.current.state.truncated).toBe(true);

    (apiFetch as jest.Mock).mockResolvedValueOnce(
      okResponse({
        data: [{ id: 'c1' }],
        truncated: true,
        count: 1,
        page: 1,
        pageSize: 100,
        totalPages: 1,
        pagination: { page: 1, pageSize: 100, totalCount: 1, totalPages: 1 },
      })
    );

    await act(async () => {
      await result.current.actions.fetchConnections({
        force: true,
        all: true,
      });
    });
    expect(result.current.state.truncated).toBe(false);
  });

  it('does not surface an AbortError as a user-facing fetch error', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    (apiFetch as jest.Mock).mockRejectedValueOnce(abortError);

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({
        force: true,
        all: true,
      });
    });

    expect(result.current.state.error).toBeNull();
    expect(mockHandleError).not.toHaveBeenCalled();
  });

  it('preserves existing rows when a refetch fails with a non-auth error', async () => {
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce(okResponse({ data: [{ id: 'c1' }] }))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      });

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({
        force: true,
        all: true,
      });
    });
    expect(result.current.state.connections).toHaveLength(1);

    await act(async () => {
      await result.current.actions.fetchConnections({
        force: true,
        all: true,
        suppressErrorToast: true,
      });
    });

    // F5: a refetch failure must not wipe rows already on screen.
    expect(result.current.state.connections).toHaveLength(1);
    expect(result.current.state.error).not.toBeNull();
  });
});
