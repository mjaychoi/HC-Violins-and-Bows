'use client';

// unified data management hook - replace existing hooks
import { useCallback, useEffect, useMemo, useRef } from 'react';
// Note: useRef is only used in useUnifiedData (Single Source of Truth for fetching)
import {
  useDataContext,
  useClients,
  useInstruments,
  useConnections,
} from '@/contexts/DataContext';
import {
  RelationshipType,
  Client,
  Instrument,
  ClientInstrument,
} from '@/types';

// FIXED: Global refs shared across all component instances to prevent duplicate fetches
// These are module-level refs that persist across all hook instances and survive Strict Mode remounts
const globalHasFetchedClientsRef = { current: false };
const globalHasFetchedInstrumentsRef = { current: false };
const globalHasFetchedConnectionsRef = { current: false };

// CRITICAL: Track ongoing fetch promises to prevent duplicate concurrent fetches
const ongoingFetchClientsPromise = { current: null as Promise<void> | null };
const ongoingFetchInstrumentsPromise = {
  current: null as Promise<void> | null,
};
const ongoingFetchConnectionsPromise = {
  current: null as Promise<void> | null,
};

// unified data hook - manage all data in one place
export function useUnifiedData() {
  // DEBUG: Log every time this hook is called to track multiple invocations
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[useUnifiedData] Hook called');
  }

  const { state, actions } = useDataContext();

  // FIXED: Store actions and state in refs to avoid dependency issues
  const actionsRef = useRef(actions);
  const stateRef = useRef(state);

  // Always keep refs up-to-date
  actionsRef.current = actions;
  stateRef.current = state;

  // initial data loading - 각 리소스별로 missing일 때만 fetch (once globally)
  // FIXED: Use global refs ONLY - don't check state.length as it changes and causes re-runs
  // Global refs persist across Strict Mode remounts, so once set to true, it stays true
  useEffect(() => {
    // CRITICAL: Check global refs FIRST - if already fetched, don't do anything
    // This must be the first check to prevent any fetch attempts
    if (
      globalHasFetchedClientsRef.current &&
      globalHasFetchedInstrumentsRef.current &&
      globalHasFetchedConnectionsRef.current
    ) {
      // Already fetched globally, skip entirely
      if (process.env.NODE_ENV === 'development') {
        console.log(
          '[useUnifiedData] All data already fetched globally, skipping'
        );
      }
      return;
    }

    // Check current state using ref (not directly) to avoid dependency issues
    const currentState = stateRef.current;
    const needClients =
      !globalHasFetchedClientsRef.current && currentState.clients.length === 0;
    const needInstruments =
      !globalHasFetchedInstrumentsRef.current &&
      currentState.instruments.length === 0;
    const needConnections =
      !globalHasFetchedConnectionsRef.current &&
      currentState.connections.length === 0;

    if (!needClients && !needInstruments && !needConnections) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useUnifiedData] No data needed, skipping');
      }
      return;
    }

    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[useUnifiedData] Fetch check:', {
        needClients,
        needInstruments,
        needConnections,
        globalRefs: {
          clients: globalHasFetchedClientsRef.current,
          instruments: globalHasFetchedInstrumentsRef.current,
          connections: globalHasFetchedConnectionsRef.current,
        },
        stateLengths: {
          clients: currentState.clients.length,
          instruments: currentState.instruments.length,
          connections: currentState.connections.length,
        },
      });
    }

    // CRITICAL: Mark as fetching BEFORE calling to prevent race conditions
    // This must happen synchronously, not inside the async function
    if (needClients) {
      globalHasFetchedClientsRef.current = true;
    }
    if (needInstruments) {
      globalHasFetchedInstrumentsRef.current = true;
    }
    if (needConnections) {
      globalHasFetchedConnectionsRef.current = true;
    }

    const loadMissingData = async () => {
      const currentActions = actionsRef.current;

      // CRITICAL: Check if fetch is already in progress and wait for it instead of starting a new one
      if (needClients) {
        if (ongoingFetchClientsPromise.current) {
          console.log(
            '[useUnifiedData] Clients fetch already in progress, waiting...'
          );
          await ongoingFetchClientsPromise.current;
        } else {
          console.log('[useUnifiedData] Starting clients fetch...');
          ongoingFetchClientsPromise.current = (async () => {
            try {
              await currentActions.fetchClients();
            } finally {
              ongoingFetchClientsPromise.current = null;
            }
          })();
          await ongoingFetchClientsPromise.current;
        }
      }

      if (needInstruments) {
        if (ongoingFetchInstrumentsPromise.current) {
          console.log(
            '[useUnifiedData] Instruments fetch already in progress, waiting...'
          );
          await ongoingFetchInstrumentsPromise.current;
        } else {
          console.log('[useUnifiedData] Starting instruments fetch...');
          ongoingFetchInstrumentsPromise.current = (async () => {
            try {
              await currentActions.fetchInstruments();
            } finally {
              ongoingFetchInstrumentsPromise.current = null;
            }
          })();
          await ongoingFetchInstrumentsPromise.current;
        }
      }

      if (needConnections) {
        if (ongoingFetchConnectionsPromise.current) {
          console.log(
            '[useUnifiedData] Connections fetch already in progress, waiting...'
          );
          await ongoingFetchConnectionsPromise.current;
        } else {
          console.log('[useUnifiedData] Starting connections fetch...');
          ongoingFetchConnectionsPromise.current = (async () => {
            try {
              await currentActions.fetchConnections();
            } finally {
              ongoingFetchConnectionsPromise.current = null;
            }
          })();
          await ongoingFetchConnectionsPromise.current;
        }
      }
    };

    loadMissingData();
    // FIXED: Empty dependency array - useEffect runs once on mount
    // Global refs persist across Strict Mode remounts, so once fetched, it won't fetch again
    // We use refs to access latest state/actions without adding them to dependencies
  }, []); // Empty deps - check once on mount, global refs prevent duplicates

  return {
    // state
    clients: state.clients,
    instruments: state.instruments,
    connections: state.connections,

    // loading state
    loading: {
      clients: state.loading.clients,
      instruments: state.loading.instruments,
      connections: state.loading.connections,
      // @deprecated Use hasAnyLoading instead
      any:
        state.loading.clients ||
        state.loading.instruments ||
        state.loading.connections,
      hasAnyLoading:
        state.loading.clients ||
        state.loading.instruments ||
        state.loading.connections,
    },

    // submitting state
    submitting: {
      clients: state.submitting.clients,
      instruments: state.submitting.instruments,
      connections: state.submitting.connections,
      // @deprecated Use hasAnySubmitting instead
      any:
        state.submitting.clients ||
        state.submitting.instruments ||
        state.submitting.connections,
      hasAnySubmitting:
        state.submitting.clients ||
        state.submitting.instruments ||
        state.submitting.connections,
    },

    // last updated time
    lastUpdated: state.lastUpdated,

    // actions
    ...actions,
  };
}

