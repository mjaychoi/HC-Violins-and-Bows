'use client';

// DEPRECATED: This file is kept for backward compatibility
// New code should use ClientsContext, InstrumentsContext, ConnectionsContext directly
// This file provides a unified interface that delegates to the individual contexts

import React, { ReactNode } from 'react';
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

// DEPRECATED: DataProvider is no longer used
// Use ClientsProvider, InstrumentsProvider, ConnectionsProvider in RootProviders instead
export function DataProvider({ children }: { children: ReactNode }) {
  console.warn(
    'DataProvider is deprecated. Use individual context providers instead.'
  );
  return <>{children}</>;
}

// Hook for using the context (deprecated - use individual contexts instead)
// This is kept for backward compatibility but delegates to individual contexts
export function useDataContext() {
  // Import individual contexts
  const clientsContext = useClientsContext();
  const instrumentsContext = useInstrumentsContext();
  const connectionsContext = useConnectionsContext();

  // Combine states and actions for backward compatibility
  return {
    state: {
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
    },
    dispatch: () => {
      throw new Error(
        'dispatch is deprecated. Use individual context actions instead.'
      );
    },
    actions: {
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
    },
  };
}

// 특화된 훅들 - delegate to individual contexts
export function useClients() {
  return useClientsFromContext();
}

export function useInstruments() {
  return useInstrumentsFromContext();
}

export function useConnections() {
  return useConnectionsFromContext();
}

// 모든 데이터를 한 번에 가져오는 훅
export function useAllData() {
  const clients = useClients();
  const instruments = useInstruments();
  const connections = useConnections();

  return {
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
    // Combine all actions
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
    invalidateCache: (dataType: 'clients' | 'instruments' | 'connections') => {
      if (dataType === 'clients') {
        clients.invalidateCache();
      } else if (dataType === 'instruments') {
        instruments.invalidateCache();
      } else {
        connections.invalidateCache();
      }
    },
    resetState: () => {
      clients.resetState();
      instruments.resetState();
      connections.resetState();
    },
  };
}
