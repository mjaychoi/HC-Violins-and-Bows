// unified data management hook - replace existing hooks
import { useCallback, useEffect } from 'react';
import {
  useDataContext,
  useClients,
  useInstruments,
  useConnections,
} from '@/contexts/DataContext';
import { RelationshipType } from '@/types';

// unified data hook - manage all data in one place
export function useUnifiedData() {
  const { state, actions } = useDataContext();

  // initial data loading
  useEffect(() => {
    const loadAllData = async () => {
      await Promise.all([
        actions.fetchClients(),
        actions.fetchInstruments(),
        actions.fetchConnections(),
      ]);
    };

    loadAllData();
  }, [actions]);

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
      any:
        state.loading.clients ||
        state.loading.instruments ||
        state.loading.connections,
    },

    // submitting state
    submitting: {
      clients: state.submitting.clients,
      instruments: state.submitting.instruments,
      connections: state.submitting.connections,
      any:
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
export function useUnifiedClients() {
  const clientsHook = useClients();

  // initial data loading
  useEffect(() => {
    if (clientsHook.clients.length === 0 && !clientsHook.loading) {
      clientsHook.fetchClients();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientsHook.clients.length, clientsHook.loading]);

  return clientsHook;
}

// instrument-specific hook (replace existing useOptimizedInstruments)
export function useUnifiedInstruments() {
  const instrumentsHook = useInstruments();

  // initial data loading
  useEffect(() => {
    if (instrumentsHook.instruments.length === 0 && !instrumentsHook.loading) {
      instrumentsHook.fetchInstruments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrumentsHook.instruments.length, instrumentsHook.loading]);

  return instrumentsHook;
}

// connection-specific hook (replace existing useOptimizedConnections)
export function useUnifiedConnections() {
  const connectionsHook = useConnections();

  // initial data loading
  useEffect(() => {
    if (connectionsHook.connections.length === 0 && !connectionsHook.loading) {
      connectionsHook.fetchConnections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionsHook.connections.length, connectionsHook.loading]);

  return connectionsHook;
}

// dashboard-specific hook (replace existing useDashboardItems)
export function useUnifiedDashboard() {
  const { state, actions } = useDataContext();

  // initial data loading
  useEffect(() => {
    const loadDashboardData = async () => {
      await Promise.all([
        actions.fetchInstruments(),
        actions.fetchConnections(),
      ]);
    };

    if (state.instruments.length === 0 && state.connections.length === 0) {
      loadDashboardData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.instruments.length, state.connections.length]);

  // calculate instrument-client relationships
  const getClientRelationships = useCallback(() => {
    return state.connections
      .map(connection => ({
        ...connection,
        client: state.clients.find(c => c.id === connection.client_id),
        instrument: state.instruments.find(
          i => i.id === connection.instrument_id
        ),
      }))
      .filter(rel => rel.client && rel.instrument);
  }, [state.connections, state.clients, state.instruments]);

  // calculate client-instrument relationships
  const getInstrumentRelationships = useCallback(() => {
    return state.connections
      .map(connection => ({
        ...connection,
        client: state.clients.find(c => c.id === connection.client_id),
        instrument: state.instruments.find(
          i => i.id === connection.instrument_id
        ),
      }))
      .filter(rel => rel.client && rel.instrument);
  }, [state.connections, state.clients, state.instruments]);

  return {
    // basic data
    instruments: state.instruments,
    connections: state.connections,
    clients: state.clients,

    // calculated relationships
    clientRelationships: getClientRelationships(),
    instrumentRelationships: getInstrumentRelationships(),

    // loading state
    loading: {
      instruments: state.loading.instruments,
      connections: state.loading.connections,
      any: state.loading.instruments || state.loading.connections,
    },

    // submitting state
    submitting: {
      instruments: state.submitting.instruments,
      connections: state.submitting.connections,
      any: state.submitting.instruments || state.submitting.connections,
    },

    // actions
    ...actions,
  };
}

// form-specific hook (replace existing useConnectionForm)
export function useUnifiedConnectionForm() {
  const { state, actions } = useDataContext();

  // initial data loading
  useEffect(() => {
    const loadFormData = async () => {
      await Promise.all([
        actions.fetchClients(),
        actions.fetchInstruments(),
        actions.fetchConnections(),
      ]);
    };

    if (state.clients.length === 0 || state.instruments.length === 0) {
      loadFormData();
    }
  }, [actions, state.clients.length, state.instruments.length]);

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
      any:
        state.loading.clients ||
        state.loading.instruments ||
        state.loading.connections,
    },

    // submitting state
    submitting: {
      connections: state.submitting.connections,
      any: state.submitting.connections,
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
          (client.email || '').toLowerCase().includes(lowerQuery)
      );

      const instruments = state.instruments.filter(
        instrument =>
          (instrument.maker || '').toLowerCase().includes(lowerQuery) ||
          (instrument.type || '').toLowerCase().includes(lowerQuery)
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
