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
import { ClientInstrument } from '@/types';
import { useErrorHandler } from '@/contexts/ToastContext';
import { apiFetch } from '@/utils/apiFetch';

// Connections 상태 타입
interface ConnectionsState {
  connections: ClientInstrument[];
  loading: boolean;
  submitting: boolean;
  lastUpdated: Date | null;
}

type ConnectionsAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_CONNECTIONS'; payload: ClientInstrument[] }
  | { type: 'ADD_CONNECTION'; payload: ClientInstrument }
  | {
      type: 'UPDATE_CONNECTION';
      payload: { id: string; connection: ClientInstrument };
    }
  | { type: 'REMOVE_CONNECTION'; payload: string }
  | { type: 'INVALIDATE_CACHE' }
  | { type: 'RESET_STATE' };

const initialState: ConnectionsState = {
  connections: [],
  loading: false,
  submitting: false,
  lastUpdated: null,
};

function connectionsReducer(
  state: ConnectionsState,
  action: ConnectionsAction
): ConnectionsState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_SUBMITTING':
      return { ...state, submitting: action.payload };
    case 'SET_CONNECTIONS':
      return { ...state, connections: action.payload, lastUpdated: new Date() };
    case 'ADD_CONNECTION':
      return {
        ...state,
        connections: [action.payload, ...state.connections],
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
    case 'INVALIDATE_CACHE':
      return { ...state, lastUpdated: null };
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
    fetchConnections: (opts?: { force?: boolean }) => Promise<void>;
    createConnection: (
      connection: Omit<ClientInstrument, 'id' | 'created_at'>
    ) => Promise<ClientInstrument | null>;
    updateConnection: (
      id: string,
      connection: Partial<ClientInstrument>
    ) => Promise<ClientInstrument | null>;
    deleteConnection: (id: string) => Promise<boolean>;
    invalidateCache: () => void;
    resetState: () => void;
  };
};

const ConnectionsContext = createContext<ConnectionsContextValue | null>(null);

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

function sameConnections(
  a: ClientInstrument[],
  b: ClientInstrument[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id) return false;
    const au = (a[i] as ClientInstrument & { updated_at?: string })?.updated_at;
    const bu = (b[i] as ClientInstrument & { updated_at?: string })?.updated_at;
    if (au && bu && au !== bu) return false;
  }
  return true;
}

export function ConnectionsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(connectionsReducer, initialState);
  const { handleError } = useErrorHandler();

  // In-flight request deduplication
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

  const fetchConnections = useCallback(
    async (opts?: { force?: boolean }) => {
      const force = opts?.force ?? false;

      // Optional cache check: already loaded & not forced -> skip
      if (!force && state.lastUpdated && state.connections.length > 0) return;

      return deduped(async () => {
        dispatch({ type: 'SET_LOADING', payload: true });
        try {
          const res = await apiFetch(
            '/api/connections?orderBy=created_at&ascending=false'
          );
          const body = await safeJson(res);

          if (!res.ok) {
            const errorObj = body?.error;
            if (errorObj instanceof Error) {
              throw errorObj;
            }
            const message =
              (typeof errorObj === 'string' && errorObj) ||
              (typeof body?.message === 'string' && body.message) ||
              res.statusText ||
              'Failed to fetch connections';
            throw new Error(message);
          }

          const next = Array.isArray(body?.data)
            ? (body?.data as ClientInstrument[])
            : [];

          // Avoid unnecessary re-render
          if (!sameConnections(state.connections, next)) {
            dispatch({ type: 'SET_CONNECTIONS', payload: next });
          }
        } catch (err) {
          handleError(err, 'Fetch connections');
        } finally {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      });
    },
    [deduped, handleError, state.connections, state.lastUpdated]
  );

  const createConnection = useCallback(
    async (connection: Omit<ClientInstrument, 'id' | 'created_at'>) => {
      dispatch({ type: 'SET_SUBMITTING', payload: true });
      try {
        const res = await apiFetch('/api/connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(connection),
        });

        const body = await safeJson(res);

        if (!res.ok) {
          const message =
            (typeof body?.error === 'string' && body.error) ||
            (typeof body?.message === 'string' && body.message) ||
            res.statusText ||
            'Failed to create connection';
          throw new Error(message);
        }

        const created = body?.data as ClientInstrument | undefined;
        if (created) {
          dispatch({ type: 'ADD_CONNECTION', payload: created });
        }
        return created ?? null;
      } catch (err) {
        handleError(err, 'Create connection');
        return null;
      } finally {
        dispatch({ type: 'SET_SUBMITTING', payload: false });
      }
    },
    [handleError]
  );

  const updateConnection = useCallback(
    async (id: string, connection: Partial<ClientInstrument>) => {
      dispatch({ type: 'SET_SUBMITTING', payload: true });
      try {
        const res = await apiFetch('/api/connections', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...connection }),
        });

        const body = await safeJson(res);

        if (!res.ok) {
          const message =
            (typeof body?.error === 'string' && body.error) ||
            (typeof body?.message === 'string' && body.message) ||
            res.statusText ||
            'Failed to update connection';
          throw new Error(message);
        }

        const updated = body?.data as ClientInstrument | undefined;
        if (updated) {
          dispatch({
            type: 'UPDATE_CONNECTION',
            payload: { id, connection: updated },
          });
        }
        return updated ?? null;
      } catch (err) {
        handleError(err, 'Update connection');
        return null;
      } finally {
        dispatch({ type: 'SET_SUBMITTING', payload: false });
      }
    },
    [handleError]
  );

  const deleteConnection = useCallback(
    async (id: string) => {
      dispatch({ type: 'SET_SUBMITTING', payload: true });
      try {
        const res = await apiFetch(
          `/api/connections?id=${encodeURIComponent(id)}`,
          {
            method: 'DELETE',
          }
        );

        const body = await safeJson(res);

        if (!res.ok) {
          const message =
            (typeof body?.error === 'string' && body.error) ||
            (typeof body?.message === 'string' && body.message) ||
            res.statusText ||
            'Failed to delete connection';
          throw new Error(message);
        }

        dispatch({ type: 'REMOVE_CONNECTION', payload: id });
        return true;
      } catch (err) {
        handleError(err, 'Delete connection');
        return false;
      } finally {
        dispatch({ type: 'SET_SUBMITTING', payload: false });
      }
    },
    [handleError]
  );

  const actions = useMemo(
    () => ({
      fetchConnections,
      createConnection,
      updateConnection,
      deleteConnection,
      invalidateCache,
      resetState,
    }),
    [
      fetchConnections,
      createConnection,
      updateConnection,
      deleteConnection,
      invalidateCache,
      resetState,
    ]
  );

  return (
    <ConnectionsContext.Provider value={{ state, dispatch, actions }}>
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
    lastUpdated: state.lastUpdated,
    ...actions,
  };
}
