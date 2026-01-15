'use client';

// DEPRECATED: backward compatibility layer
import React, { ReactNode, useEffect, useMemo } from 'react';
import {
  useClientsContext,
  useClients as useClientsFromContext,
} from './ClientsContext';
import {
  useInstrumentsContext,
  useInstruments as useInstrumentsFromContext,
} from './InstrumentsContext';
import {
  useConnectionsContext,
  useConnections as useConnectionsFromContext,
} from './ConnectionsContext';

let didWarnProvider = false;
let didWarnDispatch = false;

function warnOnce(kind: 'provider' | 'dispatch') {
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test')
    return;
  if (kind === 'provider') {
    if (didWarnProvider) return;
    didWarnProvider = true;
    console.warn(
      'DataProvider is deprecated. Use individual context providers instead.'
    );
  } else {
    if (didWarnDispatch) return;
    didWarnDispatch = true;
    console.warn(
      'DataContext.dispatch is deprecated. Use individual context actions instead.'
    );
  }
}

// DEPRECATED: DataProvider is no longer used
export function DataProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    warnOnce('provider');
  }, []);

  return <>{children}</>;
}

// Backward-compat unified interface
export function useDataContext() {
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
      lastUpdated: {
        clients: clientsContext.state.lastUpdated,
        instruments: instrumentsContext.state.lastUpdated,
        connections: connectionsContext.state.lastUpdated,
      },
    }),
    [
      clientsContext.state.clients,
      clientsContext.state.loading,
      clientsContext.state.submitting,
      clientsContext.state.lastUpdated,
      instrumentsContext.state.instruments,
      instrumentsContext.state.loading,
      instrumentsContext.state.submitting,
      instrumentsContext.state.lastUpdated,
      connectionsContext.state.connections,
      connectionsContext.state.loading,
      connectionsContext.state.submitting,
      connectionsContext.state.lastUpdated,
    ]
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

  // Keep dispatch for backward compatibility, but do not crash the app
  const dispatch = useMemo(
    () => () => {
      warnOnce('dispatch');
      // no-op
    },
    []
  );

  return useMemo(
    () => ({ state, dispatch, actions }),
    [state, dispatch, actions]
  );
}

// Delegate specialized hooks (deprecated file, but safe)
export function useClients() {
  return useClientsFromContext();
}
export function useInstruments() {
  return useInstrumentsFromContext();
}
export function useConnections() {
  return useConnectionsFromContext();
}

// Legacy "all data" hook
export function useAllData() {
  const clients = useClients();
  const instruments = useInstruments();
  const connections = useConnections();

  return useMemo(
    () => ({
      clients: clients.clients,
      instruments: instruments.instruments,
      connections: connections.connections,
      loading: {
        clients: clients.loading,
        instruments: instruments.loading,
        connections: connections.loading,
      },
      submitting: {
        clients: clients.submitting,
        instruments: instruments.submitting,
        connections: connections.submitting,
      },
      lastUpdated: {
        clients: clients.lastUpdated,
        instruments: instruments.lastUpdated,
        connections: connections.lastUpdated,
      },

      fetchClients: clients.fetchClients,
      createClient: clients.createClient,
      updateClient: clients.updateClient,
      deleteClient: clients.deleteClient,

      fetchInstruments: instruments.fetchInstruments,
      createInstrument: instruments.createInstrument,
      updateInstrument: instruments.updateInstrument,
      deleteInstrument: instruments.deleteInstrument,

      fetchConnections: connections.fetchConnections,
      createConnection: connections.createConnection,
      updateConnection: connections.updateConnection,
      deleteConnection: connections.deleteConnection,

      invalidateCache: (
        dataType: 'clients' | 'instruments' | 'connections'
      ) => {
        if (dataType === 'clients') clients.invalidateCache();
        else if (dataType === 'instruments') instruments.invalidateCache();
        else connections.invalidateCache();
      },

      resetState: () => {
        clients.resetState();
        instruments.resetState();
        connections.resetState();
      },
    }),
    [clients, instruments, connections]
  );
}
