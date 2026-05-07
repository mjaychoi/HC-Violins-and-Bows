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

describe('ConnectionsContext fetchConnections error UX opts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiFetch as jest.Mock).mockReset();
  });

  function badJsonResponse() {
    return {
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    };
  }

  it('suppressErrorToast skips global handleError while recording slice error', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce(badJsonResponse());

    const { result } = renderHook(() => useConnectionsContext(), {
      wrapper: ({ children }) => (
        <ConnectionsProvider>{children}</ConnectionsProvider>
      ),
    });

    await act(async () => {
      await result.current.actions.fetchConnections({
        force: true,
        all: true,
        suppressErrorToast: true,
      });
    });

    expect(mockHandleError).not.toHaveBeenCalled();
    expect(result.current.state.error).not.toBeNull();
    expect(result.current.state.connections).toEqual([]);
  });

  it('rejectOnError rejects after slice update while suppressErrorToast avoids toast', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce(badJsonResponse());

    const { result } = renderHook(() => useConnectionsContext(), {
      wrapper: ({ children }) => (
        <ConnectionsProvider>{children}</ConnectionsProvider>
      ),
    });

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.actions.fetchConnections({
          force: true,
          all: true,
          suppressErrorToast: true,
          rejectOnError: true,
        });
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeDefined();
    expect(mockHandleError).not.toHaveBeenCalled();
    expect(result.current.state.error).not.toBeNull();
  });
});
