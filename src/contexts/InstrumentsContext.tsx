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
import {
  createApiResponseErrorFromResponse,
  readApiResponseEnvelope,
} from '@/utils/handleApiResponse';
import { isAuthLikeTenantError } from '@/utils/tenantIdentity';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';
import { logInfo } from '@/utils/logger';

function generateIdempotencyKey(prefix: string): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

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
    }

    if (parts.length === 1) {
      return {
        ...item,
        type: parts[0] || null,
        subtype: item.subtype || null,
      };
    }
  }

  return item;
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

interface InstrumentsState {
  instruments: Instrument[];
  loadedAccessScopeKey: string | null;
  loading: boolean;
  loadingCount: number;
  submitting: boolean;
  error: unknown | null;
  lastUpdated: Date | null;
  allResultsTruncated: boolean;
}

type InstrumentsAction =
  | { type: 'START_LOADING' }
  | { type: 'END_LOADING' }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: unknown | null }
  | {
      type: 'SET_INSTRUMENTS';
      payload: { instruments: Instrument[]; loadedAccessScopeKey: string };
    }
  | { type: 'SET_ALL_RESULTS_TRUNCATED'; payload: boolean }
  | {
      type: 'ADD_INSTRUMENT';
      payload: { instrument: Instrument; accessScopeKey: string };
    }
  | {
      type: 'UPDATE_INSTRUMENT';
      payload: {
        id: string;
        instrument: Instrument;
        accessScopeKey: string;
      };
    }
  | {
      type: 'REMOVE_INSTRUMENT';
      payload: { id: string; accessScopeKey: string };
    }
  | { type: 'INVALIDATE_CACHE' }
  | { type: 'RESET_STATE' };

const initialState: InstrumentsState = {
  instruments: [],
  loadedAccessScopeKey: null,
  loading: false,
  loadingCount: 0,
  submitting: false,
  error: null,
  lastUpdated: null,
  allResultsTruncated: false,
};

function instrumentsReducer(
  state: InstrumentsState,
  action: InstrumentsAction
): InstrumentsState {
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
      return {
        ...state,
        submitting: action.payload,
      };

    case 'SET_ERROR':
      if (action.payload === null) {
        return {
          ...state,
          error: null,
        };
      }

      return {
        ...state,
        instruments: [],
        loadedAccessScopeKey: null,
        error: action.payload,
      };

    case 'SET_INSTRUMENTS':
      return {
        ...state,
        instruments: action.payload.instruments,
        loadedAccessScopeKey: action.payload.loadedAccessScopeKey,
        error: null,
        lastUpdated: new Date(),
      };

    case 'SET_ALL_RESULTS_TRUNCATED':
      return {
        ...state,
        allResultsTruncated: action.payload,
      };

    case 'ADD_INSTRUMENT':
      return {
        ...state,
        instruments: [
          parseInstrumentType(action.payload.instrument),
          ...state.instruments.filter(
            instrument => instrument.id !== action.payload.instrument.id
          ),
        ],
        loadedAccessScopeKey: action.payload.accessScopeKey,
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
        loadedAccessScopeKey: action.payload.accessScopeKey,
        lastUpdated: new Date(),
      };

    case 'REMOVE_INSTRUMENT':
      return {
        ...state,
        instruments: state.instruments.filter(
          instrument => instrument.id !== action.payload.id
        ),
        loadedAccessScopeKey: action.payload.accessScopeKey,
        lastUpdated: new Date(),
      };

    case 'INVALIDATE_CACHE':
      return {
        ...state,
        lastUpdated: null,
      };

    case 'RESET_STATE':
      return initialState;

    default:
      return state;
  }
}

