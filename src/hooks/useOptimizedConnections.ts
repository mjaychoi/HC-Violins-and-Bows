// src/hooks/useOptimizedConnections.ts
import { useState, useEffect, useCallback } from 'react';
import { Client, Instrument, ClientInstrument } from '@/types';
import { useAsyncOperation } from './useAsyncOperation';
import { useLoadingState } from './useLoadingState';
import { SupabaseHelpers } from '@/utils/supabaseHelpers';

export function useOptimizedConnections() {
  const [clients, setClients] = useState<Client[]>([]);
  const [items, setItems] = useState<Instrument[]>([]);
  const [connections, setConnections] = useState<ClientInstrument[]>([]);
  const { loading, submitting, withLoading } = useLoadingState();
  const { run } = useAsyncOperation();

  const fetchData = useCallback(async () => {
    const [clientsResult, itemsResult, connectionsResult] = await Promise.all([
      run(
        () =>
          SupabaseHelpers.fetchAll<Client>('clients').then(
            res => res.data || []
          ),
        { context: 'Fetch clients' }
      ),
      run(
        () =>
          SupabaseHelpers.fetchAll<Instrument>('instruments').then(
            res => res.data || []
          ),
        { context: 'Fetch items' }
      ),
      run(
        () =>
          SupabaseHelpers.fetchAll<ClientInstrument>('client_instruments', {
            select: '*, client:clients(*), instrument:instruments(*)',
          }).then(res => res.data || []),
        { context: 'Fetch connections' }
      ),
    ]);

    if (clientsResult) setClients(clientsResult as Client[]);
    if (itemsResult) setItems(itemsResult as Instrument[]);
    if (connectionsResult)
      setConnections(connectionsResult as ClientInstrument[]);
  }, [run]);

  const createConnection = async (
    clientId: string,
    itemId: string,
    relationshipType: ClientInstrument['relationship_type'],
    notes?: string
  ) => {
    return await withLoading(async () => {
      const { data, error } = await SupabaseHelpers.create<ClientInstrument>(
        'client_instruments',
        {
          client_id: clientId,
          instrument_id: itemId,
          relationship_type: relationshipType,
          notes,
        }
      );
      if (error) throw error;
      if (data) {
        setConnections(prev => [...prev, data]);
      }
      return data;
    });
  };

  const updateConnection = async (
    connectionId: string,
    updates: {
      relationshipType: ClientInstrument['relationship_type'];
      notes?: string;
    }
  ) => {
    return await withLoading(async () => {
      const { data, error } = await SupabaseHelpers.update<ClientInstrument>(
        'client_instruments',
        connectionId,
        {
          relationship_type: updates.relationshipType,
          notes: updates.notes,
        }
      );
      if (error) throw error;
      if (data) {
        setConnections(prev =>
          prev.map(conn =>
            conn.id === connectionId ? { ...conn, ...data } : conn
          )
        );
      }
      return data;
    });
  };

  const deleteConnection = async (connectionId: string) => {
    return await withLoading(async () => {
      const { error } = await SupabaseHelpers.delete(
        'client_instruments',
        connectionId
      );
      if (error) throw error;
      setConnections(prev => prev.filter(conn => conn.id !== connectionId));
      return true;
    });
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    clients,
    items,
    connections,
    loading,
    submitting,
    fetchData,
    createConnection,
    updateConnection,
    deleteConnection,
  };
}
