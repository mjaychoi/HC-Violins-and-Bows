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
import { Client, Instrument, ClientInstrument } from '@/types';
import { fetchClients as serviceFetchClients, fetchInstruments as serviceFetchInstruments } from '@/services/dataService';
import { useErrorHandler } from '@/hooks/useErrorHandler';

// 데이터 상태 타입
interface DataState {
  clients: Client[];
  instruments: Instrument[];
  connections: ClientInstrument[];
  loading: {
    clients: boolean;
    instruments: boolean;
    connections: boolean;
  };
  submitting: {
    clients: boolean;
    instruments: boolean;
    connections: boolean;
  };
  lastUpdated: {
    clients: Date | null;
    instruments: Date | null;
    connections: Date | null;
  };
}

// 액션 타입
type DataAction =
  | {
      type: 'SET_LOADING';
      payload: { dataType: keyof DataState['loading']; loading: boolean };
    }
  | {
      type: 'SET_SUBMITTING';
      payload: { dataType: keyof DataState['submitting']; submitting: boolean };
    }
  | { type: 'SET_CLIENTS'; payload: Client[] }
  | { type: 'ADD_CLIENT'; payload: Client }
  | { type: 'UPDATE_CLIENT'; payload: { id: string; client: Client } }
  | { type: 'REMOVE_CLIENT'; payload: string }
  | { type: 'SET_INSTRUMENTS'; payload: Instrument[] }
  | { type: 'ADD_INSTRUMENT'; payload: Instrument }
  | {
      type: 'UPDATE_INSTRUMENT';
      payload: { id: string; instrument: Instrument };
    }
  | { type: 'REMOVE_INSTRUMENT'; payload: string }
  | { type: 'SET_CONNECTIONS'; payload: ClientInstrument[] }
  | { type: 'ADD_CONNECTION'; payload: ClientInstrument }
  | {
      type: 'UPDATE_CONNECTION';
      payload: { id: string; connection: ClientInstrument };
    }
  | { type: 'REMOVE_CONNECTION'; payload: string }
  | { type: 'INVALIDATE_CACHE'; payload: keyof DataState['lastUpdated'] }
  | { type: 'RESET_STATE' };

// 초기 상태
const initialState: DataState = {
  clients: [],
  instruments: [],
  connections: [],
  loading: {
    clients: false,
    instruments: false,
    connections: false,
  },
  submitting: {
    clients: false,
    instruments: false,
    connections: false,
  },
  lastUpdated: {
    clients: null,
    instruments: null,
    connections: null,
  },
};

// Helper function to parse type field: if it contains "/", split into type and subtype
function parseInstrumentType(item: Instrument): Instrument {
  if (item.type && typeof item.type === 'string' && item.type.includes('/')) {
    const parts = item.type
      .split('/')
      .map(part => part.trim())
      .filter(part => part.length > 0);
    if (parts.length >= 2) {
      return {
        ...item,
        type: parts[0] || null,
        subtype: parts.slice(1).join(' / ') || item.subtype || null,
      };
    } else if (parts.length === 1) {
      return {
        ...item,
        type: parts[0] || null,
        subtype: item.subtype || null,
      };
    }
  }
  return item;
}

