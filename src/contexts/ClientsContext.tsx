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
import { Client } from '@/types';
import { useErrorHandler } from '@/contexts/ToastContext';
import { apiFetch } from '@/utils/apiFetch';
import { createApiResponseError } from '@/utils/handleApiResponse';
import { logInfo, logWarn } from '@/utils/logger';
import { isAuthLikeTenantError } from '@/utils/tenantIdentity';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';

interface ClientsState {
  clients: Client[];
  loading: boolean;
  submitting: boolean;
  error: unknown | null;
  lastUpdated: Date | null;
}

type ClientsAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: unknown | null }
  | { type: 'SET_CLIENTS'; payload: Client[] }
  | { type: 'ADD_CLIENT'; payload: Client }
  | { type: 'UPDATE_CLIENT'; payload: { id: string; client: Client } }
  | { type: 'REMOVE_CLIENT'; payload: string }
  | { type: 'UPSERT_CLIENT'; payload: Client }
  | { type: 'INVALIDATE_CACHE' }
  | { type: 'RESET_STATE' };

const initialState: ClientsState = {
  clients: [],
  loading: false,
  submitting: false,
  error: null,
  lastUpdated: null,
};

function clientsReducer(
  state: ClientsState,
  action: ClientsAction
): ClientsState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_SUBMITTING':
      return { ...state, submitting: action.payload };
    case 'SET_ERROR':
      // null = fetch-start housekeeping; non-null = fatal failure, clear stale data.
      if (action.payload === null) {
        return { ...state, error: null };
      }
      return { ...state, clients: [], error: action.payload };
    case 'SET_CLIENTS':
      return {
        ...state,
        clients: action.payload,
        error: null,
        lastUpdated: new Date(),
      };
    case 'ADD_CLIENT':
      return {
        ...state,
        clients: [action.payload, ...state.clients],
        lastUpdated: new Date(),
      };
    case 'UPDATE_CLIENT':
      return {
        ...state,
        clients: state.clients.map(c =>
          c.id === action.payload.id ? action.payload.client : c
        ),
        lastUpdated: new Date(),
      };
    case 'REMOVE_CLIENT':
      return {
        ...state,
        clients: state.clients.filter(c => c.id !== action.payload),
        lastUpdated: new Date(),
      };
    case 'UPSERT_CLIENT': {
      const c = action.payload;
      const idx = state.clients.findIndex(x => x.id === c.id);
      if (idx === -1) {
        return {
          ...state,
          clients: [c, ...state.clients],
          lastUpdated: new Date(),
        };
      }
      const next = [...state.clients];
      next[idx] = c;
      return { ...state, clients: next, lastUpdated: new Date() };
    }
    case 'INVALIDATE_CACHE':
      // Stale-while-revalidate: preserve data, clear freshness only.
      return { ...state, lastUpdated: null };
    case 'RESET_STATE':
      return initialState;
    default:
      return state;
  }
}

type ClientsContextValue = {
  state: ClientsState;
  dispatch: React.Dispatch<ClientsAction>;
  actions: {
    fetchClients: (opts?: { force?: boolean }) => Promise<void>;
    createClient: (
      client: Omit<Client, 'id' | 'created_at'>
    ) => Promise<Client | null>;
    updateClient: (
      id: string,
      client: Partial<Client>
    ) => Promise<Client | null>;
    deleteClient: (id: string) => Promise<boolean>;
    /** Merge by id: insert or replace without a network round-trip */
    upsertClient: (client: Client) => void;
    invalidateCache: () => void;
    resetState: () => void;
  };
};

const CLIENTS_DEFAULT_PAGE = 1;
const CLIENTS_DEFAULT_PAGE_SIZE = 150;

const ClientsContext = createContext<ClientsContextValue | null>(null);

type JsonRecord = Record<string, unknown>;
const NO_TENANT_SCOPE_KEY = '__no-tenant__';

async function safeJson(res: Response): Promise<JsonRecord | null> {
  try {
    const json = await res.json();
    if (json && typeof json === 'object') {
      return json as JsonRecord;
    }
    return null;
  } catch {
    return null;
  }
}

