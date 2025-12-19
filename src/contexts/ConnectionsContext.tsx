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

// Connections 액션 타입
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

// 초기 상태
const initialState: ConnectionsState = {
  connections: [],
  loading: false,
  submitting: false,
  lastUpdated: null,
};

// 리듀서
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
      return {
        ...state,
        connections: action.payload,
        lastUpdated: new Date(),
      };

    case 'ADD_CONNECTION':
      return {
        ...state,
        connections: [action.payload, ...state.connections],
        lastUpdated: new Date(),
      };

    case 'UPDATE_CONNECTION':
      return {
        ...state,
        connections: state.connections.map(connection =>
          connection.id === action.payload.id
            ? action.payload.connection
            : connection
        ),
        lastUpdated: new Date(),
      };

    case 'REMOVE_CONNECTION':
      return {
        ...state,
        connections: state.connections.filter(
          connection => connection.id !== action.payload
        ),
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

// Context 생성
const ConnectionsContext = createContext<{
  state: ConnectionsState;
  dispatch: React.Dispatch<ConnectionsAction>;
  actions: {
    fetchConnections: () => Promise<void>;
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
} | null>(null);

// Provider 컴포넌트
export function ConnectionsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(connectionsReducer, initialState);
  const { handleError } = useErrorHandler();

  // In-flight request deduplication
  const inflight = useRef<Promise<void> | null>(null);

  const deduped = useCallback(
    <T extends () => Promise<void>>(fn: T): Promise<void> => {
      if (inflight.current) {
        return inflight.current;
      }
      const p = fn().finally(() => {
        inflight.current = null;
      });
      inflight.current = p;
      return p;
    },
    []
  );

  // 캐시 무효화 함수
  const invalidateCache = useCallback(() => {
    dispatch({ type: 'INVALIDATE_CACHE' });
  }, []);

  // 상태 리셋 함수
  const resetState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

  // Connections 액션들
  const fetchConnections = useCallback(async () => {
    return deduped(async () => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const response = await apiFetch(
          '/api/connections?orderBy=created_at&ascending=false'
        );
        if (!response.ok) {
          let errorMessage = 'Failed to fetch connections';
          try {
            const errorData = await response.json();
            errorMessage =
              errorData.error?.message || errorData.error || errorMessage;
          } catch {
            // If response is not JSON, use status text
            errorMessage = response.statusText || errorMessage;
          }
          throw new Error(errorMessage);
        }
        const result = await response.json();
        dispatch({ type: 'SET_CONNECTIONS', payload: result.data || [] });
      } catch (error) {
        handleError(error, 'Fetch connections');
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    });
  }, [handleError, deduped]);

  const createConnection = useCallback(
    async (connection: Omit<ClientInstrument, 'id' | 'created_at'>) => {
      dispatch({ type: 'SET_SUBMITTING', payload: true });
      try {
        const response = await apiFetch('/api/connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(connection),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw errorData.error || new Error('Failed to create connection');
        }
        const result = await response.json();
        if (result.data) {
          dispatch({ type: 'ADD_CONNECTION', payload: result.data });
        }
        return result.data;
      } catch (error) {
        handleError(error, 'Create connection');
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
        const response = await apiFetch('/api/connections', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...connection }),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw errorData.error || new Error('Failed to update connection');
        }
        const result = await response.json();
        if (result.data) {
          dispatch({
            type: 'UPDATE_CONNECTION',
            payload: { id, connection: result.data },
          });
        }
        return result.data;
      } catch (error) {
        handleError(error, 'Update connection');
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
        const response = await apiFetch(`/api/connections?id=${id}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw errorData.error || new Error('Failed to delete connection');
        }
        dispatch({ type: 'REMOVE_CONNECTION', payload: id });
        return true;
      } catch (error) {
        handleError(error, 'Delete connection');
        return false;
      } finally {
        dispatch({ type: 'SET_SUBMITTING', payload: false });
      }
    },
    [handleError]
  );

  // actions 객체를 useMemo로 메모이제이션
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

// Hook for using the context
export function useConnectionsContext() {
  const context = useContext(ConnectionsContext);
  if (!context) {
    throw new Error(
      'useConnectionsContext must be used within a ConnectionsProvider'
    );
  }
  return context;
}

// 특화된 훅
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