// 리듀서
function dataReducer(state: DataState, action: DataAction): DataState {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        loading: {
          ...state.loading,
          [action.payload.dataType]: action.payload.loading,
        },
      };

    case 'SET_SUBMITTING':
      return {
        ...state,
        submitting: {
          ...state.submitting,
          [action.payload.dataType]: action.payload.submitting,
        },
      };

    case 'SET_CLIENTS':
      return {
        ...state,
        clients: action.payload,
        lastUpdated: {
          ...state.lastUpdated,
          clients: new Date(),
        },
      };

    case 'ADD_CLIENT':
      return {
        ...state,
        clients: [action.payload, ...state.clients],
        lastUpdated: {
          ...state.lastUpdated,
          clients: new Date(),
        },
      };

    case 'UPDATE_CLIENT':
      return {
        ...state,
        clients: state.clients.map(client =>
          client.id === action.payload.id ? action.payload.client : client
        ),
        lastUpdated: {
          ...state.lastUpdated,
          clients: new Date(),
        },
      };

    case 'REMOVE_CLIENT':
      return {
        ...state,
        clients: state.clients.filter(client => client.id !== action.payload),
        lastUpdated: {
          ...state.lastUpdated,
          clients: new Date(),
        },
      };

    case 'SET_INSTRUMENTS':
      return {
        ...state,
        instruments: action.payload,
        lastUpdated: {
          ...state.lastUpdated,
          instruments: new Date(),
        },
      };

    case 'ADD_INSTRUMENT':
      return {
        ...state,
        instruments: [
          parseInstrumentType(action.payload),
          ...state.instruments,
        ],
        lastUpdated: {
          ...state.lastUpdated,
          instruments: new Date(),
        },
      };

    case 'UPDATE_INSTRUMENT':
      return {
        ...state,
        instruments: state.instruments.map(instrument =>
          instrument.id === action.payload.id
            ? parseInstrumentType(action.payload.instrument)
            : instrument
        ),
        lastUpdated: {
          ...state.lastUpdated,
          instruments: new Date(),
        },
      };

    case 'REMOVE_INSTRUMENT':
      return {
        ...state,
        instruments: state.instruments.filter(
          instrument => instrument.id !== action.payload
        ),
        lastUpdated: {
          ...state.lastUpdated,
          instruments: new Date(),
        },
      };

    case 'SET_CONNECTIONS':
      return {
        ...state,
        connections: action.payload,
        lastUpdated: {
          ...state.lastUpdated,
          connections: new Date(),
        },
      };

    case 'ADD_CONNECTION':
      return {
        ...state,
        connections: [action.payload, ...state.connections],
        lastUpdated: {
          ...state.lastUpdated,
          connections: new Date(),
        },
      };

    case 'UPDATE_CONNECTION':
      return {
        ...state,
        connections: state.connections.map(connection =>
          connection.id === action.payload.id
            ? action.payload.connection
            : connection
        ),
        lastUpdated: {
          ...state.lastUpdated,
          connections: new Date(),
        },
      };

    case 'REMOVE_CONNECTION':
      return {
        ...state,
        connections: state.connections.filter(
          connection => connection.id !== action.payload
        ),
        lastUpdated: {
          ...state.lastUpdated,
          connections: new Date(),
        },
      };

    case 'INVALIDATE_CACHE':
      return {
        ...state,
        lastUpdated: {
          ...state.lastUpdated,
          [action.payload]: null,
        },
      };

    case 'RESET_STATE':
      return initialState;

    default:
      return state;
  }
}

// Context 생성
const DataContext = createContext<{
  state: DataState;
  dispatch: React.Dispatch<DataAction>;
  actions: {
    // Clients
    fetchClients: () => Promise<void>;
    createClient: (
      client: Omit<Client, 'id' | 'created_at'>
    ) => Promise<Client | null>;
    updateClient: (
      id: string,
      client: Partial<Client>
    ) => Promise<Client | null>;
    deleteClient: (id: string) => Promise<boolean>;

    // Instruments
    fetchInstruments: () => Promise<void>;
    createInstrument: (
      instrument: Omit<Instrument, 'id' | 'created_at'>
    ) => Promise<Instrument | null>;
    updateInstrument: (
      id: string,
      instrument: Partial<Instrument>
    ) => Promise<Instrument | null>;
    deleteInstrument: (id: string) => Promise<boolean>;

    // Connections
    fetchConnections: () => Promise<void>;
    createConnection: (
      connection: Omit<ClientInstrument, 'id' | 'created_at'>
    ) => Promise<ClientInstrument | null>;
    updateConnection: (
      id: string,
      connection: Partial<ClientInstrument>
    ) => Promise<ClientInstrument | null>;
    deleteConnection: (id: string) => Promise<boolean>;

    // Cache management
    invalidateCache: (dataType: keyof DataState['lastUpdated']) => void;
    resetState: () => void;
  };
} | null>(null);

