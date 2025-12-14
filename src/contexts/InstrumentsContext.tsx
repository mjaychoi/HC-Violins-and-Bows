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
import { Instrument } from '@/types';
import { fetchInstruments as serviceFetchInstruments } from '@/services/dataService';
import { useErrorHandler } from '@/contexts/ToastContext';

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

// Instruments 상태 타입
interface InstrumentsState {
  instruments: Instrument[];
  loading: boolean;
  submitting: boolean;
  lastUpdated: Date | null;
}

// Instruments 액션 타입
type InstrumentsAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_INSTRUMENTS'; payload: Instrument[] }
  | { type: 'ADD_INSTRUMENT'; payload: Instrument }
  | { type: 'UPDATE_INSTRUMENT'; payload: { id: string; instrument: Instrument } }
  | { type: 'REMOVE_INSTRUMENT'; payload: string }
  | { type: 'INVALIDATE_CACHE' }
  | { type: 'RESET_STATE' };

// 초기 상태
const initialState: InstrumentsState = {
  instruments: [],
  loading: false,
  submitting: false,
  lastUpdated: null,
};

// 리듀서
function instrumentsReducer(
  state: InstrumentsState,
  action: InstrumentsAction
): InstrumentsState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    case 'SET_SUBMITTING':
      return { ...state, submitting: action.payload };

    case 'SET_INSTRUMENTS':
      return {
        ...state,
        instruments: action.payload,
        lastUpdated: new Date(),
      };

    case 'ADD_INSTRUMENT':
      return {
        ...state,
        instruments: [parseInstrumentType(action.payload), ...state.instruments],
        lastUpdated: new Date(),
      };

    case 'UPDATE_INSTRUMENT':
      return {
        ...state,
        instruments: state.instruments.map(instrument =>
          instrument.id === action.payload.id
            ? parseInstrumentType(action.payload.instrument)
            : instrument
        ),
        lastUpdated: new Date(),
      };

    case 'REMOVE_INSTRUMENT':
      return {
        ...state,
        instruments: state.instruments.filter(
          instrument => instrument.id !== action.payload
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
const InstrumentsContext = createContext<{
  state: InstrumentsState;
  dispatch: React.Dispatch<InstrumentsAction>;
  actions: {
    fetchInstruments: () => Promise<void>;
    createInstrument: (
      instrument: Omit<Instrument, 'id' | 'created_at'>
    ) => Promise<Instrument | null>;
    updateInstrument: (
      id: string,
      instrument: Partial<Instrument>
    ) => Promise<Instrument | null>;
    deleteInstrument: (id: string) => Promise<boolean>;
    invalidateCache: () => void;
    resetState: () => void;
  };
} | null>(null);

// Provider 컴포넌트
export function InstrumentsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(instrumentsReducer, initialState);
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

  // Instruments 액션들
  const fetchInstruments = useCallback(async () => {
    return deduped(async () => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const fetcher = async () => {
          const response = await fetch(
            '/api/instruments?orderBy=created_at&ascending=false'
          );
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
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    });
  }, [handleError, deduped]);

  const createInstrument = useCallback(
    async (instrument: Omit<Instrument, 'id' | 'created_at'>) => {
      dispatch({ type: 'SET_SUBMITTING', payload: true });
      try {
        const response = await fetch('/api/instruments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(instrument),
        });

        const result = await response.json();

        if (!response.ok) {
          console.error('[createInstrument] API error:', {
            status: response.status,
            statusText: response.statusText,
            errorData: result,
            instrument,
          });
          if (result?.error) {
            const error = result.error;
            if (typeof error === 'object' && error !== null) {
              throw new Error(
                error.message || error.details || 'Failed to create instrument'
              );
            }
            throw new Error(
              typeof error === 'string' ? error : 'Failed to create instrument'
            );
          }
          throw new Error(
            `Failed to create instrument: ${response.status} ${response.statusText}`
          );
        }
        if (result.data) {
          const parsedData = parseInstrumentType(result.data);
          dispatch({ type: 'ADD_INSTRUMENT', payload: parsedData });
          return parsedData;
        }
        return result.data;
      } catch (error) {
        const errorToHandle =
          error instanceof Error
            ? error
            : new Error(`Failed to create instrument: ${String(error)}`);
        handleError(errorToHandle, 'Create instrument');
        return null;
      } finally {
        dispatch({ type: 'SET_SUBMITTING', payload: false });
      }
    },
    [handleError]
  );

  const updateInstrument = useCallback(
    async (id: string, instrument: Partial<Instrument>) => {
      dispatch({ type: 'SET_SUBMITTING', payload: true });
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
          const parsedData = parseInstrumentType(result.data);
          dispatch({
            type: 'UPDATE_INSTRUMENT',
            payload: { id, instrument: parsedData },
          });
          return parsedData;
        }
        return result.data;
      } catch (error) {
        handleError(error, 'Update instrument');
        return null;
      } finally {
        dispatch({ type: 'SET_SUBMITTING', payload: false });
      }
    },
    [handleError]
  );

  const deleteInstrument = useCallback(
    async (id: string) => {
      dispatch({ type: 'SET_SUBMITTING', payload: true });
      try {
        const response = await fetch(`/api/instruments?id=${id}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw errorData.error || new Error('Failed to delete instrument');
        }
        dispatch({ type: 'REMOVE_INSTRUMENT', payload: id });
        return true;
      } catch (error) {
        handleError(error, 'Delete instrument');
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
      fetchInstruments,
      createInstrument,
      updateInstrument,
      deleteInstrument,
      invalidateCache,
      resetState,
    }),
    [
      fetchInstruments,
      createInstrument,
      updateInstrument,
      deleteInstrument,
      invalidateCache,
      resetState,
    ]
  );

  return (
    <InstrumentsContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </InstrumentsContext.Provider>
  );
}

// Hook for using the context
export function useInstrumentsContext() {
  const context = useContext(InstrumentsContext);
  if (!context) {
    throw new Error(
      'useInstrumentsContext must be used within an InstrumentsProvider'
    );
  }
  return context;
}

// 특화된 훅
export function useInstruments() {
  const { state, actions } = useInstrumentsContext();
  return {
    instruments: state.instruments,
    loading: state.loading,
    submitting: state.submitting,
    lastUpdated: state.lastUpdated,
    ...actions,
  };
}
