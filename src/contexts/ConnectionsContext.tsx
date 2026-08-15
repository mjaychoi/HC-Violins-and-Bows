'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { ClientInstrument } from '@/types';
import { useErrorHandler } from '@/contexts/ToastContext';
import { apiFetch } from '@/utils/apiFetch';
import {
  createApiResponseErrorFromResponse,
  readApiResponseEnvelope,
} from '@/utils/handleApiResponse';
import { isAuthLikeTenantError } from '@/utils/tenantIdentity';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';
import {
  CONNECTIONS_COMPLETE_PAGE_SIZE,
  ConnectionCompleteFetchCancelled,
  fetchCompleteConnectionCollection,
} from '@/contexts/fetchCompleteConnectionCollection';

interface ConnectionsState {
  connections: ClientInstrument[];
  loading: boolean;
  loadingCount: number;
  submitting: boolean;
  error: unknown | null;
  lastUpdated: Date | null;
  /**
   * True when the most recently committed *bounded* snapshot was truncated.
   * A successful complete org-wide drain always stores `false`. Partial
   * paged fetches never set this. Reset on tenant switch (RESET_STATE).
   * `truncated === true` and org-wide completeness must never describe the
   * same snapshot.
   */
  truncated: boolean;
}

type ConnectionsAction =
  | { type: 'START_LOADING' }
  | { type: 'END_LOADING' }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: unknown | null }
  | {
      type: 'SET_CONNECTIONS';
      payload: { connections: ClientInstrument[]; truncated: boolean };
    }
  | { type: 'ADD_CONNECTION'; payload: ClientInstrument }
  | {
      type: 'UPDATE_CONNECTION';
      payload: { id: string; connection: ClientInstrument };
    }
  | { type: 'REMOVE_CONNECTION'; payload: string }
  | { type: 'UPSERT_CONNECTIONS'; payload: ClientInstrument[] }
  | { type: 'INVALIDATE_CACHE' }
  | { type: 'RESET_STATE' };

const initialState: ConnectionsState = {
  connections: [],
  loading: false,
  loadingCount: 0,
  submitting: false,
  error: null,
  lastUpdated: null,
  truncated: false,
};

function connectionsReducer(
  state: ConnectionsState,
  action: ConnectionsAction
): ConnectionsState {
  switch (action.type) {
    case 'START_LOADING': {
      const next = state.loadingCount + 1;

      return {
        ...state,
        loadingCount: next,
        loading: true,
      };
    }

    case 'END_LOADING': {
      const next = Math.max(0, state.loadingCount - 1);

      return {
        ...state,
        loadingCount: next,
        loading: next > 0,
      };
    }

    case 'SET_SUBMITTING':
      return { ...state, submitting: action.payload };

    case 'SET_ERROR':
      if (action.payload === null) {
        return { ...state, error: null };
      }

      // F5: a fetch failure (auth-like errors are handled separately via
      // RESET_STATE above) must not wipe out rows that are already on
      // screen - a refresh/refetch failure should surface an error/retry
      // affordance while preserving the last known-good, same-tenant data.
      return {
        ...state,
        error: action.payload,
      };

    case 'SET_CONNECTIONS':
      return {
        ...state,
        connections: action.payload.connections,
        truncated: action.payload.truncated,
        error: null,
        lastUpdated: new Date(),
      };

    case 'ADD_CONNECTION':
      return {
        ...state,
        connections: [
          action.payload,
          ...state.connections.filter(c => c.id !== action.payload.id),
        ],
        lastUpdated: new Date(),
      };

    case 'UPDATE_CONNECTION':
      return {
        ...state,
        connections: state.connections.map(c =>
          c.id === action.payload.id ? action.payload.connection : c
        ),
        lastUpdated: new Date(),
      };

    case 'REMOVE_CONNECTION':
      return {
        ...state,
        connections: state.connections.filter(c => c.id !== action.payload),
        lastUpdated: new Date(),
      };

    case 'UPSERT_CONNECTIONS': {
      const incoming = action.payload;

      if (incoming.length === 0) return state;

      const incomingIds = new Set(incoming.map(c => c.id));

      const merged = [
        ...incoming,
        ...state.connections.filter(c => !incomingIds.has(c.id)),
      ];

      return {
        ...state,
        connections: merged,
        error: null,
        lastUpdated: new Date(),
      };
    }

    case 'INVALIDATE_CACHE':
      return {
        ...state,
        lastUpdated: null,
      };

    case 'RESET_STATE':
      return initialState;

    default:
      return state;
  }
}

