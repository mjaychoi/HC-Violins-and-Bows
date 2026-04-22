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
import { Instrument } from '@/types';
import { useErrorHandler } from '@/contexts/ToastContext';
import { apiFetch } from '@/utils/apiFetch';
import { createApiResponseError } from '@/utils/handleApiResponse';
import { isAuthLikeTenantError } from '@/utils/tenantIdentity';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';

// Helper function to parse type field: if it contains "/", split into type and subtype
type JsonRecord = Record<string, unknown>;
const NO_TENANT_SCOPE_KEY = '__no-tenant__';

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

function toError(error: unknown, fallbackMessage: string): Error {
  if (
    error != null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return error as Error;
  }
  return new Error(
    typeof error === 'string' ? error : `${fallbackMessage}: ${String(error)}`
  );
}

// Instruments 상태 타입
interface InstrumentsState {
  instruments: Instrument[];
  loading: boolean;
  submitting: boolean;
  error: unknown | null;
  lastUpdated: Date | null;
}

// Instruments 액션 타입
type InstrumentsAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: unknown | null }
  | { type: 'SET_INSTRUMENTS'; payload: Instrument[] }
  | { type: 'ADD_INSTRUMENT'; payload: Instrument }
  | {
      type: 'UPDATE_INSTRUMENT';
      payload: { id: string; instrument: Instrument };
    }
  | { type: 'REMOVE_INSTRUMENT'; payload: string }
  | { type: 'INVALIDATE_CACHE' }
  | { type: 'RESET_STATE' };

// 초기 상태
const initialState: InstrumentsState = {
  instruments: [],
  loading: false,
  submitting: false,
  error: null,
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

    case 'SET_ERROR':
      // null payload = fetch-start housekeeping: clear prior error, keep data.
      // non-null payload = confirmed fatal fetch failure: clear stale data so
      // it cannot masquerade as valid alongside a known error state.
      if (action.payload === null) {
        return { ...state, error: null };
      }
      return { ...state, instruments: [], error: action.payload };

    case 'SET_INSTRUMENTS':
      return {
        ...state,
        instruments: action.payload,
        error: null,
        lastUpdated: new Date(),
      };

    case 'ADD_INSTRUMENT':
      return {
        ...state,
        instruments: [
          parseInstrumentType(action.payload),
          ...state.instruments,
        ],
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
      // Stale-while-revalidate: preserve visible data until a fresh response
      // arrives; only the freshness timestamp is cleared.  If the subsequent
      // fetch fails, SET_ERROR (non-null) will clear the data at that point.
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
    /** @param all - `true` loads the full org instrument list (unbounded on server). Default context bootstrap uses this; bounded calls omit it. */
    fetchInstruments: (opts?: { all?: boolean }) => Promise<void>;
    createInstrument: (
      instrument: Omit<Instrument, 'id' | 'created_at'>
    ) => Promise<Instrument>;
    updateInstrument: (
      id: string,
      instrument: Partial<Instrument>
    ) => Promise<Instrument>;
    deleteInstrument: (id: string) => Promise<void>;
    invalidateCache: () => void;
    resetState: () => void;
  };
} | null>(null);