const InstrumentsContext = createContext<{
  state: InstrumentsState;
  dispatch: React.Dispatch<InstrumentsAction>;
  actions: {
    fetchInstruments: (opts?: { all?: boolean }) => Promise<void>;

    createInstrument: (
      instrument: Omit<Instrument, 'id' | 'created_at'>,
      options?: { idempotencyKey?: string }
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

export function InstrumentsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(instrumentsReducer, initialState);

  const { handleError } = useErrorHandler();

  const handleErrorRef = useRef(handleError);

  useEffect(() => {
    handleErrorRef.current = handleError;
  }, [handleError]);

  const { accessScopeKey } = useTenantIdentity();

  const inflight = useRef(new Map<string, Promise<void>>());

  const accessScopeKeyRef = useRef<string | null>(accessScopeKey);

  const previousAccessScopeKeyRef = useRef<string | null>(accessScopeKey);

  useEffect(() => {
    if (previousAccessScopeKeyRef.current !== accessScopeKey) {
      inflight.current.clear();

      dispatch({ type: 'RESET_STATE' });
    }

    accessScopeKeyRef.current = accessScopeKey;

    previousAccessScopeKeyRef.current = accessScopeKey;
  }, [accessScopeKey]);

  const deduped = useCallback(
    <T extends () => Promise<void>>(scopeKey: string, fn: T): Promise<void> => {
      const existing = inflight.current.get(scopeKey);

      if (existing) return existing;

      const promise = fn().finally(() => {
        if (inflight.current.get(scopeKey) === promise) {
          inflight.current.delete(scopeKey);
        }
      });

      inflight.current.set(scopeKey, promise);

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

  const fetchInstruments = useCallback(
    async (opts?: { all?: boolean }) => {
      const listAll = opts?.all === true;

      const fetchAccessScopeKey = accessScopeKeyRef.current;

      if (!fetchAccessScopeKey) {
        return;
      }

      const modeKey = listAll ? 'all' : 'bounded';

      const inflightKey = `${fetchAccessScopeKey}:${modeKey}`;

      return deduped(inflightKey, async () => {
        dispatch({ type: 'START_LOADING' });
        dispatch({ type: 'SET_ERROR', payload: null });

        try {
          const u = new URLSearchParams({
            orderBy: 'created_at',
            ascending: 'false',
          });

          if (listAll) {
            u.set('all', 'true');
          }

          const response = await apiFetch(`/api/instruments?${u.toString()}`);

          const result = await readApiResponseEnvelope<Instrument[]>(
            response,
            `Failed to fetch instruments (${response.status})`
          );

          const instruments = ((result?.data || []) as Instrument[]).map(
            parseInstrumentType
          );
          const allResultsTruncated = result.truncated === true;

          if (accessScopeKeyRef.current !== fetchAccessScopeKey) {
            return;
          }

          dispatch({
            type: 'SET_INSTRUMENTS',
            payload: {
              instruments,
              loadedAccessScopeKey: fetchAccessScopeKey,
            },
          });

          if (listAll) {
            dispatch({
              type: 'SET_ALL_RESULTS_TRUNCATED',
              payload: allResultsTruncated,
            });
          }
        } catch (error) {
          if (accessScopeKeyRef.current !== fetchAccessScopeKey) {
            return;
          }

          if (isAuthLikeTenantError(error)) {
            dispatch({ type: 'RESET_STATE' });
            return;
          }

          dispatch({
            type: 'SET_ERROR',
            payload: error,
          });

          handleErrorRef.current(error, 'Fetch instruments');
        } finally {
          if (accessScopeKeyRef.current === fetchAccessScopeKey) {
            dispatch({ type: 'END_LOADING' });
          }
        }
      });
    },
    [deduped]
  );

  const createInstrument = useCallback(
    async (
      instrument: Omit<Instrument, 'id' | 'created_at'>,
      options?: { idempotencyKey?: string }
    ): Promise<Instrument> => {
      const mutationAccessScopeKey = accessScopeKeyRef.current;

      dispatch({ type: 'SET_SUBMITTING', payload: true });

      try {
        const response = await apiFetch(
          '/api/instruments',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(instrument),
          },
          {
            idempotencyKey:
              options?.idempotencyKey ??
              generateIdempotencyKey('instrument-create'),
          }
        );

        if (!response.ok) {
          throw await createApiResponseErrorFromResponse(
            response,
            `Failed to create instrument (${response.status})`
          );
        }

        const result = await readApiResponseEnvelope<Instrument>(
          response,
          `Failed to create instrument (${response.status})`
        );

        if (accessScopeKeyRef.current !== mutationAccessScopeKey) {
          throw new Error(
            'Instrument creation aborted: access scope changed during request'
          );
        }

        const parsedData = parseInstrumentType(result.data);

        if (
          !parsedData ||
          typeof parsedData.id !== 'string' ||
          parsedData.id.length === 0
        ) {
          throw new Error('Instrument creation failed: invalid payload');
        }

        dispatch({
          type: 'ADD_INSTRUMENT',
          payload: {
            instrument: parsedData,
            accessScopeKey: mutationAccessScopeKey ?? '',
          },
        });

        return parsedData;
      } catch (error) {
        if (accessScopeKeyRef.current !== mutationAccessScopeKey) {
          throw toError(error, 'Instrument creation aborted');
        }

        if (isAuthLikeTenantError(error)) {
          dispatch({ type: 'RESET_STATE' });
        }

        throw toError(error, 'Failed to create instrument');
      } finally {
        if (accessScopeKeyRef.current === mutationAccessScopeKey) {
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
      const mutationAccessScopeKey = accessScopeKeyRef.current;

      dispatch({ type: 'SET_SUBMITTING', payload: true });

      try {
        const response = await apiFetch('/api/instruments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...instrument }),
        });

        if (!response.ok) {
          if (response.status === 409) {
            const conflictError = await createApiResponseErrorFromResponse(
              response,
              `Failed to update instrument (${response.status})`
            );
            logInfo('instrument_update_conflict_client', 'InstrumentsContext', {
              instrumentId: id,
            });

            await fetchInstruments({ all: true });

            throw conflictError;
          }

          throw await createApiResponseErrorFromResponse(
            response,
            `Failed to update instrument (${response.status})`
          );
        }

        const result = await readApiResponseEnvelope<Instrument>(
          response,
          `Failed to update instrument (${response.status})`
        );

        if (accessScopeKeyRef.current !== mutationAccessScopeKey) {
          throw new Error(
            'Instrument update aborted: access scope changed during request'
          );
        }

        const parsedRaw = parseInstrumentType(result.data);

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
          payload: {
            id,
            instrument: parsedData,
            accessScopeKey: mutationAccessScopeKey ?? '',
          },
        });

        return parsedData;
      } catch (error) {
        if (accessScopeKeyRef.current !== mutationAccessScopeKey) {
          throw toError(error, 'Instrument update aborted');
        }

        if (isAuthLikeTenantError(error)) {
          dispatch({ type: 'RESET_STATE' });
        }

        throw toError(error, 'Failed to update instrument');
      } finally {
        if (accessScopeKeyRef.current === mutationAccessScopeKey) {
          dispatch({ type: 'SET_SUBMITTING', payload: false });
        }
      }
    },
    [fetchInstruments]
  );

  const deleteInstrument = useCallback(async (id: string): Promise<void> => {
    const mutationAccessScopeKey = accessScopeKeyRef.current;

    dispatch({ type: 'SET_SUBMITTING', payload: true });

    try {
      const response = await apiFetch(
        `/api/instruments?id=${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw await createApiResponseErrorFromResponse(
          response,
          `Failed to delete instrument (${response.status})`
        );
      }

      if (accessScopeKeyRef.current !== mutationAccessScopeKey) {
        throw new Error(
          'Instrument delete aborted: access scope changed during request'
        );
      }

      dispatch({
        type: 'REMOVE_INSTRUMENT',
        payload: {
          id,
          accessScopeKey: mutationAccessScopeKey ?? '',
        },
      });
    } catch (error) {
      if (accessScopeKeyRef.current !== mutationAccessScopeKey) {
        throw toError(error, 'Instrument delete aborted');
      }

      if (isAuthLikeTenantError(error)) {
        dispatch({ type: 'RESET_STATE' });
      }

      throw toError(error, 'Failed to delete instrument');
    } finally {
      if (accessScopeKeyRef.current === mutationAccessScopeKey) {
        dispatch({ type: 'SET_SUBMITTING', payload: false });
      }
    }
  }, []);

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
    () => ({
      state,
      dispatch,
      actions,
    }),
    [state, actions]
  );

  return (
    <InstrumentsContext.Provider value={contextValue}>
      {children}
    </InstrumentsContext.Provider>
  );
}

export function useInstrumentsContext() {
  const context = useContext(InstrumentsContext);

  if (!context) {
    throw new Error(
      'useInstrumentsContext must be used within an InstrumentsProvider'
    );
  }

  return context;
}

export function useInstruments() {
  const { state, actions } = useInstrumentsContext();
  const { accessScopeKey } = useTenantIdentity();

  const instruments =
    state.loadedAccessScopeKey !== null &&
    state.loadedAccessScopeKey === accessScopeKey
      ? state.instruments
      : [];

  const allResultsTruncated =
    state.loadedAccessScopeKey !== null &&
    state.loadedAccessScopeKey === accessScopeKey
      ? state.allResultsTruncated
      : false;

  return {
    instruments,
    loading: state.loading,
    submitting: state.submitting,
    error: state.error,
    lastUpdated: state.lastUpdated,
    allResultsTruncated,
    ...actions,
  };
}
