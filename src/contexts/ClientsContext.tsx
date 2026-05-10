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
import {
  createApiResponseErrorFromResponse,
  readApiResponseEnvelope,
} from '@/utils/handleApiResponse';
import { logInfo, logWarn } from '@/utils/logger';
import { isAuthLikeTenantError } from '@/utils/tenantIdentity';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';

interface ClientsState {
  clients: Client[];
  loading: boolean;
  loadingCount: number;
  submitting: boolean;
  error: unknown | null;
  lastUpdated: Date | null;
}

type ClientsAction =
  | { type: 'START_LOADING' }
  | { type: 'END_LOADING' }
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
  loadingCount: 0,
  submitting: false,
  error: null,
  lastUpdated: null,
};

function clientsReducer(
  state: ClientsState,
  action: ClientsAction
): ClientsState {
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
        clients: [
          action.payload,
          ...state.clients.filter(client => client.id !== action.payload.id),
        ],
        lastUpdated: new Date(),
      };

    case 'UPDATE_CLIENT':
      return {
        ...state,
        clients: state.clients.map(client =>
          client.id === action.payload.id ? action.payload.client : client
        ),
        lastUpdated: new Date(),
      };

    case 'REMOVE_CLIENT':
      return {
        ...state,
        clients: state.clients.filter(client => client.id !== action.payload),
        lastUpdated: new Date(),
      };

    case 'UPSERT_CLIENT': {
      const client = action.payload;
      const idx = state.clients.findIndex(item => item.id === client.id);

      if (idx === -1) {
        return {
          ...state,
          clients: [client, ...state.clients],
          lastUpdated: new Date(),
        };
      }

      const next = [...state.clients];
      next[idx] = client;

      return {
        ...state,
        clients: next,
        lastUpdated: new Date(),
      };
    }

    case 'INVALIDATE_CACHE':
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
    upsertClient: (client: Client) => void;
    invalidateCache: () => void;
    resetState: () => void;
  };
};

const NO_TENANT_SCOPE_KEY = '__no-tenant__';

const ClientsContext = createContext<ClientsContextValue | null>(null);

function generateIdempotencyKey(prefix: string): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function sameClientList(a: Client[], b: Client[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.id !== b[i]?.id) return false;

    const au = (a[i] as Client & { updated_at?: string })?.updated_at ?? null;
    const bu = (b[i] as Client & { updated_at?: string })?.updated_at ?? null;

    if (au !== bu) return false;
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

  const inflight = useRef(new Map<string, Promise<void>>());
  const tenantIdentityKeyRef = useRef<string | null>(tenantIdentityKey);
  const previousTenantIdentityKeyRef = useRef<string | null>(tenantIdentityKey);

  useEffect(() => {
    if (previousTenantIdentityKeyRef.current !== tenantIdentityKey) {
      inflight.current.clear();
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
    dispatch({ type: 'INVALIDATE_CACHE' });
  }, []);

  const resetState = useCallback(() => {
    inflight.current.clear();
    dispatch({ type: 'RESET_STATE' });
  }, []);

  const upsertClient = useCallback((client: Client) => {
    dispatch({ type: 'UPSERT_CLIENT', payload: client });
  }, []);

  const fetchClients = useCallback(
    async (opts?: { force?: boolean }) => {
      const force = opts?.force ?? false;

      if (!force) {
        const { lastUpdated, clients } = stateRef.current;
        if (lastUpdated && clients.length > 0) return;
      }

      const fetchTenantIdentityKey = tenantIdentityKeyRef.current;
      const inflightKey = fetchTenantIdentityKey ?? NO_TENANT_SCOPE_KEY;

      return deduped(inflightKey, async () => {
        dispatch({ type: 'START_LOADING' });
        dispatch({ type: 'SET_ERROR', payload: null });

        try {
          const res = await apiFetch(
            '/api/clients?orderBy=created_at&ascending=false&all=true'
          );

          const body = await readApiResponseEnvelope<Client[]>(
            res,
            `Failed to fetch clients (${res.status})`
          );
          const clients = Array.isArray(body.data) ? body.data : [];

          if (body.truncated === true) {
            logWarn(
              '[ClientsContext] fetchClients: response truncated — org has more than 1 000 clients; only the first 1 000 were loaded.'
            );
          }

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
            dispatch({ type: 'END_LOADING' });
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
        const res = await apiFetch(
          '/api/clients',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(client),
          },
          { idempotencyKey: generateIdempotencyKey('client-create') }
        );

        if (!res.ok) {
          throw await createApiResponseErrorFromResponse(
            res,
            `Failed to create client (${res.status})`
          );
        }

        const body = await readApiResponseEnvelope<Client>(
          res,
          `Failed to create client (${res.status})`
        );

        if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
          return null;
        }

        const created = body.data;

        if (created) {
          dispatch({ type: 'ADD_CLIENT', payload: created });
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
          throw await createApiResponseErrorFromResponse(
            res,
            `Failed to update client (${res.status})`
          );
        }

        const body = await readApiResponseEnvelope<Client>(
          res,
          `Failed to update client (${res.status})`
        );

        if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
          return null;
        }

        const updated = body.data;

        if (updated) {
          dispatch({
            type: 'UPDATE_CLIENT',
            payload: { id, client: updated },
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
      const res = await apiFetch(`/api/clients?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw await createApiResponseErrorFromResponse(
          res,
          `Failed to delete client (${res.status})`
        );
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
    [state, actions]
  );

  return (
    <ClientsContext.Provider value={contextValue}>
      {children}
    </ClientsContext.Provider>
  );
}

export function useClientsContext() {
  const ctx = useContext(ClientsContext);

  if (!ctx) {
    throw new Error('useClientsContext must be used within a ClientsProvider');
  }

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
