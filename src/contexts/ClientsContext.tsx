'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { Client } from '@/types';
import { fetchClients as serviceFetchClients } from '@/services/dataService';
import { useErrorHandler } from '@/contexts/ToastContext';
import { apiFetch } from '@/utils/apiFetch';
import { logInfo, logWarn } from '@/utils/logger';

interface ClientsState {
  clients: Client[];
  loading: boolean;
  submitting: boolean;
  lastUpdated: Date | null;
}

type ClientsAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_CLIENTS'; payload: Client[] }
  | { type: 'ADD_CLIENT'; payload: Client }
  | { type: 'UPDATE_CLIENT'; payload: { id: string; client: Client } }
  | { type: 'REMOVE_CLIENT'; payload: string }
  | { type: 'INVALIDATE_CACHE' }
  | { type: 'RESET_STATE' };

const initialState: ClientsState = {
  clients: [],
  loading: false,
  submitting: false,
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
    case 'SET_CLIENTS':
      return { ...state, clients: action.payload, lastUpdated: new Date() };
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
    invalidateCache: () => void;
    resetState: () => void;
  };
};

const CLIENTS_DEFAULT_PAGE = 1;
const CLIENTS_DEFAULT_PAGE_SIZE = 150;

const ClientsContext = createContext<ClientsContextValue | null>(null);

function isAuthLikeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : '';
  const code =
    typeof err === 'object' && err && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined;

  return (
    msg.includes('Invalid Refresh Token') ||
    msg.includes('Refresh Token Not Found') ||
    code === 'SESSION_EXPIRED' ||
    code === 'UNAUTHORIZED'
  );
}

type JsonRecord = Record<string, unknown>;

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
  const { handleError } = useErrorHandler();

  // In-flight request deduplication (fetchClients only)
  const inflight = useRef<Promise<void> | null>(null);
  const deduped = useCallback(
    <T extends () => Promise<void>>(fn: T): Promise<void> => {
      if (inflight.current) return inflight.current;
      const p = fn().finally(() => {
        inflight.current = null;
      });
      inflight.current = p;
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

  const fetchClients = useCallback(
    async (opts?: { force?: boolean }) => {
      const force = opts?.force ?? false;

      // Optional cache check (very light): if not forced and already loaded, skip
      if (!force && state.lastUpdated && state.clients.length > 0) {
        return;
      }

      return deduped(async () => {
        dispatch({ type: 'SET_LOADING', payload: true });

        try {
          const fetcher = async (): Promise<Client[]> => {
            const res = await apiFetch(
              `/api/clients?orderBy=created_at&ascending=false&page=${CLIENTS_DEFAULT_PAGE}&pageSize=${CLIENTS_DEFAULT_PAGE_SIZE}`
            );

            if (!res.ok) {
              const body = await safeJson(res);
              const err =
                body?.error ??
                new Error(`Failed to fetch clients (${res.status})`);

              // Auth-like error: bubble up as Error for统一처리
              if (isAuthLikeError(err)) {
                throw err;
              }

              throw err;
            }

            const body = await safeJson(res);
            if (Array.isArray(body?.data)) {
              return body?.data as Client[];
            }
            return [];
          };

          const clients = await serviceFetchClients(fetcher);

          logInfo(
            `[ClientsContext] fetchClients: Received ${clients.length} clients`
          );
          if (clients.length === 0) {
            logWarn(
              '[ClientsContext] fetchClients: Received empty array (could be valid)'
            );
          }

          // Avoid unnecessary re-renders if identical
          if (!sameClientList(state.clients, clients)) {
            dispatch({ type: 'SET_CLIENTS', payload: clients });
          }
        } catch (err) {
          // IMPORTANT: Do NOT clear clients on auth errors here.
          // AuthContext/AppLayout should handle redirect/logout.
          if (isAuthLikeError(err)) {
            logWarn(
              '[ClientsContext] fetchClients auth-like error; keeping existing state'
            );
            return;
          }
          handleError(err, 'Fetch clients');
        } finally {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      });
    },
    [deduped, handleError, state.clients, state.lastUpdated]
  );

  const createClient = useCallback(
    async (client: Omit<Client, 'id' | 'created_at'>) => {
      dispatch({ type: 'SET_SUBMITTING', payload: true });
      try {
        const res = await apiFetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(client),
        });

        if (!res.ok) {
          const body = await safeJson(res);
          throw (
            body?.error ?? new Error(`Failed to create client (${res.status})`)
          );
        }

        const body = await safeJson(res);
        const created = body?.data as Client | undefined;
        if (created) dispatch({ type: 'ADD_CLIENT', payload: created });
        return created ?? null;
      } catch (err) {
        handleError(err, 'Create client');
        return null;
      } finally {
        dispatch({ type: 'SET_SUBMITTING', payload: false });
      }
    },
    [handleError]
  );

  const updateClient = useCallback(
    async (id: string, client: Partial<Client>) => {
      dispatch({ type: 'SET_SUBMITTING', payload: true });
      try {
        const res = await apiFetch('/api/clients', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...client }),
        });

        if (!res.ok) {
          const body = await safeJson(res);
          throw (
            body?.error ?? new Error(`Failed to update client (${res.status})`)
          );
        }

        const body = await safeJson(res);
        const updated = body?.data as Client | undefined;
        if (updated) {
          dispatch({ type: 'UPDATE_CLIENT', payload: { id, client: updated } });
        }
        return updated ?? null;
      } catch (err) {
        handleError(err, 'Update client');
        return null;
      } finally {
        dispatch({ type: 'SET_SUBMITTING', payload: false });
      }
    },
    [handleError]
  );

  const deleteClient = useCallback(
    async (id: string) => {
      dispatch({ type: 'SET_SUBMITTING', payload: true });
      try {
        // ✅ FIXED: Use apiFetch for consistency (auth/cookies/error handling)
        const res = await apiFetch(
          `/api/clients?id=${encodeURIComponent(id)}`,
          {
            method: 'DELETE',
          }
        );

        if (!res.ok) {
          const body = await safeJson(res);
          throw (
            body?.error ?? new Error(`Failed to delete client (${res.status})`)
          );
        }

        dispatch({ type: 'REMOVE_CLIENT', payload: id });
        return true;
      } catch (err) {
        handleError(err, 'Delete client');
        return false;
      } finally {
        dispatch({ type: 'SET_SUBMITTING', payload: false });
      }
    },
    [handleError]
  );

  const actions = useMemo(
    () => ({
      fetchClients,
      createClient,
      updateClient,
      deleteClient,
      invalidateCache,
      resetState,
    }),
    [
      fetchClients,
      createClient,
      updateClient,
      deleteClient,
      invalidateCache,
      resetState,
    ]
  );

  return (
    <ClientsContext.Provider value={{ state, dispatch, actions }}>
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
    lastUpdated: state.lastUpdated,
    ...actions,
  };
}
