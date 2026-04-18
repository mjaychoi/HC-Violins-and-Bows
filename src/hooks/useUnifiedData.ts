'use client';

/**
 * Unified data management hooks
 *
 * 업데이트 포인트(핵심):
 * - ✅ 전역 ref "fetched" 플래그를 'true 선점'하지 않음 → fetch 성공 시에만 true로 set
 *   (기존 코드는 fetch 실패/취소에도 영구적으로 true가 되어 다시 못 가져오는 버그 가능)
 * - ✅ auth user 변경(로그아웃/로그인, 다른 유저) 시 전역 ref/ongoing promise 리셋
 * - ✅ StrictMode/다중 인스턴스에서도 중복 fetch 방지: "ongoing promise"를 1급으로 사용
 * - ✅ need 판정은 state.length === 0 + not fetched 조합 유지하되, fetched가 false일 때만 시도
 * - ✅ 불필요 import 제거(DataContext 훅/RelationshipType 등 실제 사용만 남김)
 * - ✅ return shape 유지(호환) + deprecated any 필드 유지
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';

import { useClientsContext } from '@/contexts/ClientsContext';
import { useInstrumentsContext } from '@/contexts/InstrumentsContext';
import { useConnectionsContext } from '@/contexts/ConnectionsContext';
import {
  useClients,
  useInstruments,
  useConnections,
} from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { getTenantIdentityKey } from '@/utils/tenantIdentity';

import type {
  RelationshipType,
  Client,
  Instrument,
  ClientInstrument,
} from '@/types';
import { logInfo, logDebug } from '@/utils/logger';
import { normalizeUnifiedResourceErrors } from './unifiedResourceErrors';

// ----------------------------
// Module-level singletons
// ----------------------------

// "fetched successfully" flags (persist across instances / StrictMode remounts)
const globalFetched = {
  clients: { current: false },
  instruments: { current: false },
  connections: { current: false },
};

// ongoing fetch promises (dedupe concurrent calls)
const ongoing = {
  clients: { current: null as Promise<void> | null },
  instruments: { current: null as Promise<void> | null },
  connections: { current: null as Promise<void> | null },
};

const globalTenantIdentityKeyRef = { current: null as string | null };

function resetGlobalsForTenantChange() {
  globalFetched.clients.current = false;
  globalFetched.instruments.current = false;
  globalFetched.connections.current = false;

  ongoing.clients.current = null;
  ongoing.instruments.current = null;
  ongoing.connections.current = null;
}

export function __resetUnifiedDataGlobalsForTests() {
  globalTenantIdentityKeyRef.current = null;
  resetGlobalsForTenantChange();
}

function useTenantScopeGuard() {
  const { user, session, orgId, loading } = useAuth();

  const tenantIdentityKey = useMemo(
    () =>
      getTenantIdentityKey({
        user,
        orgId,
        session,
        loading,
      }),
    [loading, orgId, session, user]
  );

  return {
    tenantIdentityKey,
    isTenantTransitioning:
      loading ||
      (Boolean(user) &&
        globalTenantIdentityKeyRef.current !== null &&
        globalTenantIdentityKeyRef.current !== tenantIdentityKey),
  };
}

// unified data hook - manage all data in one place
export function useUnifiedData() {
  // DEBUG: Log every time this hook is called to track multiple invocations
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    logInfo('[useUnifiedData] Hook called');
  }

  const clientsContext = useClientsContext();
  const instrumentsContext = useInstrumentsContext();
  const connectionsContext = useConnectionsContext();

  const { user, session, orgId, loading: authLoading } = useAuth();
  const tenantIdentityKey = useMemo(
    () =>
      getTenantIdentityKey({
        user,
        orgId,
        session,
        loading: authLoading,
      }),
    [authLoading, orgId, session, user]
  );

  const state = useMemo(
    () => ({
      clients: clientsContext.state.clients,
      instruments: instrumentsContext.state.instruments,
      connections: connectionsContext.state.connections,
      loading: {
        clients: clientsContext.state.loading,
        instruments: instrumentsContext.state.loading,
        connections: connectionsContext.state.loading,
      },
      errors: {
        clients: clientsContext.state.error,
        instruments: instrumentsContext.state.error,
        connections: connectionsContext.state.error,
      },
      submitting: {
        clients: clientsContext.state.submitting,
        instruments: instrumentsContext.state.submitting,
        connections: connectionsContext.state.submitting,
      },
      lastUpdated: {
        clients: clientsContext.state.lastUpdated,
        instruments: instrumentsContext.state.lastUpdated,
        connections: connectionsContext.state.lastUpdated,
      },
    }),
    [clientsContext.state, instrumentsContext.state, connectionsContext.state]
  );

  const actions = useMemo(
    () => ({
      fetchClients: clientsContext.actions.fetchClients,
      createClient: clientsContext.actions.createClient,
      updateClient: clientsContext.actions.updateClient,
      deleteClient: clientsContext.actions.deleteClient,

      fetchInstruments: instrumentsContext.actions.fetchInstruments,
      createInstrument: instrumentsContext.actions.createInstrument,
      updateInstrument: instrumentsContext.actions.updateInstrument,
      deleteInstrument: instrumentsContext.actions.deleteInstrument,

      fetchConnections: connectionsContext.actions.fetchConnections,
      createConnection: connectionsContext.actions.createConnection,
      updateConnection: connectionsContext.actions.updateConnection,
      deleteConnection: connectionsContext.actions.deleteConnection,

      invalidateCache: (
        dataType: 'clients' | 'instruments' | 'connections'
      ) => {
        if (dataType === 'clients') clientsContext.actions.invalidateCache();
        else if (dataType === 'instruments')
          instrumentsContext.actions.invalidateCache();
        else connectionsContext.actions.invalidateCache();
      },

      resetState: () => {
        clientsContext.actions.resetState();
        instrumentsContext.actions.resetState();
        connectionsContext.actions.resetState();
      },
    }),
    [
      clientsContext.actions,
      instrumentsContext.actions,
      connectionsContext.actions,
    ]
  );

  const actionsRef = useRef(actions);
  const stateRef = useRef(state);
  actionsRef.current = actions;
  stateRef.current = state;

  useLayoutEffect(() => {
    if (authLoading) return;

    if (globalTenantIdentityKeyRef.current === tenantIdentityKey) {
      return;
    }

    globalTenantIdentityKeyRef.current = tenantIdentityKey;
    resetGlobalsForTenantChange();
    actionsRef.current.resetState();
  }, [authLoading, tenantIdentityKey]);

  /**
   * initial data loading
   * - 각 리소스별로 missing일 때만 fetch (once globally)
   * - 핵심: fetched flag는 "성공"했을 때만 true
   *   (중복 방지는 ongoing promise로 해결)
   */
  useEffect(() => {
    if (authLoading || !tenantIdentityKey || !user) {
      if (process.env.NODE_ENV === 'development') {
        logInfo(
          '[useUnifiedData] Tenant identity unavailable or auth loading, skipping fetch'
        );
      }
      return;
    }

    const currentState = stateRef.current;

    const needClients =
      !globalFetched.clients.current && currentState.clients.length === 0;
    const needInstruments =
      !globalFetched.instruments.current &&
      currentState.instruments.length === 0;
    const needConnections =
      !globalFetched.connections.current &&
      currentState.connections.length === 0;

    if (!needClients && !needInstruments && !needConnections) {
      if (process.env.NODE_ENV === 'development') {
        logInfo('[useUnifiedData] No data needed, skipping');
      }
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      logDebug('[useUnifiedData] Fetch check:', {
        needClients,
        needInstruments,
        needConnections,
        globalFetched: {
          clients: globalFetched.clients.current,
          instruments: globalFetched.instruments.current,
          connections: globalFetched.connections.current,
        },
        stateLengths: {
          clients: currentState.clients.length,
          instruments: currentState.instruments.length,
          connections: currentState.connections.length,
        },
      });
    }

    let cancelled = false;

    const load = async () => {
      const a = actionsRef.current;
      const fetchTenantIdentityKey = tenantIdentityKey;

      const runOne = async (
        key: 'clients' | 'instruments' | 'connections',
        shouldRun: boolean,
        fetchFn: () => Promise<void>
      ) => {
        if (!shouldRun || cancelled) return;

        // If there's already an in-flight request, await it.
        if (ongoing[key].current) {
          if (process.env.NODE_ENV === 'development') {
            logInfo(
              `[useUnifiedData] ${key} fetch already in progress, waiting...`
            );
          }
          await ongoing[key].current;
          return;
        }

        if (process.env.NODE_ENV === 'development') {
          logInfo(`[useUnifiedData] Starting ${key} fetch...`);
        }

        ongoing[key].current = (async () => {
          try {
            await fetchFn();
            if (
              !cancelled &&
              globalTenantIdentityKeyRef.current === fetchTenantIdentityKey
            ) {
              globalFetched[key].current = true;
            }
          } catch (e) {
            // 실패 시 fetched는 false 유지 → 다음 렌더에서 재시도 가능
            globalFetched[key].current = false;
            throw e;
          } finally {
            ongoing[key].current = null;
          }
        })();

        try {
          await ongoing[key].current;
        } catch {
          // fetchFn 내부에서 toast/error 처리할 가능성이 높아서 여기서 추가 처리 생략
        }
      };

      await Promise.all([
        runOne('clients', needClients, a.fetchClients),
        runOne('instruments', needInstruments, a.fetchInstruments),
        runOne('connections', needConnections, a.fetchConnections),
      ]);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [authLoading, tenantIdentityKey, user]);

  const hasAnyLoading =
    state.loading.clients ||
    state.loading.instruments ||
    state.loading.connections;
  const hasAnySubmitting =
    state.submitting.clients ||
    state.submitting.instruments ||
    state.submitting.connections;
  const normalizedErrors = useMemo(
    () => normalizeUnifiedResourceErrors(state.errors),
    [state.errors]
  );
  const { isTenantTransitioning } = useTenantScopeGuard();

  return {
    // state
    clients: isTenantTransitioning ? [] : state.clients,
    instruments: isTenantTransitioning ? [] : state.instruments,
    connections: isTenantTransitioning ? [] : state.connections,

    // loading
    loading: {
      clients: isTenantTransitioning ? true : state.loading.clients,
      instruments: isTenantTransitioning ? true : state.loading.instruments,
      connections: isTenantTransitioning ? true : state.loading.connections,
      // @deprecated Use hasAnyLoading instead
      any: isTenantTransitioning ? true : hasAnyLoading,
      hasAnyLoading: isTenantTransitioning ? true : hasAnyLoading,
    },
    errors: {
      ...normalizedErrors,
    },

    // submitting
    submitting: {
      clients: state.submitting.clients,
      instruments: state.submitting.instruments,
      connections: state.submitting.connections,
      // @deprecated Use hasAnySubmitting instead
      any: hasAnySubmitting,
      hasAnySubmitting,
    },

    // last updated
    lastUpdated: state.lastUpdated,

    // actions
    ...actions,
  };
}

// ----------------------------
// Client / Instrument / Connection wrappers
// ----------------------------

export function useUnifiedClients() {
  const clientsHook = useClients();
  const { isTenantTransitioning } = useTenantScopeGuard();
  return {
    ...clientsHook,
    clients: isTenantTransitioning ? [] : clientsHook.clients,
    loading: {
      clients: isTenantTransitioning ? true : clientsHook.loading,
      // @deprecated Use hasAnyLoading instead
      any: isTenantTransitioning ? true : clientsHook.loading,
      hasAnyLoading: isTenantTransitioning ? true : clientsHook.loading,
    },
    submitting: {
      clients: clientsHook.submitting,
      // @deprecated Use hasAnySubmitting instead
      any: clientsHook.submitting,
      hasAnySubmitting: clientsHook.submitting,
    },
  };
}

export function useUnifiedInstruments() {
  const instrumentsHook = useInstruments();
  const { isTenantTransitioning } = useTenantScopeGuard();

  return {
    ...instrumentsHook,
    instruments: isTenantTransitioning ? [] : instrumentsHook.instruments,
    loading: isTenantTransitioning ? true : instrumentsHook.loading,
  };
}

export function useUnifiedConnections() {
  const connectionsHook = useConnections();
  const { isTenantTransitioning } = useTenantScopeGuard();

  return {
    ...connectionsHook,
    connections: isTenantTransitioning ? [] : connectionsHook.connections,
    loading: isTenantTransitioning ? true : connectionsHook.loading,
  };
}

// ----------------------------
// Dashboard computed hook
// ----------------------------

export function useUnifiedDashboard() {
  const clientsContext = useClientsContext();
  const instrumentsContext = useInstrumentsContext();
  const connectionsContext = useConnectionsContext();

  const state = useMemo(
    () => ({
      clients: clientsContext.state.clients,
      instruments: instrumentsContext.state.instruments,
      connections: connectionsContext.state.connections,
      loading: {
        clients: clientsContext.state.loading,
        instruments: instrumentsContext.state.loading,
        connections: connectionsContext.state.loading,
      },
      errors: {
        clients: clientsContext.state.error,
        instruments: instrumentsContext.state.error,
        connections: connectionsContext.state.error,
      },
      submitting: {
        clients: clientsContext.state.submitting,
        instruments: instrumentsContext.state.submitting,
        connections: connectionsContext.state.submitting,
      },
    }),
    [clientsContext.state, instrumentsContext.state, connectionsContext.state]
  );

  const actions = useMemo(
    () => ({
      fetchClients: clientsContext.actions.fetchClients,
      createClient: clientsContext.actions.createClient,
      updateClient: clientsContext.actions.updateClient,
      deleteClient: clientsContext.actions.deleteClient,
      fetchInstruments: instrumentsContext.actions.fetchInstruments,
      createInstrument: instrumentsContext.actions.createInstrument,
      updateInstrument: instrumentsContext.actions.updateInstrument,
      deleteInstrument: instrumentsContext.actions.deleteInstrument,
      fetchConnections: connectionsContext.actions.fetchConnections,
      createConnection: connectionsContext.actions.createConnection,
      updateConnection: connectionsContext.actions.updateConnection,
      deleteConnection: connectionsContext.actions.deleteConnection,
      invalidateCache: (
        dataType: 'clients' | 'instruments' | 'connections'
      ) => {
        if (dataType === 'clients') clientsContext.actions.invalidateCache();
        else if (dataType === 'instruments')
          instrumentsContext.actions.invalidateCache();
        else connectionsContext.actions.invalidateCache();
      },
      resetState: () => {
        clientsContext.actions.resetState();
        instrumentsContext.actions.resetState();
        connectionsContext.actions.resetState();
      },
    }),
    [
      clientsContext.actions,
      instrumentsContext.actions,
      connectionsContext.actions,
    ]
  );

  type EnrichedConnection = ClientInstrument & {
    client: Client;
    instrument: Instrument;
  };

  const clientRelationships = useMemo<EnrichedConnection[]>(() => {
    const clientMap = new Map(state.clients.map(c => [c.id, c]));
    const instrumentMap = new Map(state.instruments.map(i => [i.id, i]));

    return state.connections
      .map(connection => ({
        ...connection,
        client: clientMap.get(connection.client_id),
        instrument: instrumentMap.get(connection.instrument_id),
      }))
      .filter(
        (rel): rel is EnrichedConnection =>
          rel.client !== undefined && rel.instrument !== undefined
      );
  }, [state.connections, state.clients, state.instruments]);

  const hasAnyLoading =
    state.loading.instruments ||
    state.loading.clients ||
    state.loading.connections;
  const hasAnySubmitting =
    state.submitting.instruments || state.submitting.connections;
  const normalizedErrors = useMemo(
    () => normalizeUnifiedResourceErrors(state.errors),
    [state.errors]
  );
  const { isTenantTransitioning } = useTenantScopeGuard();
  const safeClients = isTenantTransitioning ? [] : state.clients;
  const safeInstruments = isTenantTransitioning ? [] : state.instruments;
  const safeConnections = isTenantTransitioning ? [] : state.connections;
  const safeClientRelationships = isTenantTransitioning
    ? []
    : clientRelationships;

  return {
    instruments: safeInstruments,
    connections: safeConnections,
    clients: safeClients,

    clientRelationships: safeClientRelationships,
    instrumentRelationships: safeClientRelationships,

    loading: {
      instruments: isTenantTransitioning ? true : state.loading.instruments,
      clients: isTenantTransitioning ? true : state.loading.clients,
      connections: isTenantTransitioning ? true : state.loading.connections,
      // @deprecated Use hasAnyLoading instead
      any: isTenantTransitioning ? true : hasAnyLoading,
      hasAnyLoading: isTenantTransitioning ? true : hasAnyLoading,
    },
    errors: {
      ...normalizedErrors,
    },

    submitting: {
      instruments: state.submitting.instruments,
      connections: state.submitting.connections,
      // @deprecated Use hasAnySubmitting instead
      any: hasAnySubmitting,
      hasAnySubmitting,
    },

    fetchClients: actions.fetchClients,
    createClient: actions.createClient,
    updateClient: actions.updateClient,
    deleteClient: actions.deleteClient,
    fetchInstruments: actions.fetchInstruments,
    createInstrument: actions.createInstrument,
    updateInstrument: actions.updateInstrument,
    deleteInstrument: actions.deleteInstrument,
    fetchConnections: actions.fetchConnections,
    createConnection: actions.createConnection,
    updateConnection: actions.updateConnection,
    deleteConnection: actions.deleteConnection,
    invalidateCache: actions.invalidateCache,
    resetState: actions.resetState,
  };
}

// ----------------------------
// Connected clients data hook
// ----------------------------

export function useConnectedClientsData() {
  const clientsContext = useClientsContext();
  const instrumentsContext = useInstrumentsContext();
  const connectionsContext = useConnectionsContext();

  const state = useMemo(
    () => ({
      clients: clientsContext.state.clients,
      instruments: instrumentsContext.state.instruments,
      connections: connectionsContext.state.connections,
      loading: {
        clients: clientsContext.state.loading,
        instruments: instrumentsContext.state.loading,
        connections: connectionsContext.state.loading,
      },
      submitting: {
        connections: connectionsContext.state.submitting,
      },
    }),
    [clientsContext.state, instrumentsContext.state, connectionsContext.state]
  );

  const createConnection = useCallback(
    async (
      clientId: string,
      instrumentId: string,
      relationshipType: RelationshipType,
      notes: string
    ) => {
      return await connectionsContext.actions.createConnection({
        client_id: clientId,
        instrument_id: instrumentId,
        relationship_type: relationshipType,
        notes: notes || null,
      });
    },
    [connectionsContext.actions]
  );

  const updateConnection = useCallback(
    async (
      connectionId: string,
      updates: { relationshipType: RelationshipType; notes: string }
    ) => {
      return await connectionsContext.actions.updateConnection(connectionId, {
        relationship_type: updates.relationshipType,
        notes: updates.notes || null,
      });
    },
    [connectionsContext.actions]
  );

  const hasAnyLoading =
    state.loading.clients ||
    state.loading.instruments ||
    state.loading.connections;
  const { isTenantTransitioning } = useTenantScopeGuard();

  return {
    clients: isTenantTransitioning ? [] : state.clients,
    instruments: isTenantTransitioning ? [] : state.instruments,
    connections: isTenantTransitioning ? [] : state.connections,

    loading: {
      clients: isTenantTransitioning ? true : state.loading.clients,
      instruments: isTenantTransitioning ? true : state.loading.instruments,
      connections: isTenantTransitioning ? true : state.loading.connections,
      // @deprecated Use hasAnyLoading instead
      any: isTenantTransitioning ? true : hasAnyLoading,
      hasAnyLoading: isTenantTransitioning ? true : hasAnyLoading,
    },

    submitting: {
      connections: state.submitting.connections,
      // @deprecated Use hasAnySubmitting instead
      any: state.submitting.connections,
      hasAnySubmitting: state.submitting.connections,
    },

    createConnection,
    updateConnection,
    deleteConnection: connectionsContext.actions.deleteConnection,
    fetchConnections: connectionsContext.actions.fetchConnections,
  };
}

// ----------------------------
// Search hook
// ----------------------------

export function useUnifiedSearch() {
  const clientsContext = useClientsContext();
  const instrumentsContext = useInstrumentsContext();
  const connectionsContext = useConnectionsContext();

  const clients = clientsContext.state.clients;
  const instruments = instrumentsContext.state.instruments;
  const connections = connectionsContext.state.connections;
  const { isTenantTransitioning } = useTenantScopeGuard();
  const safeClients = isTenantTransitioning ? [] : clients;
  const safeInstruments = isTenantTransitioning ? [] : instruments;
  const safeConnections = isTenantTransitioning ? [] : connections;

  const searchAll = useCallback(
    (query: string) => {
      const lowerQuery = query.toLowerCase();

      const filteredClients = safeClients.filter(
        (client: Client) =>
          (client.first_name || '').toLowerCase().includes(lowerQuery) ||
          (client.last_name || '').toLowerCase().includes(lowerQuery) ||
          (client.email || '').toLowerCase().includes(lowerQuery) ||
          (client.client_number || '').toLowerCase().includes(lowerQuery)
      );

      const filteredInstruments = safeInstruments.filter(
        (instrument: Instrument) =>
          (instrument.maker || '').toLowerCase().includes(lowerQuery) ||
          (instrument.type || '').toLowerCase().includes(lowerQuery) ||
          (instrument.serial_number || '').toLowerCase().includes(lowerQuery)
      );

      const filteredConnections = safeConnections.filter(
        (connection: ClientInstrument) =>
          (connection.notes || '').toLowerCase().includes(lowerQuery) ||
          connection.relationship_type.toLowerCase().includes(lowerQuery)
      );

      return {
        clients: filteredClients,
        instruments: filteredInstruments,
        connections: filteredConnections,
        total:
          filteredClients.length +
          filteredInstruments.length +
          filteredConnections.length,
      };
    },
    [safeClients, safeConnections, safeInstruments]
  );

  return {
    searchAll,
    clients: safeClients,
    instruments: safeInstruments,
    connections: safeConnections,
  };
}

// ----------------------------
// Cache hook
// ----------------------------

export function useUnifiedCache() {
  const clientsContext = useClientsContext();
  const instrumentsContext = useInstrumentsContext();
  const connectionsContext = useConnectionsContext();

  const invalidate = useCallback(
    (dataType: 'clients' | 'instruments' | 'connections') => {
      if (dataType === 'clients') clientsContext.actions.invalidateCache();
      else if (dataType === 'instruments')
        instrumentsContext.actions.invalidateCache();
      else connectionsContext.actions.invalidateCache();
    },
    [
      clientsContext.actions,
      instrumentsContext.actions,
      connectionsContext.actions,
    ]
  );

  const invalidateAll = useCallback(() => {
    clientsContext.actions.invalidateCache();
    instrumentsContext.actions.invalidateCache();
    connectionsContext.actions.invalidateCache();
  }, [
    clientsContext.actions,
    instrumentsContext.actions,
    connectionsContext.actions,
  ]);

  const reset = useCallback(() => {
    clientsContext.actions.resetState();
    instrumentsContext.actions.resetState();
    connectionsContext.actions.resetState();
    resetGlobalsForTenantChange();
  }, [
    clientsContext.actions,
    instrumentsContext.actions,
    connectionsContext.actions,
  ]);

  return {
    invalidate,
    invalidateAll,
    reset,
  };
}