// Provider 컴포넌트
export function InstrumentsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(instrumentsReducer, initialState);
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
      if (existing) {
        return existing;
      }
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

  // 캐시 무효화 함수
  const invalidateCache = useCallback(() => {
    dispatch({ type: 'INVALIDATE_CACHE' });
  }, []);

  // 상태 리셋 함수
  const resetState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

  // Instruments 액션들
  const fetchInstruments = useCallback(
    async (opts?: { all?: boolean }) => {
      const listAll = opts?.all === true;
      const fetchTenantIdentityKey = tenantIdentityKeyRef.current;
      const modeKey = listAll ? 'all' : 'bounded';
      const inflightKey = `${tenantIdentityKeyRef.current ?? NO_TENANT_SCOPE_KEY}:${modeKey}`;

      return deduped(inflightKey, async () => {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_ERROR', payload: null });
        try {
          const u = new URLSearchParams({
            orderBy: 'created_at',
            ascending: 'false',
          });
          if (listAll) u.set('all', 'true');
          const response = await apiFetch(`/api/instruments?${u.toString()}`);
          if (!response.ok) {
            const body = await safeJson(response);
            throw getResponseError(
              body,
              response,
              'Failed to fetch instruments'
            );
          }
          const result = await safeJson(response);
          const instruments = ((result?.data || []) as Instrument[]).map(
            parseInstrumentType
          );
          if (tenantIdentityKeyRef.current !== fetchTenantIdentityKey) {
            return;
          }
          dispatch({ type: 'SET_INSTRUMENTS', payload: instruments });
        } catch (error) {
          if (tenantIdentityKeyRef.current !== fetchTenantIdentityKey) {
            return;
          }
          if (isAuthLikeTenantError(error)) {
            dispatch({ type: 'RESET_STATE' });
            return;
          }
          dispatch({ type: 'SET_ERROR', payload: error });
          handleErrorRef.current(error, 'Fetch instruments');
        } finally {
          if (tenantIdentityKeyRef.current === fetchTenantIdentityKey) {
            dispatch({ type: 'SET_LOADING', payload: false });
          }
        }
      });
    },
    [deduped]
  );

  const createInstrument = useCallback(
    async (
      instrument: Omit<Instrument, 'id' | 'created_at'>
    ): Promise<Instrument> => {
      const mutationTenantIdentityKey = tenantIdentityKeyRef.current;
      dispatch({ type: 'SET_SUBMITTING', payload: true });
      try {
        const response = await apiFetch('/api/instruments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(instrument),
        });

        const result = await safeJson(response);

        if (!response.ok) {
          throw getResponseError(
            result,
            response,
            'Failed to create instrument'
          );
        }
        if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
          throw new Error(
            'Instrument creation aborted: organization context changed during request'
          );
        }
        if (!result?.data) {
          throw new Error('Instrument creation failed: empty response');
        }
        const parsedData = parseInstrumentType(result.data as Instrument);
        if (
          !parsedData ||
          typeof parsedData.id !== 'string' ||
          parsedData.id.length === 0
        ) {
          throw new Error('Instrument creation failed: invalid payload');
        }
        dispatch({ type: 'ADD_INSTRUMENT', payload: parsedData });
        return parsedData;
      } catch (error) {
        if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
          throw toError(error, 'Instrument creation aborted');
        }
        if (isAuthLikeTenantError(error)) {
          dispatch({ type: 'RESET_STATE' });
        }
        throw toError(error, 'Failed to create instrument');
      } finally {
        if (tenantIdentityKeyRef.current === mutationTenantIdentityKey) {
          dispatch({ type: 'SET_SUBMITTING', payload: false });
        }
      }
    },
    []
  );

  const updateInstrument = useCallback(
    async (
      id: string,
      instrument: Partial<Instrument>
    ): Promise<Instrument> => {
      const mutationTenantIdentityKey = tenantIdentityKeyRef.current;
      dispatch({ type: 'SET_SUBMITTING', payload: true });
      try {
        const response = await apiFetch('/api/instruments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...instrument }),
        });
        if (!response.ok) {
          const body = await safeJson(response);
          throw getResponseError(body, response, 'Failed to update instrument');
        }
        const result = await safeJson(response);
        if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
          throw new Error(
            'Instrument update aborted: organization context changed during request'
          );
        }
        if (!result?.data) {
          throw new Error('Instrument update failed: empty response');
        }
        const parsedRaw = parseInstrumentType(result.data as Instrument);
        if (!parsedRaw || typeof parsedRaw !== 'object') {
          throw new Error('Instrument update failed: invalid payload');
        }
        const resolvedId =
          typeof parsedRaw.id === 'string' && parsedRaw.id.length > 0
            ? parsedRaw.id
            : id;
        if (resolvedId !== id) {
          throw new Error('Instrument update failed: id mismatch');
        }
        const parsedData = { ...parsedRaw, id: resolvedId };
        dispatch({
          type: 'UPDATE_INSTRUMENT',
          payload: { id, instrument: parsedData },
        });
        return parsedData;
      } catch (error) {
        if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
          throw toError(error, 'Instrument update aborted');
        }
        if (isAuthLikeTenantError(error)) {
          dispatch({ type: 'RESET_STATE' });
        }
        throw toError(error, 'Failed to update instrument');
      } finally {
        if (tenantIdentityKeyRef.current === mutationTenantIdentityKey) {
          dispatch({ type: 'SET_SUBMITTING', payload: false });
        }
      }
    },
    []
  );

  const deleteInstrument = useCallback(async (id: string): Promise<void> => {
    const mutationTenantIdentityKey = tenantIdentityKeyRef.current;
    dispatch({ type: 'SET_SUBMITTING', payload: true });
    try {
      const response = await apiFetch(`/api/instruments?id=${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const body = await safeJson(response);
        throw getResponseError(body, response, 'Failed to delete instrument');
      }
      if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
        throw new Error(
          'Instrument delete aborted: organization context changed during request'
        );
      }
      dispatch({ type: 'REMOVE_INSTRUMENT', payload: id });
    } catch (error) {
      if (tenantIdentityKeyRef.current !== mutationTenantIdentityKey) {
        throw toError(error, 'Instrument delete aborted');
      }
      if (isAuthLikeTenantError(error)) {
        dispatch({ type: 'RESET_STATE' });
      }
      throw toError(error, 'Failed to delete instrument');
    } finally {
      if (tenantIdentityKeyRef.current === mutationTenantIdentityKey) {
        dispatch({ type: 'SET_SUBMITTING', payload: false });
      }
    }
  }, []);

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

  const contextValue = useMemo(
    () => ({ state, dispatch, actions }),
    [state, dispatch, actions]
  );

  return (
    <InstrumentsContext.Provider value={contextValue}>
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
    error: state.error,
    lastUpdated: state.lastUpdated,
    ...actions,
  };
}