// Provider 컴포넌트
export function DataProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(dataReducer, initialState);
  const { handleError } = useErrorHandler();

  // In-flight request deduplication
  // Prevents duplicate requests when multiple hooks/components trigger the same fetch
  // Example: useUnifiedData + useUnifiedDashboard both calling fetchClients() simultaneously
  const inflight = useRef<Map<string, Promise<void>>>(new Map());

  const deduped = useCallback(
    <T extends () => Promise<void>>(key: string, fn: T): Promise<void> => {
      const existing = inflight.current.get(key);
      if (existing) {
        return existing;
      }
      const p = fn().finally(() => {
        inflight.current.delete(key);
      });
      inflight.current.set(key, p);
      return p;
    },
    []
  );

  // 캐시 무효화 함수
  const invalidateCache = useCallback(
    (dataType: keyof DataState['lastUpdated']) => {
      dispatch({ type: 'INVALIDATE_CACHE', payload: dataType });
    },
    []
  );

  // 상태 리셋 함수
  const resetState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

  // Clients 액션들
  const fetchClients = useCallback(async () => {
    return deduped('clients', async () => {
      dispatch({
        type: 'SET_LOADING',
        payload: { dataType: 'clients', loading: true },
      });
      try {
        const fetcher = async () => {
          const response = await fetch('/api/clients?orderBy=created_at&ascending=false');
          if (!response.ok) {
            const errorData = await response.json();
            const error = errorData.error || new Error('Failed to fetch clients');
            
            // 인증 에러 감지 (무한 루프 방지)
            if (
              error?.message?.includes('Invalid Refresh Token') ||
              error?.message?.includes('Refresh Token Not Found') ||
              error?.code === 'SESSION_EXPIRED' ||
              error?.code === 'UNAUTHORIZED'
            ) {
              // 인증 에러는 빈 배열 반환하여 무한 루프 방지
              console.warn('Authentication error detected, skipping fetch:', error);
              return [];
            }
            
            throw error;
          }
          const result = await response.json();
          return result.data || [];
        };

        const clients = await serviceFetchClients(fetcher);
        console.log(`[DataContext] fetchClients: Received ${clients.length} clients`);
        if (clients.length === 0) {
          console.warn('[DataContext] fetchClients: Received empty array - check API response');
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
          console.warn('Authentication error in fetchClients, setting empty array:', err);
          dispatch({ type: 'SET_CLIENTS', payload: [] });
          return; // 에러 핸들러 호출하지 않고 종료
        }
      }
        handleError(error, 'Fetch clients');
      } finally {
        dispatch({
          type: 'SET_LOADING',
          payload: { dataType: 'clients', loading: false },
        });
      }
    });
  }, [handleError, deduped]);

  const createClient = useCallback(
    async (client: Omit<Client, 'id' | 'created_at'>) => {
      dispatch({
        type: 'SET_SUBMITTING',
        payload: { dataType: 'clients', submitting: true },
      });
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
          // 연결된 데이터 캐시 무효화
          invalidateCache('connections');
        }
        return result.data;
      } catch (error) {
        handleError(error, 'Create client');
        return null;
      } finally {
        dispatch({
          type: 'SET_SUBMITTING',
          payload: { dataType: 'clients', submitting: false },
        });
      }
    },
    [handleError, invalidateCache]
  );

  const updateClient = useCallback(
    async (id: string, client: Partial<Client>) => {
      dispatch({
        type: 'SET_SUBMITTING',
        payload: { dataType: 'clients', submitting: true },
      });
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
          dispatch({ type: 'UPDATE_CLIENT', payload: { id, client: result.data } });
          // 연결된 데이터 캐시 무효화
          invalidateCache('connections');
        }
        return result.data;
      } catch (error) {
        handleError(error, 'Update client');
        return null;
      } finally {
        dispatch({
          type: 'SET_SUBMITTING',
          payload: { dataType: 'clients', submitting: false },
        });
      }
    },
    [handleError, invalidateCache]
  );

  const deleteClient = useCallback(
    async (id: string) => {
      dispatch({
        type: 'SET_SUBMITTING',
        payload: { dataType: 'clients', submitting: true },
      });
      try {
        const response = await fetch(`/api/clients?id=${id}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw errorData.error || new Error('Failed to delete client');
        }
        dispatch({ type: 'REMOVE_CLIENT', payload: id });
        // 연결된 데이터 캐시 무효화
        invalidateCache('connections');
        return true;
      } catch (error) {
        handleError(error, 'Delete client');
        return false;
      } finally {
        dispatch({
          type: 'SET_SUBMITTING',
          payload: { dataType: 'clients', submitting: false },
        });
      }
    },
    [handleError, invalidateCache]
  );

  // Instruments 액션들
  const fetchInstruments = useCallback(async () => {
    return deduped('instruments', async () => {
      dispatch({
        type: 'SET_LOADING',
        payload: { dataType: 'instruments', loading: true },
      });
      try {
        const fetcher = async () => {
          const response = await fetch('/api/instruments?orderBy=created_at&ascending=false');
          if (!response.ok) {
            const errorData = await response.json();
            throw errorData.error || new Error('Failed to fetch instruments');
          }
          const result = await response.json();
          return (result.data || []).map(parseInstrumentType);
        };

        const instruments = await serviceFetchInstruments(fetcher);
        dispatch({ type: 'SET_INSTRUMENTS', payload: instruments });
      } catch (error) {
        handleError(error, 'Fetch instruments');
      } finally {
        dispatch({
          type: 'SET_LOADING',
          payload: { dataType: 'instruments', loading: false },
        });
      }
    });
  }, [handleError, deduped]);

  const createInstrument = useCallback(
    async (instrument: Omit<Instrument, 'id' | 'created_at'>) => {
      dispatch({
        type: 'SET_SUBMITTING',
        payload: { dataType: 'instruments', submitting: true },
      });
      try {
        const response = await fetch('/api/instruments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(instrument),
        });
        
        // Response body를 한 번만 파싱
        const result = await response.json();

        if (!response.ok) {
          console.error('[createInstrument] API error:', { 
            status: response.status, 
            statusText: response.statusText,
            errorData: result, 
            instrument 
          });
          // 에러 객체가 있는 경우
          if (result?.error) {
            const error = result.error;
            // 에러가 객체인 경우
            if (typeof error === 'object' && error !== null) {
              throw new Error(error.message || error.details || 'Failed to create instrument');
            }
            // 에러가 문자열인 경우
            throw new Error(typeof error === 'string' ? error : 'Failed to create instrument');
          }
          throw new Error(`Failed to create instrument: ${response.status} ${response.statusText}`);
        }
        if (result.data) {
          // Parse type field if it contains "/"
          const parsedData = parseInstrumentType(result.data);
          dispatch({ type: 'ADD_INSTRUMENT', payload: parsedData });
          // 연결된 데이터 캐시 무효화
          invalidateCache('connections');
          return parsedData;
        }
        return result.data;
      } catch (error) {
        // 에러가 이미 Error 객체인 경우 그대로 전달, 아니면 새로 생성
        const errorToHandle = error instanceof Error 
          ? error 
          : new Error(`Failed to create instrument: ${String(error)}`);
        handleError(errorToHandle, 'Create instrument');
        return null;
      } finally {
        dispatch({
          type: 'SET_SUBMITTING',
          payload: { dataType: 'instruments', submitting: false },
        });
      }
    },
    [handleError, invalidateCache]
  );

  const updateInstrument = useCallback(
    async (id: string, instrument: Partial<Instrument>) => {
      dispatch({
        type: 'SET_SUBMITTING',
        payload: { dataType: 'instruments', submitting: true },
      });
      try {
        const response = await fetch('/api/instruments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...instrument }),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw errorData.error || new Error('Failed to update instrument');
        }
        const result = await response.json();
        if (result.data) {
          // Parse type field if it contains "/"
          const parsedData = parseInstrumentType(result.data);
          dispatch({
            type: 'UPDATE_INSTRUMENT',
            payload: { id, instrument: parsedData },
          });
          // 연결된 데이터 캐시 무효화
          invalidateCache('connections');
          return parsedData;
        }
        return result.data;
      } catch (error) {
        handleError(error, 'Update instrument');
        return null;
      } finally {
        dispatch({
          type: 'SET_SUBMITTING',
          payload: { dataType: 'instruments', submitting: false },
        });
      }
    },
    [handleError, invalidateCache]
  );

  const deleteInstrument = useCallback(
    async (id: string) => {
      dispatch({
        type: 'SET_SUBMITTING',
        payload: { dataType: 'instruments', submitting: true },
      });
      try {
        const response = await fetch(`/api/instruments?id=${id}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw errorData.error || new Error('Failed to delete instrument');
        }
        dispatch({ type: 'REMOVE_INSTRUMENT', payload: id });
        // 연결된 데이터 캐시 무효화
        invalidateCache('connections');
        return true;
      } catch (error) {
        handleError(error, 'Delete instrument');
        return false;
      } finally {
        dispatch({
          type: 'SET_SUBMITTING',
          payload: { dataType: 'instruments', submitting: false },
        });
      }
    },
    [handleError, invalidateCache]
  );

  // Connections 액션들
  const fetchConnections = useCallback(async () => {
    return deduped('connections', async () => {
      dispatch({
        type: 'SET_LOADING',
        payload: { dataType: 'connections', loading: true },
      });
      try {
        const response = await fetch('/api/connections?orderBy=created_at&ascending=false');
        if (!response.ok) {
          const errorData = await response.json();
          throw errorData.error || new Error('Failed to fetch connections');
        }
        const result = await response.json();
        dispatch({ type: 'SET_CONNECTIONS', payload: result.data || [] });
      } catch (error) {
        handleError(error, 'Fetch connections');
      } finally {
        dispatch({
          type: 'SET_LOADING',
          payload: { dataType: 'connections', loading: false },
        });
      }
    });
  }, [handleError, deduped]);

  const createConnection = useCallback(
    async (connection: Omit<ClientInstrument, 'id' | 'created_at'>) => {
      dispatch({
        type: 'SET_SUBMITTING',
        payload: { dataType: 'connections', submitting: true },
      });
      try {
        const response = await fetch('/api/connections', {
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
        dispatch({
          type: 'SET_SUBMITTING',
          payload: { dataType: 'connections', submitting: false },
        });
      }
    },
    [handleError]
  );

  const updateConnection = useCallback(
    async (id: string, connection: Partial<ClientInstrument>) => {
      dispatch({
        type: 'SET_SUBMITTING',
        payload: { dataType: 'connections', submitting: true },
      });
      try {
        const response = await fetch('/api/connections', {
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
        dispatch({
          type: 'SET_SUBMITTING',
          payload: { dataType: 'connections', submitting: false },
        });
      }
    },
    [handleError]
  );

  const deleteConnection = useCallback(
    async (id: string) => {
      dispatch({
        type: 'SET_SUBMITTING',
        payload: { dataType: 'connections', submitting: true },
      });
      try {
        const response = await fetch(`/api/connections?id=${id}`, {
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
        dispatch({
          type: 'SET_SUBMITTING',
          payload: { dataType: 'connections', submitting: false },
        });
      }
    },
    [handleError]
  );

  // actions 객체를 useMemo로 메모이제이션하여 무한 루프 방지
  const actions = useMemo(
    () => ({
      // Clients
      fetchClients,
      createClient,
      updateClient,
      deleteClient,

      // Instruments
      fetchInstruments,
      createInstrument,
      updateInstrument,
      deleteInstrument,

      // Connections
      fetchConnections,
      createConnection,
      updateConnection,
      deleteConnection,

      // Cache management
      invalidateCache,
      resetState,
    }),
    [
      fetchClients,
      createClient,
      updateClient,
      deleteClient,
      fetchInstruments,
      createInstrument,
      updateInstrument,
      deleteInstrument,
      fetchConnections,
      createConnection,
      updateConnection,
      deleteConnection,
      invalidateCache,
      resetState,
    ]
  );

  return (
    <DataContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </DataContext.Provider>
  );
}

// Hook for using the context
export function useDataContext() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useDataContext must be used within a DataProvider');
  }
  return context;
}

// 특화된 훅들
export function useClients() {
  const { state, actions } = useDataContext();
  return {
    clients: state.clients,
    loading: state.loading.clients,
    submitting: state.submitting.clients,
    lastUpdated: state.lastUpdated.clients,
    ...actions,
  };
}

export function useInstruments() {
  const { state, actions } = useDataContext();
  return {
    instruments: state.instruments,
    loading: state.loading.instruments,
    submitting: state.submitting.instruments,
    lastUpdated: state.lastUpdated.instruments,
    ...actions,
  };
}

export function useConnections() {
  const { state, actions } = useDataContext();
  return {
    connections: state.connections,
    loading: state.loading.connections,
    submitting: state.submitting.connections,
    lastUpdated: state.lastUpdated.connections,
    ...actions,
  };
}

// 모든 데이터를 한 번에 가져오는 훅
export function useAllData() {
  const { state, actions } = useDataContext();
  return {
    ...state,
    ...actions,
  };
}
