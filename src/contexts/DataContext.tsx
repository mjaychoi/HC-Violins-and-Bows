'use client';

// DEPRECATED: backward compatibility layer
import React, { ReactNode, useEffect, useMemo, useRef } from 'react';
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

type DeprecatedDispatchAction = {
  type: string;
  payload?: unknown;
};

let didWarnProvider = false;
let didWarnDispatch = false;

function warnOnce(kind: 'provider' | 'dispatch') {
  if (
    process.env.NODE_ENV !== 'development' &&
    process.env.NODE_ENV !== 'test'
  ) {
    return;
  }

  if (kind === 'provider') {
    if (didWarnProvider) return;
    didWarnProvider = true;
    console.warn(
      'DataProvider is deprecated. Use individual context providers instead.'
    );
    return;
  }

  if (didWarnDispatch) return;
  didWarnDispatch = true;
  console.warn(
    'DataContext.dispatch is deprecated. Use individual context actions instead.'
  );
}

export function DataProvider({ children }: { children: ReactNode }) {
  const warnedRef = useRef(false);

  useEffect(() => {
    if (warnedRef.current) return;
    warnedRef.current = true;
    warnOnce('provider');
  }, []);

  return <>{children}</>;
}

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

  const {
    fetchClients,
    createClient,
    updateClient,
    deleteClient,
    invalidateCache: invalidateClientsCache,
    resetState: resetClientsState,
  } = clientsContext.actions;

  const {
    fetchInstruments,
    createInstrument,
    updateInstrument,
    deleteInstrument,
    invalidateCache: invalidateInstrumentsCache,
    resetState: resetInstrumentsState,
  } = instrumentsContext.actions;

  const {
    fetchConnections,
    createConnection,
    updateConnection,
    deleteConnection,
    invalidateCache: invalidateConnectionsCache,
    resetState: resetConnectionsState,
  } = connectionsContext.actions;

  const actions = useMemo(
    () => ({
      fetchClients,
      createClient,
      updateClient,
      deleteClient,

      fetchInstruments,
      createInstrument,
      updateInstrument,
      deleteInstrument,

      fetchConnections,
      createConnection,
      updateConnection,
      deleteConnection,

      invalidateCache: (
        dataType: 'clients' | 'instruments' | 'connections'
      ) => {
        if (dataType === 'clients') {
          invalidateClientsCache();
        } else if (dataType === 'instruments') {
          invalidateInstrumentsCache();
        } else {
          invalidateConnectionsCache();
        }
      },

      resetState: () => {
        resetClientsState();
        resetInstrumentsState();
        resetConnectionsState();
      },
    }),
    [
      fetchClients,
      createClient,
      updateClient,
      deleteClient,
      invalidateClientsCache,
      resetClientsState,

      fetchInstruments,
      createInstrument,
      updateInstrument,
      deleteInstrument,
      invalidateInstrumentsCache,
      resetInstrumentsState,

      fetchConnections,
      createConnection,
      updateConnection,
      deleteConnection,
      invalidateConnectionsCache,
      resetConnectionsState,
    ]
  );

  const dispatch = useMemo<React.Dispatch<DeprecatedDispatchAction>>(
    () => action => {
      warnOnce('dispatch');

      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[DEPRECATED] Ignored DataContext.dispatch action:',
          action
        );
      }
    },
    []
  );

  return useMemo(
    () => ({
      state,
      dispatch,
      actions,
    }),
    [state, dispatch, actions]
  );
}

export function useClients() {
  return useClientsFromContext();
}

export function useInstruments() {
  return useInstrumentsFromContext();
}

export function useConnections() {
  return useConnectionsFromContext();
}

export function useAllData() {
  const clients = useClients();
  const instruments = useInstruments();
  const connections = useConnections();

  const {
    fetchClients,
    createClient,
    updateClient,
    deleteClient,
    invalidateCache: invalidateClientsCache,
    resetState: resetClientsState,
  } = clients;

  const {
    fetchInstruments,
    createInstrument,
    updateInstrument,
    deleteInstrument,
    invalidateCache: invalidateInstrumentsCache,
    resetState: resetInstrumentsState,
  } = instruments;

  const {
    fetchConnections,
    createConnection,
    updateConnection,
    deleteConnection,
    invalidateCache: invalidateConnectionsCache,
    resetState: resetConnectionsState,
  } = connections;

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

      fetchClients,
      createClient,
      updateClient,
      deleteClient,

      fetchInstruments,
      createInstrument,
      updateInstrument,
      deleteInstrument,

      fetchConnections,
      createConnection,
      updateConnection,
      deleteConnection,

      invalidateCache: (
        dataType: 'clients' | 'instruments' | 'connections'
      ) => {
        if (dataType === 'clients') {
          invalidateClientsCache();
        } else if (dataType === 'instruments') {
          invalidateInstrumentsCache();
        } else {
          invalidateConnectionsCache();
        }
      },

      resetState: () => {
        resetClientsState();
        resetInstrumentsState();
        resetConnectionsState();
      },
    }),
    [
      clients.clients,
      clients.loading,
      clients.submitting,
      clients.lastUpdated,

      instruments.instruments,
      instruments.loading,
      instruments.submitting,
      instruments.lastUpdated,

      connections.connections,
      connections.loading,
      connections.submitting,
      connections.lastUpdated,

      fetchClients,
      createClient,
      updateClient,
      deleteClient,
      invalidateClientsCache,
      resetClientsState,

      fetchInstruments,
      createInstrument,
      updateInstrument,
      deleteInstrument,
      invalidateInstrumentsCache,
      resetInstrumentsState,

      fetchConnections,
      createConnection,
      updateConnection,
      deleteConnection,
      invalidateConnectionsCache,
      resetConnectionsState,
    ]
  );
}
