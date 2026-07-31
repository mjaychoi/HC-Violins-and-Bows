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

  it('exposes truncated=true when an org-wide fetch is capped', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ data: [{ id: 'c1' }], truncated: true })
    );

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({
        force: true,
        all: true,
      });
    });

    expect(result.current.state.truncated).toBe(true);
    expect(result.current.state.connections).toHaveLength(1);
  });

  it('exposes truncated=false for a complete org-wide fetch', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ data: [{ id: 'c1' }], truncated: false })
    );

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({
        force: true,
        all: true,
      });
    });

    expect(result.current.state.truncated).toBe(false);
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

    // Only the org-wide "all" mode can be silently capped; a page is
    // truncated by design (by page), so it must never surface the warning.
    expect(result.current.state.truncated).toBe(false);
  });

  it('clears truncated on tenant switch (RESET_STATE)', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce(
      okResponse({ data: [{ id: 'c1' }], truncated: true })
    );

    const { result, rerender } = renderHook(() => useConnectionsContext(), {
      wrapper,
    });

    await act(async () => {
      await result.current.actions.fetchConnections({
        force: true,
        all: true,
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

  it('resets truncated to false once a subsequent fetch is no longer capped', async () => {
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce(
        okResponse({ data: [{ id: 'c1' }], truncated: true })
      )
      .mockResolvedValueOnce(
        okResponse({ data: [{ id: 'c1' }], truncated: false })
      );

    const { result } = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await result.current.actions.fetchConnections({
        force: true,
        all: true,
      });
    });
    expect(result.current.state.truncated).toBe(true);

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