function getResponseError(
  body: JsonRecord | null,
  res: Response,
  fallbackMessage: string
): Error {
  return createApiResponseError(body, {
    status: res.status,
    fallbackMessage,
  });
}

function sameClientList(a: Client[], b: Client[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  // Cheap stable comparison: id + updated_at(if exists) ordering match
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id) return false;
    const au = (a[i] as Client & { updated_at?: string })?.updated_at;
    const bu = (b[i] as Client & { updated_at?: string })?.updated_at;
    if (au && bu && au !== bu) return false;
  }
  return true;
}

export function ClientsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(clientsReducer, initialState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const { handleError } = useErrorHandler();
  const handleErrorRef = useRef(handleError);
  useEffect(() => {
    handleErrorRef.current = handleError;
  }, [handleError]);

  const { tenantIdentityKey } = useTenantIdentity();

  // In-flight request deduplication is tenant-scoped.
  const inflight = useRef(new Map<string, Promise<void>>());
  const tenantIdentityKeyRef = useRef<string | null>(tenantIdentityKey);
  const previousTenantIdentityKeyRef = useRef<string | null>(tenantIdentityKey);

  useEffect(() => {
    if (previousTenantIdentityKeyRef.current !== tenantIdentityKey) {
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

      const p = fn().finally(() => {
        if (inflight.current.get(tenantKey) === p) {
          inflight.current.delete(tenantKey);
        }
      });
      inflight.current.set(tenantKey, p);
      return p;
    },
    []
  );

  const invalidateCache = useCallback(() => {
    dispatch({ type: 'INVALIDATE_CACHE' });
  }, []);

  const resetState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

  const upsertClient = useCallback((client: Client) => {
    dispatch({ type: 'UPSERT_CLIENT', payload: client });
  }, []);

  const fetchClients = useCallback(
    async (opts?: { force?: boolean }) => {
      const force = opts?.force ?? false;

      // Optional cache check (very light): if not forced and already loaded, skip
      // Reads latest state via ref so the callback identity stays stable.
      if (!force) {
        const { lastUpdated, clients: cur } = stateRef.current;
        if (lastUpdated && cur.length > 0) {
          return;
        }
      }

      const fetchTenantIdentityKey = tenantIdentityKeyRef.current;
      const inflightKey = fetchTenantIdentityKey ?? NO_TENANT_SCOPE_KEY;

      return deduped(inflightKey, async () => {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });

        try {
          const res = await apiFetch(
            `/api/clients?orderBy=created_at&ascending=false&page=${CLIENTS_DEFAULT_PAGE}&pageSize=${CLIENTS_DEFAULT_PAGE_SIZE}`
          );

          if (!res.ok) {
            const body = await safeJson(res);
            const err = getResponseError(body, res, 'Failed to fetch clients');

            if (isAuthLikeTenantError(err)) {
              throw err;
            }

            throw err;
          }

          const body = await safeJson(res);
          const clients = Array.isArray(body?.data)
            ? (body?.data as Client[])
            : [];

          logInfo(
            `[ClientsContext] fetchClients: Received ${clients.length} clients`
          );
          if (clients.length === 0) {
            logWarn(
              '[ClientsContext] fetchClients: Received empty array (could be valid)'
            );
          }

          if (tenantIdentityKeyRef.current !== fetchTenantIdentityKey) {
            return;
          }

          // Avoid unnecessary re-renders if identical
          if (!sameClientList(stateRef.current.clients, clients)) {
            dispatch({ type: 'SET_CLIENTS', payload: clients });
          }
        } catch (err) {
          if (tenantIdentityKeyRef.current !== fetchTenantIdentityKey) {
            return;
          }
          if (isAuthLikeTenantError(err)) {
            dispatch({ type: 'RESET_STATE' });
            logWarn(
              '[ClientsContext] fetchClients auth-like error; cleared tenant-scoped state'
            );
            return;
          }
          dispatch({ type: 'SET_ERROR', payload: err });
          handleErrorRef.current(err, 'Fetch clients');
        } finally {
          if (tenantIdentityKeyRef.current === fetchTenantIdentityKey) {
            dispatch({ type: 'SET_LOADING', payload: false });
          }
        }
      });
    },
    [deduped]
  );

  const createClient = useCallback(
    async (client: Omit<Client, 'id' | 'created_at'>) => {
      const mutationTenantIdentityKey = tenantIdentityKeyRef.current;
      dispatch({ type: 'SET_SUBMITTING', payload: true });
      try {
        const res = await apiFetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(client),
        });

        if (!res.ok) {
          const body = await safeJson(res);
          throw getResponseError(body, res, 'Failed to create client');
        }

        const body = await safeJson(res);
        if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
          return null;
        }
        const created = body?.data as Client | undefined;
        if (created) dispatch({ type: 'ADD_CLIENT', payload: created });
        return created ?? null;
      } catch (err) {
        if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
          return null;
        }
        if (isAuthLikeTenantError(err)) {
          dispatch({ type: 'RESET_STATE' });
          return null;
        }
        handleErrorRef.current(err, 'Create client');
        return null;
      } finally {
        if (tenantIdentityKeyRef.current === mutationTenantIdentityKey) {
          dispatch({ type: 'SET_SUBMITTING', payload: false });
        }
      }
    },
    []
  );

  const updateClient = useCallback(
    async (id: string, client: Partial<Client>) => {
      const mutationTenantIdentityKey = tenantIdentityKeyRef.current;
      dispatch({ type: 'SET_SUBMITTING', payload: true });
      try {
        const res = await apiFetch('/api/clients', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...client }),
        });

        if (!res.ok) {
          const body = await safeJson(res);
          throw getResponseError(body, res, 'Failed to update client');
        }

        const body = await safeJson(res);
        if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
          return null;
        }
        const updated = body?.data as Client | undefined;
        if (updated) {
          dispatch({ type: 'UPDATE_CLIENT', payload: { id, client: updated } });
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
        handleErrorRef.current(err, 'Update client');
        return null;
      } finally {
        if (tenantIdentityKeyRef.current === mutationTenantIdentityKey) {
          dispatch({ type: 'SET_SUBMITTING', payload: false });
        }
      }
    },
    []
  );

  const deleteClient = useCallback(async (id: string) => {
    const mutationTenantIdentityKey = tenantIdentityKeyRef.current;
    dispatch({ type: 'SET_SUBMITTING', payload: true });
    try {
      // ✅ FIXED: Use apiFetch for consistency (auth/cookies/error handling)
      const res = await apiFetch(`/api/clients?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const body = await safeJson(res);
        throw getResponseError(body, res, 'Failed to delete client');
      }

      if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
        return false;
      }
      dispatch({ type: 'REMOVE_CLIENT', payload: id });
      return true;
    } catch (err) {
      if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
        return false;
      }
      if (isAuthLikeTenantError(err)) {
        dispatch({ type: 'RESET_STATE' });
        return false;
      }
      handleErrorRef.current(err, 'Delete client');
      return false;
    } finally {
      if (tenantIdentityKeyRef.current === mutationTenantIdentityKey) {
        dispatch({ type: 'SET_SUBMITTING', payload: false });
      }
    }
  }, []);

  const actions = useMemo(
    () => ({
      fetchClients,
      createClient,
      updateClient,
      deleteClient,
      upsertClient,
      invalidateCache,
      resetState,
    }),
    [
      fetchClients,
      createClient,
      updateClient,
      deleteClient,
      upsertClient,
      invalidateCache,
      resetState,
    ]
  );

  const contextValue = useMemo(
    () => ({ state, dispatch, actions }),
    [state, dispatch, actions]
  );

  return (
    <ClientsContext.Provider value={contextValue}>
      {children}
    </ClientsContext.Provider>
  );
}

export function useClientsContext() {
  const ctx = useContext(ClientsContext);
  if (!ctx)
    throw new Error('useClientsContext must be used within a ClientsProvider');
  return ctx;
}

export function useClients() {
  const { state, actions } = useClientsContext();
  return {
    clients: state.clients,
    loading: state.loading,
    submitting: state.submitting,
    error: state.error,
    lastUpdated: state.lastUpdated,
    ...actions,
  };
}
