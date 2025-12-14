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

// Clients 상태 타입
interface ClientsState {
  clients: Client[];
  loading: boolean;
  submitting: boolean;
  lastUpdated: Date | null;
}

// Clients 액션 타입
type ClientsAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_CLIENTS'; payload: Client[] }
  | { type: 'ADD_CLIENT'; payload: Client }
  | { type: 'UPDATE_CLIENT'; payload: { id: string; client: Client } }
  | { type: 'REMOVE_CLIENT'; payload: string }
  | { type: 'INVALIDATE_CACHE' }
  | { type: 'RESET_STATE' };

// 초기 상태
const initialState: ClientsState = {
  clients: [],
  loading: false,
  submitting: false,
  lastUpdated: null,
};

// 리듀서
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
      return {
        ...state,
        clients: action.payload,
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

    case 'INVALIDATE_CACHE':
      return { ...state, lastUpdated: null };

    case 'RESET_STATE':
      return initialState;

    default:
      return state;
  }
}

// Context 생성
const ClientsContext = createContext<{
  state: ClientsState;
  dispatch: React.Dispatch<ClientsAction>;
  actions: {
    fetchClients: () => Promise<void>;
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
} | null>(null);

// Provider 컴포넌트
export function ClientsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(clientsReducer, initialState);
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

  // Clients 액션들
  const fetchClients = useCallback(async () => {
    return deduped(async () => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const fetcher = async () => {
          const response = await fetch(
            '/api/clients?orderBy=created_at&ascending=false'
          );
          if (!response.ok) {
            const errorData = await response.json();
            const error =
              errorData.error || new Error('Failed to fetch clients');

            // 인증 에러 감지 (무한 루프 방지)
            if (
              error?.message?.includes('Invalid Refresh Token') ||
              error?.message?.includes('Refresh Token Not Found') ||
              error?.code === 'SESSION_EXPIRED' ||
              error?.code === 'UNAUTHORIZED'
            ) {
              console.warn(
                'Authentication error detected, skipping fetch:',
                error
              );
              return [];
            }

            throw error;
          }
          const result = await response.json();
          return result.data || [];
        };

        const clients = await serviceFetchClients(fetcher);
        console.log(
          `[ClientsContext] fetchClients: Received ${clients.length} clients`
        );
        if (clients.length === 0) {
          console.warn(
            '[ClientsContext] fetchClients: Received empty array - check API response'
          );
        }
        dispatch({ type: 'SET_CLIENTS', payload: clients });
      } catch (error) {
        // 인증 에러인 경우 무한 루프 방지를 위해 빈 배열로 설정
        if (
          error &&
          typeof error === 'object' &&
          ('message' in error || 'code' in error)
        ) {
          const err = error as { message?: string; code?: string };
          if (
            err.message?.includes('Invalid Refresh Token') ||
            err.message?.includes('Refresh Token Not Found') ||
            err.code === 'SESSION_EXPIRED' ||
            err.code === 'UNAUTHORIZED'
          ) {
            console.warn(
              'Authentication error in fetchClients, setting empty array:',
              err
            );
            dispatch({ type: 'SET_CLIENTS', payload: [] });
            return;
          }
        }
        handleError(error, 'Fetch clients');
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    });
  }, [handleError, deduped]);

  const createClient = useCallback(
    async (client: Omit<Client, 'id' | 'created_at'>) => {
      dispatch({ type: 'SET_SUBMITTING', payload: true });
      try {
        const response = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(client),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw errorData.error || new Error('Failed to create client');
        }
        const result = await response.json();
        if (result.data) {
          dispatch({ type: 'ADD_CLIENT', payload: result.data });
        }
        return result.data;
      } catch (error) {
        handleError(error, 'Create client');
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
        const response = await fetch('/api/clients', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...client }),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw errorData.error || new Error('Failed to update client');
        }
        const result = await response.json();
        if (result.data) {
          dispatch({
            type: 'UPDATE_CLIENT',
            payload: { id, client: result.data },
          });
        }
        return result.data;
      } catch (error) {
        handleError(error, 'Update client');
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
        const response = await fetch(`/api/clients?id=${id}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw errorData.error || new Error('Failed to delete client');
        }
        dispatch({ type: 'REMOVE_CLIENT', payload: id });
        return true;
      } catch (error) {
        handleError(error, 'Delete client');
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
      fetchClients,
      createClient,
      updateClient,
      deleteClient,
      invalidateCache,
      resetState,
    }),
    [fetchClients, createClient, updateClient, deleteClient, invalidateCache, resetState]
  );

  return (
    <ClientsContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </ClientsContext.Provider>
  );
}

// Hook for using the context
export function useClientsContext() {
  const context = useContext(ClientsContext);
  if (!context) {
    throw new Error('useClientsContext must be used within a ClientsProvider');
  }
  return context;
}

// 특화된 훅
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