// client-specific hook (replace existing useOptimizedClients)
// Returns object with loading/submitting for consistency with Dashboard pattern
// FIXED: Removed fetch - useUnifiedData is the Single Source of Truth for fetching
// This hook only reads state and provides computed values
export function useUnifiedClients() {
  const clientsHook = useClients();

  // FIXED: No fetch here - data is fetched by useUnifiedData or manually via actions
  // This hook only reads state and provides computed values

  // Return object format consistent with Dashboard pattern (loading.any, submitting.any)
  return {
    ...clientsHook,
    loading: {
      clients: clientsHook.loading,
      // @deprecated Use hasAnyLoading instead
      any: clientsHook.loading,
      hasAnyLoading: clientsHook.loading,
    },
    submitting: {
      clients: clientsHook.submitting,
      // @deprecated Use hasAnySubmitting instead
      any: clientsHook.submitting,
      hasAnySubmitting: clientsHook.submitting,
    },
  };
}

// instrument-specific hook (replace existing useOptimizedInstruments)
// FIXED: Removed fetch - useUnifiedData is the Single Source of Truth for fetching
// This hook only reads state and provides computed values
export function useUnifiedInstruments() {
  const instrumentsHook = useInstruments();

  // FIXED: No fetch here - data is fetched by useUnifiedData or manually via actions
  // This hook only reads state and provides computed values

  return instrumentsHook;
}

// connection-specific hook (replace existing useOptimizedConnections)
// FIXED: Removed fetch - useUnifiedData is the Single Source of Truth for fetching
// This hook only reads state and provides computed values
export function useUnifiedConnections() {
  const connectionsHook = useConnections();

  // FIXED: No fetch here - data is fetched by useUnifiedData or manually via actions
  // This hook only reads state and provides computed values

  return connectionsHook;
}