type ConnectionsContextValue = {
  state: ConnectionsState;
  dispatch: React.Dispatch<ConnectionsAction>;
  actions: {
    fetchConnections: (opts?: {
      force?: boolean;
      all?: boolean;
      page?: number;
      pageSize?: number;
      suppressErrorToast?: boolean;
      rejectOnError?: boolean;
    }) => Promise<void>;

    createConnection: (
      connection: Omit<ClientInstrument, 'id' | 'created_at'>
    ) => Promise<ClientInstrument | null>;

    updateConnection: (
      id: string,
      connection: Partial<ClientInstrument>
    ) => Promise<ClientInstrument | null>;

    deleteConnection: (id: string) => Promise<boolean>;

    upsertConnections: (connections: ClientInstrument[]) => void;

    invalidateCache: () => void;

    resetState: () => void;
  };
};

const CONNECTIONS_DEFAULT_PAGE = 1;
const CONNECTIONS_DEFAULT_PAGE_SIZE = 50;

const NO_TENANT_SCOPE_KEY = '__no-tenant__';

const ConnectionsContext = createContext<ConnectionsContextValue | null>(null);

function generateIdempotencyKey(prefix: string): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function sameConnections(
  a: ClientInstrument[],
  b: ClientInstrument[]
): boolean {
  if (a === b) return true;

  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id) return false;

    const au =
      (a[i] as ClientInstrument & { updated_at?: string })?.updated_at ?? null;

    const bu =
      (b[i] as ClientInstrument & { updated_at?: string })?.updated_at ?? null;

    if (au !== bu) return false;
  }

  return true;
}

