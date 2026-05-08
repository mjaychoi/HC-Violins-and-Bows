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

interface ConnectionsState {
  connections: ClientInstrument[];
  loading: boolean;
  loadingCount: number;
  submitting: boolean;
  error: unknown | null;
  lastUpdated: Date | null;
}

type ConnectionsAction =
  | { type: 'START_LOADING' }
  | { type: 'END_LOADING' }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: unknown | null }
  | { type: 'SET_CONNECTIONS'; payload: ClientInstrument[] }
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

      return {
        ...state,
        connections: [],
        error: action.payload,
      };

    case 'SET_CONNECTIONS':
      return {
        ...state,
        connections: action.payload,
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
      fn: T
    ): Promise<void> => {
      const existing = inflight.current.get(tenantKey);

      if (existing) return existing;

      const promise = fn().finally(() => {
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

      if (!force) {
        if (all) {
          if (orgWideFetchCompleteRef.current) return;
        } else {
          const currentState = stateRef.current;

          if (currentState.lastUpdated && currentState.connections.length > 0) {
            return;
          }
        }
      }

      const fetchTenantIdentityKey = tenantIdentityKeyRef.current;
      const inflightKey = fetchTenantIdentityKey ?? NO_TENANT_SCOPE_KEY;

      const runFetch = async () => {
        dispatch({ type: 'START_LOADING' });
        dispatch({ type: 'SET_ERROR', payload: null });

        try {
          const base = new URLSearchParams({
            orderBy: 'created_at',
            ascending: 'false',
          });

          if (all) {
            base.set('all', 'true');
          } else {
            base.set('page', String(page));
            base.set('pageSize', String(pageSize));
          }

          const res = await apiFetch(`/api/connections?${base.toString()}`);
          const body = await readApiResponseEnvelope<ClientInstrument[]>(
            res,
            `Failed to fetch connections (${res.status})`
          );

          const next = Array.isArray(body.data) ? body.data : [];

          if (tenantIdentityKeyRef.current !== fetchTenantIdentityKey) {
            return;
          }

          orgWideFetchCompleteRef.current = all;

          if (!sameConnections(stateRef.current.connections, next)) {
            dispatch({ type: 'SET_CONNECTIONS', payload: next });
          }
        } catch (err) {
          if (tenantIdentityKeyRef.current !== fetchTenantIdentityKey) {
            return;
          }

          if (isAuthLikeTenantError(err)) {
            orgWideFetchCompleteRef.current = false;
            dispatch({ type: 'RESET_STATE' });
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

      return deduped(`${inflightKey}:${modeKey}`, runFetch);
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
    lastUpdated: state.lastUpdated,
    ...actions,
  };
}
