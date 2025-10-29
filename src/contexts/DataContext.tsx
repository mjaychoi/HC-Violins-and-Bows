'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  ReactNode,
} from 'react';
import { Client, Instrument, ClientInstrument } from '@/types';
import { SupabaseHelpers } from '@/utils/supabaseHelpers';
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
        instruments: [action.payload, ...state.instruments],
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
            ? action.payload.instrument
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
    dispatch({
      type: 'SET_LOADING',
      payload: { dataType: 'clients', loading: true },
    });
    try {
      const { data, error } = await SupabaseHelpers.fetchAll<Client>(
        'clients',
        {
          orderBy: { column: 'created_at', ascending: false },
        }
      );
      if (error) throw error;
      dispatch({ type: 'SET_CLIENTS', payload: data || [] });
    } catch (error) {
      handleError(error, 'Fetch clients');
    } finally {
      dispatch({
        type: 'SET_LOADING',
        payload: { dataType: 'clients', loading: false },
      });
    }
  }, [handleError]);

  const createClient = useCallback(
    async (client: Omit<Client, 'id' | 'created_at'>) => {
      dispatch({
        type: 'SET_SUBMITTING',
        payload: { dataType: 'clients', submitting: true },
      });
      try {
        const { data, error } = await SupabaseHelpers.create<Client>(
          'clients',
          client
        );
        if (error) throw error;
        if (data) {
          dispatch({ type: 'ADD_CLIENT', payload: data });
          // 연결된 데이터 캐시 무효화
          invalidateCache('connections');
        }
        return data;
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
        const { data, error } = await SupabaseHelpers.update<Client>(
          'clients',
          id,
          client
        );
        if (error) throw error;
        if (data) {
          dispatch({ type: 'UPDATE_CLIENT', payload: { id, client: data } });
          // 연결된 데이터 캐시 무효화
          invalidateCache('connections');
        }
        return data;
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
        const { error } = await SupabaseHelpers.delete('clients', id);
        if (error) throw error;
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
    dispatch({
      type: 'SET_LOADING',
      payload: { dataType: 'instruments', loading: true },
    });
    try {
      const { data, error } = await SupabaseHelpers.fetchAll<Instrument>(
        'instruments',
        {
          orderBy: { column: 'created_at', ascending: false },
        }
      );
      if (error) throw error;
      dispatch({ type: 'SET_INSTRUMENTS', payload: data || [] });
    } catch (error) {
      handleError(error, 'Fetch instruments');
    } finally {
      dispatch({
        type: 'SET_LOADING',
        payload: { dataType: 'instruments', loading: false },
      });
    }
  }, [handleError]);

  const createInstrument = useCallback(
    async (instrument: Omit<Instrument, 'id' | 'created_at'>) => {
      dispatch({
        type: 'SET_SUBMITTING',
        payload: { dataType: 'instruments', submitting: true },
      });
      try {
        const { data, error } = await SupabaseHelpers.create<Instrument>(
          'instruments',
          instrument
        );
        if (error) throw error;
        if (data) {
          dispatch({ type: 'ADD_INSTRUMENT', payload: data });
          // 연결된 데이터 캐시 무효화
          invalidateCache('connections');
        }
        return data;
      } catch (error) {
        handleError(error, 'Create instrument');
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
        const { data, error } = await SupabaseHelpers.update<Instrument>(
          'instruments',
          id,
          instrument
        );
        if (error) throw error;
        if (data) {
          dispatch({
            type: 'UPDATE_INSTRUMENT',
            payload: { id, instrument: data },
          });
          // 연결된 데이터 캐시 무효화
          invalidateCache('connections');
        }
        return data;
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
        const { error } = await SupabaseHelpers.delete('instruments', id);
        if (error) throw error;
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
    dispatch({
      type: 'SET_LOADING',
      payload: { dataType: 'connections', loading: true },
    });
    try {
      const { data, error } = await SupabaseHelpers.fetchAll<ClientInstrument>(
        'client_instruments',
        {
          select: '*, client:clients(*), instrument:instruments(*)',
        }
      );
      if (error) throw error;
      dispatch({ type: 'SET_CONNECTIONS', payload: data || [] });
    } catch (error) {
      handleError(error, 'Fetch connections');
    } finally {
      dispatch({
        type: 'SET_LOADING',
        payload: { dataType: 'connections', loading: false },
      });
    }
  }, [handleError]);

  const createConnection = useCallback(
    async (connection: Omit<ClientInstrument, 'id' | 'created_at'>) => {
      dispatch({
        type: 'SET_SUBMITTING',
        payload: { dataType: 'connections', submitting: true },
      });
      try {
        const { data, error } = await SupabaseHelpers.create<ClientInstrument>(
          'client_instruments',
          connection
        );
        if (error) throw error;
        if (data) {
          dispatch({ type: 'ADD_CONNECTION', payload: data });
        }
        return data;
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
        const { data, error } = await SupabaseHelpers.update<ClientInstrument>(
          'client_instruments',
          id,
          connection
        );
        if (error) throw error;
        if (data) {
          dispatch({
            type: 'UPDATE_CONNECTION',
            payload: { id, connection: data },
          });
        }
        return data;
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
        const { error } = await SupabaseHelpers.delete(
          'client_instruments',
          id
        );
        if (error) throw error;
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

  const actions = {
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
  };

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