// dashboard-specific hook (replace existing useDashboardItems)
// FIXED: Removed fetch - useUnifiedData is the Single Source of Truth for fetching
// This hook only calculates relationships from state
export function useUnifiedDashboard() {
  const { state, actions } = useDataContext();

  // FIXED: No fetch here - data is fetched by useUnifiedData or manually via actions
  // This hook only calculates relationships from existing state

  // Optimized: Use Map for O(1) lookups instead of O(n) find operations
  // calculate instrument-client relationships with explicit type
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

  // calculate client-instrument relationships (same as clientRelationships for now)
  const instrumentRelationships = useMemo(() => {
    return clientRelationships;
  }, [clientRelationships]);

  return {
    // basic data
    instruments: state.instruments,
    connections: state.connections,
    clients: state.clients,

    // calculated relationships
    clientRelationships,
    instrumentRelationships,

    // loading state
    loading: {
      instruments: state.loading.instruments,
      clients: state.loading.clients,
      connections: state.loading.connections,
      // @deprecated Use hasAnyLoading instead
      any:
        state.loading.instruments ||
        state.loading.clients ||
        state.loading.connections,
      hasAnyLoading:
        state.loading.instruments ||
        state.loading.clients ||
        state.loading.connections,
    },

    // submitting state
    submitting: {
      instruments: state.submitting.instruments,
      connections: state.submitting.connections,
      // @deprecated Use hasAnySubmitting instead
      any: state.submitting.instruments || state.submitting.connections,
      hasAnySubmitting: state.submitting.instruments || state.submitting.connections,
    },

    // actions - explicitly list to avoid webpack issues with spread operator
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

// Connected clients data hook (provides data + CRUD operations for connections)
// FIXED: Removed fetch - useUnifiedData is the Single Source of Truth for fetching
// This hook provides clients, instruments, connections data and CRUD operations
// Renamed from useUnifiedConnectionForm for clarity - this is not just a form hook
export function useConnectedClientsData() {
  const { state, actions } = useDataContext();
  // state is used below in return statement (state.clients, state.instruments, etc.)

  // FIXED: No fetch here - data is fetched by useUnifiedData or manually via actions
  // This hook only provides CRUD operations

  // create connection
  const createConnection = useCallback(
    async (
      clientId: string,
      instrumentId: string,
      relationshipType: RelationshipType,
      notes: string
    ) => {
      return await actions.createConnection({
        client_id: clientId,
        instrument_id: instrumentId,
        relationship_type: relationshipType,
        notes: notes || null,
      });
    },
    [actions]
  );

  // update connection
  const updateConnection = useCallback(
    async (
      connectionId: string,
      updates: { relationshipType: RelationshipType; notes: string }
    ) => {
      return await actions.updateConnection(connectionId, {
        relationship_type: updates.relationshipType,
        notes: updates.notes || null,
      });
    },
    [actions]
  );

  return {
    // data
    clients: state.clients,
    instruments: state.instruments,
    connections: state.connections,

    // loading state
    loading: {
      clients: state.loading.clients,
      instruments: state.loading.instruments,
      connections: state.loading.connections,
      // @deprecated Use hasAnyLoading instead
      any:
        state.loading.clients ||
        state.loading.instruments ||
        state.loading.connections,
      hasAnyLoading:
        state.loading.clients ||
        state.loading.instruments ||
        state.loading.connections,
    },

    // submitting state
    submitting: {
      connections: state.submitting.connections,
      // @deprecated Use hasAnySubmitting instead
      any: state.submitting.connections,
      hasAnySubmitting: state.submitting.connections,
    },

    // actions
    createConnection,
    updateConnection,
    deleteConnection: actions.deleteConnection,
    fetchConnections: actions.fetchConnections,
  };
}

// search-specific hook (replace existing useSearch)
export function useUnifiedSearch() {
  const { state } = useDataContext();

  // unified search
  const searchAll = useCallback(
    (query: string) => {
      const lowerQuery = query.toLowerCase();

      const clients = state.clients.filter(
        client =>
          (client.first_name || '').toLowerCase().includes(lowerQuery) ||
          (client.last_name || '').toLowerCase().includes(lowerQuery) ||
          (client.email || '').toLowerCase().includes(lowerQuery) ||
          (client.client_number || '').toLowerCase().includes(lowerQuery)
      );

      const instruments = state.instruments.filter(
        instrument =>
          (instrument.maker || '').toLowerCase().includes(lowerQuery) ||
          (instrument.type || '').toLowerCase().includes(lowerQuery) ||
          (instrument.serial_number || '').toLowerCase().includes(lowerQuery)
      );

      const connections = state.connections.filter(
        connection =>
          connection.notes?.toLowerCase().includes(lowerQuery) ||
          connection.relationship_type.toLowerCase().includes(lowerQuery)
      );

      return {
        clients,
        instruments,
        connections,
        total: clients.length + instruments.length + connections.length,
      };
    },
    [state.clients, state.instruments, state.connections]
  );

  return {
    searchAll,
    clients: state.clients,
    instruments: state.instruments,
    connections: state.connections,
  };
}

// cache management hook
export function useUnifiedCache() {
  const { actions } = useDataContext();

  // invalidate specific data type cache
  const invalidate = useCallback(
    (dataType: 'clients' | 'instruments' | 'connections') => {
      actions.invalidateCache(dataType);
    },
    [actions]
  );

  // invalidate all cache
  const invalidateAll = useCallback(() => {
    actions.invalidateCache('clients');
    actions.invalidateCache('instruments');
    actions.invalidateCache('connections');
  }, [actions]);

  // reset state
  const reset = useCallback(() => {
    actions.resetState();
  }, [actions]);

  return {
    invalidate,
    invalidateAll,
    reset,
  };
}
