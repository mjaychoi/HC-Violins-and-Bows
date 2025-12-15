'use client';

// unified data management hook - replace existing hooks
import { useCallback, useEffect, useMemo, useRef } from 'react';
// Note: useRef is only used in useUnifiedData (Single Source of Truth for fetching)
import { useClientsContext } from '@/contexts/ClientsContext';
import { useInstrumentsContext } from '@/contexts/InstrumentsContext';
import { useConnectionsContext } from '@/contexts/ConnectionsContext';
import {
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

  // Use individual contexts for better performance
  const clientsContext = useClientsContext();
  const instrumentsContext = useInstrumentsContext();
  const connectionsContext = useConnectionsContext();

  // Combine states for unified interface
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

  // Combine actions for unified interface
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
        if (dataType === 'clients') {
          clientsContext.actions.invalidateCache();
        } else if (dataType === 'instruments') {
          instrumentsContext.actions.invalidateCache();
        } else {
          connectionsContext.actions.invalidateCache();
        }
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
        if (dataType === 'clients') {
          clientsContext.actions.invalidateCache();
        } else if (dataType === 'instruments') {
          instrumentsContext.actions.invalidateCache();
        } else {
          connectionsContext.actions.invalidateCache();
        }
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
      hasAnySubmitting:
        state.submitting.instruments || state.submitting.connections,
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
      return await connectionsContext.actions.createConnection({
        client_id: clientId,
        instrument_id: instrumentId,
        relationship_type: relationshipType,
        notes: notes || null,
      });
    },
    [connectionsContext.actions]
  );

  // update connection
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
    deleteConnection: connectionsContext.actions.deleteConnection,
    fetchConnections: connectionsContext.actions.fetchConnections,
  };
}

// search-specific hook (replace existing useSearch)
export function useUnifiedSearch() {
  const clientsContext = useClientsContext();
  const instrumentsContext = useInstrumentsContext();
  const connectionsContext = useConnectionsContext();

  const clients = clientsContext.state.clients;
  const instruments = instrumentsContext.state.instruments;
  const connections = connectionsContext.state.connections;

  // unified search
  const searchAll = useCallback(
    (query: string) => {
      const lowerQuery = query.toLowerCase();

      const filteredClients = clients.filter(
        (client: Client) =>
          (client.first_name || '').toLowerCase().includes(lowerQuery) ||
          (client.last_name || '').toLowerCase().includes(lowerQuery) ||
          (client.email || '').toLowerCase().includes(lowerQuery) ||
          (client.client_number || '').toLowerCase().includes(lowerQuery)
      );

      const filteredInstruments = instruments.filter(
        (instrument: Instrument) =>
          (instrument.maker || '').toLowerCase().includes(lowerQuery) ||
          (instrument.type || '').toLowerCase().includes(lowerQuery) ||
          (instrument.serial_number || '').toLowerCase().includes(lowerQuery)
      );

      const filteredConnections = connections.filter(
        (connection: ClientInstrument) =>
          connection.notes?.toLowerCase().includes(lowerQuery) ||
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
    [clients, instruments, connections]
  );

  return {
    searchAll,
    clients,
    instruments,
    connections,
  };
}

// cache management hook
export function useUnifiedCache() {
  const clientsContext = useClientsContext();
  const instrumentsContext = useInstrumentsContext();
  const connectionsContext = useConnectionsContext();

  // invalidate specific data type cache
  const invalidate = useCallback(
    (dataType: 'clients' | 'instruments' | 'connections') => {
      if (dataType === 'clients') {
        clientsContext.actions.invalidateCache();
      } else if (dataType === 'instruments') {
        instrumentsContext.actions.invalidateCache();
      } else {
        connectionsContext.actions.invalidateCache();
      }
    },
    [
      clientsContext.actions,
      instrumentsContext.actions,
      connectionsContext.actions,
    ]
  );

  // invalidate all cache
  const invalidateAll = useCallback(() => {
    clientsContext.actions.invalidateCache();
    instrumentsContext.actions.invalidateCache();
    connectionsContext.actions.invalidateCache();
  }, [
    clientsContext.actions,
    instrumentsContext.actions,
    connectionsContext.actions,
  ]);

  // reset state
  const reset = useCallback(() => {
    clientsContext.actions.resetState();
    instrumentsContext.actions.resetState();
    connectionsContext.actions.resetState();
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