export function ConnectionsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(connectionsReducer, initialState);

  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /**
   * Org-wide completeness for the *currently visible* cache snapshot.
   *
   * Set true only after a successful full page-drain for this tenant.
   * A capped/truncated `all=true` snapshot must never set this.
   * A failed drain leaves the previous value: false when nothing complete
   * was ever committed; true when the last-known-good complete cache C0
   * is still on screen. Local ADD/UPDATE/REMOVE do not change this flag,
   * so a partial cache plus one mutation cannot become "complete".
   */
  const orgWideFetchCompleteRef = useRef(false);

  const { handleError } = useErrorHandler();

  const handleErrorRef = useRef(handleError);

  useEffect(() => {
    handleErrorRef.current = handleError;
  }, [handleError]);

  const { tenantIdentityKey } = useTenantIdentity();

  const inflight = useRef(new Map<string, Promise<void>>());

  const tenantIdentityKeyRef = useRef<string | null>(tenantIdentityKey);

  const previousTenantIdentityKeyRef = useRef<string | null>(tenantIdentityKey);

  useEffect(() => {
    if (previousTenantIdentityKeyRef.current !== tenantIdentityKey) {
      inflight.current.clear();
      orgWideFetchCompleteRef.current = false;

      dispatch({ type: 'RESET_STATE' });
    }

    tenantIdentityKeyRef.current = tenantIdentityKey;

    previousTenantIdentityKeyRef.current = tenantIdentityKey;
  }, [tenantIdentityKey]);

  const deduped = useCallback(
    <T extends () => Promise<void>>(
      tenantKey: string,
      fn: T,
      options?: { force?: boolean }
    ): Promise<void> => {
      const existing = inflight.current.get(tenantKey);

      if (existing && !options?.force) return existing;

      // A forced call (e.g. the refetch after a mutation this caller just
      // awaited) must not silently attach to an unrelated in-flight fetch
      // that may have started *before* that mutation committed - doing so
      // can hand the caller a response that predates their own write,
      // making it look reverted until some later, unrelated fetch happens
      // to run. If one is already in flight, wait for it to settle first
      // (so forced calls still queue instead of piling up parallel
      // requests), then always issue a fresh fetch of our own.
      const run = existing ? existing.catch(() => undefined).then(fn) : fn();

      const promise = run.finally(() => {
        if (inflight.current.get(tenantKey) === promise) {
          inflight.current.delete(tenantKey);
        }
      });

      inflight.current.set(tenantKey, promise);

      return promise;
    },
    []
  );

  const invalidateCache = useCallback(() => {
    orgWideFetchCompleteRef.current = false;

    dispatch({ type: 'INVALIDATE_CACHE' });
  }, []);

  const resetState = useCallback(() => {
    inflight.current.clear();

    orgWideFetchCompleteRef.current = false;

    dispatch({ type: 'RESET_STATE' });
  }, []);

  const upsertConnections = useCallback((rows: ClientInstrument[]) => {
    if (rows.length === 0) return;

    dispatch({
      type: 'UPSERT_CONNECTIONS',
      payload: rows,
    });
  }, []);

  const fetchConnections = useCallback(
    async (opts?: {
      force?: boolean;
      all?: boolean;
      page?: number;
      pageSize?: number;
      suppressErrorToast?: boolean;
      rejectOnError?: boolean;
    }) => {
      const force = opts?.force ?? false;
      const all = opts?.all === true;
      const page = opts?.page ?? CONNECTIONS_DEFAULT_PAGE;
      const pageSize = opts?.pageSize ?? CONNECTIONS_DEFAULT_PAGE_SIZE;
      const suppressErrorToast = opts?.suppressErrorToast ?? false;
      const rejectOnError = opts?.rejectOnError ?? false;

      if (all) {
        if (!force && orgWideFetchCompleteRef.current) return;
      } else if (orgWideFetchCompleteRef.current) {
        // Paged mode is not a production writer of the shared cache.
        // If a complete org-wide snapshot already exists, never replace it
        // with one page — including force — so other consumers cannot
        // observe an invisible downgrade.
        return;
      } else if (!force) {
        const currentState = stateRef.current;

        if (currentState.lastUpdated && currentState.connections.length > 0) {
          return;
        }
      }

      const fetchTenantIdentityKey = tenantIdentityKeyRef.current;
      const inflightKey = fetchTenantIdentityKey ?? NO_TENANT_SCOPE_KEY;

      const runFetch = async () => {
        dispatch({ type: 'START_LOADING' });
        dispatch({ type: 'SET_ERROR', payload: null });

        try {
          const isCurrentTenant = () =>
            tenantIdentityKeyRef.current === fetchTenantIdentityKey;

          let next: ClientInstrument[];
          let nextTruncated = false;
          let markComplete = false;

          if (all) {
            next = await fetchCompleteConnectionCollection({
              pageSize: CONNECTIONS_COMPLETE_PAGE_SIZE,
              isCancelled: () => !isCurrentTenant(),
              fetchPage: async (requestPage, requestPageSize) => {
                if (!isCurrentTenant()) {
                  throw new ConnectionCompleteFetchCancelled();
                }

                const params = new URLSearchParams({
                  orderBy: 'created_at',
                  ascending: 'false',
                  page: String(requestPage),
                  pageSize: String(requestPageSize),
                });
                const res = await apiFetch(
                  `/api/connections?${params.toString()}`
                );

                return readApiResponseEnvelope<ClientInstrument[]>(
                  res,
                  `Failed to fetch connections (${res.status})`
                );
              },
            });
            nextTruncated = false;
            markComplete = true;
          } else {
            const params = new URLSearchParams({
              orderBy: 'created_at',
              ascending: 'false',
              page: String(page),
              pageSize: String(pageSize),
            });
            const res = await apiFetch(`/api/connections?${params.toString()}`);
            const body = await readApiResponseEnvelope<ClientInstrument[]>(
              res,
              `Failed to fetch connections (${res.status})`
            );

            next = Array.isArray(body.data) ? body.data : [];
            nextTruncated = false;
            markComplete = false;
          }

          if (!isCurrentTenant()) {
            return;
          }

          // Complete only after the full drain succeeded. Always commit the
          // aggregate, including a legitimate empty org, so lastUpdated and
          // truncated distinguish "fetched empty" from "not fetched".
          if (markComplete) {
            orgWideFetchCompleteRef.current = true;
            dispatch({
              type: 'SET_CONNECTIONS',
              payload: { connections: next, truncated: nextTruncated },
            });
          } else if (
            !sameConnections(stateRef.current.connections, next) ||
            stateRef.current.truncated !== nextTruncated
          ) {
            dispatch({
              type: 'SET_CONNECTIONS',
              payload: { connections: next, truncated: nextTruncated },
            });
          }
        } catch (err) {
          if (tenantIdentityKeyRef.current !== fetchTenantIdentityKey) {
            return;
          }

          // F5: an aborted request (e.g. a superseded in-flight fetch) is not
          // a user-facing failure - surfacing it as an error would flash a
          // false error state for a request nobody is waiting on anymore.
          if (
            (err instanceof DOMException && err.name === 'AbortError') ||
            err instanceof ConnectionCompleteFetchCancelled
          ) {
            return;
          }

          if (isAuthLikeTenantError(err)) {
            orgWideFetchCompleteRef.current = false;
            dispatch({ type: 'RESET_STATE' });
            if (rejectOnError) {
              throw err instanceof Error ? err : new Error(String(err));
            }
            return;
          }

          dispatch({ type: 'SET_ERROR', payload: err });

          if (!suppressErrorToast) {
            handleErrorRef.current(err, 'Fetch connections');
          }

          if (rejectOnError) {
            throw err instanceof Error ? err : new Error(String(err));
          }
        } finally {
          if (tenantIdentityKeyRef.current === fetchTenantIdentityKey) {
            dispatch({ type: 'END_LOADING' });
          }
        }
      };

      const modeKey = all ? 'all' : `paged:${page}:${pageSize}`;

      return deduped(`${inflightKey}:${modeKey}`, runFetch, { force });
    },
    [deduped]
  );

  const createConnection = useCallback(
    async (connection: Omit<ClientInstrument, 'id' | 'created_at'>) => {
      const mutationTenantIdentityKey = tenantIdentityKeyRef.current;

      dispatch({ type: 'SET_SUBMITTING', payload: true });

      try {
        const res = await apiFetch(
          '/api/connections',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(connection),
          },
          { idempotencyKey: generateIdempotencyKey('connection-create') }
        );

        if (!res.ok) {
          throw await createApiResponseErrorFromResponse(
            res,
            `Failed to create connection (${res.status})`
          );
        }

        const body = await readApiResponseEnvelope<ClientInstrument>(
          res,
          `Failed to create connection (${res.status})`
        );

        if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
          return null;
        }

        const created = body.data;

        if (created) {
          dispatch({ type: 'ADD_CONNECTION', payload: created });
        }

        return created ?? null;
      } catch (err) {
        if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
          return null;
        }

        if (isAuthLikeTenantError(err)) {
          dispatch({ type: 'RESET_STATE' });
          return null;
        }

        handleErrorRef.current(err, 'Create connection');

        return null;
      } finally {
        if (tenantIdentityKeyRef.current === mutationTenantIdentityKey) {
          dispatch({ type: 'SET_SUBMITTING', payload: false });
        }
      }
    },
    []
  );

  const updateConnection = useCallback(
    async (id: string, connection: Partial<ClientInstrument>) => {
      const mutationTenantIdentityKey = tenantIdentityKeyRef.current;

      dispatch({ type: 'SET_SUBMITTING', payload: true });

      try {
        const res = await apiFetch('/api/connections', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...connection }),
        });

        if (!res.ok) {
          throw await createApiResponseErrorFromResponse(
            res,
            `Failed to update connection (${res.status})`
          );
        }

        const body = await readApiResponseEnvelope<ClientInstrument>(
          res,
          `Failed to update connection (${res.status})`
        );

        if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
          return null;
        }

        const updated = body.data;

        if (updated) {
          dispatch({
            type: 'UPDATE_CONNECTION',
            payload: { id, connection: updated },
          });
        }

        return updated ?? null;
      } catch (err) {
        if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
          return null;
        }

        if (isAuthLikeTenantError(err)) {
          dispatch({ type: 'RESET_STATE' });
          return null;
        }

        handleErrorRef.current(err, 'Update connection');

        return null;
      } finally {
        if (tenantIdentityKeyRef.current === mutationTenantIdentityKey) {
          dispatch({ type: 'SET_SUBMITTING', payload: false });
        }
      }
    },
    []
  );

  const deleteConnection = useCallback(async (id: string) => {
    const mutationTenantIdentityKey = tenantIdentityKeyRef.current;

    dispatch({ type: 'SET_SUBMITTING', payload: true });

    try {
      const res = await apiFetch(
        `/api/connections?id=${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        throw await createApiResponseErrorFromResponse(
          res,
          `Failed to delete connection (${res.status})`
        );
      }

      if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
        return false;
      }

      dispatch({ type: 'REMOVE_CONNECTION', payload: id });

      return true;
    } catch (err) {
      if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
        return false;
      }

      if (isAuthLikeTenantError(err)) {
        dispatch({ type: 'RESET_STATE' });
        return false;
      }

      handleErrorRef.current(err, 'Delete connection');

      return false;
    } finally {
      if (tenantIdentityKeyRef.current === mutationTenantIdentityKey) {
        dispatch({ type: 'SET_SUBMITTING', payload: false });
      }
    }
  }, []);

  const actions = useMemo(
    () => ({
      fetchConnections,
      createConnection,
      updateConnection,
      deleteConnection,
      upsertConnections,
      invalidateCache,
      resetState,
    }),
    [
      fetchConnections,
      createConnection,
      updateConnection,
      deleteConnection,
      upsertConnections,
      invalidateCache,
      resetState,
    ]
  );

  const contextValue = useMemo(
    () => ({
      state,
      dispatch,
      actions,
    }),
    [state, actions]
  );

  return (
    <ConnectionsContext.Provider value={contextValue}>
      {children}
    </ConnectionsContext.Provider>
  );
}

export function useConnectionsContext() {
  const ctx = useContext(ConnectionsContext);

  if (!ctx) {
    throw new Error(
      'useConnectionsContext must be used within a ConnectionsProvider'
    );
  }

  return ctx;
}

export function useConnections() {
  const { state, actions } = useConnectionsContext();

  return {
    connections: state.connections,
    loading: state.loading,
    submitting: state.submitting,
    error: state.error,
    truncated: state.truncated,
    lastUpdated: state.lastUpdated,
    ...actions,
  };
}
