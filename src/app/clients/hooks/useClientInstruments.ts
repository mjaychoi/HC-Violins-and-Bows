// src/app/clients/hooks/useClientInstruments.ts
import { useCallback, useMemo } from 'react';
import { ClientInstrument } from '@/types';
import {
  useUnifiedConnections,
  useConnectedClientsData,
} from '@/hooks/useUnifiedData';

/**
 * ✅ FIXED: DataContext as single source of truth
 * - Removed local state duplication
 * - Use connections directly from DataContext
 * - Use DataContext mutations for add/remove/update
 * - No more sync logic or change detection needed
 */
export const useClientInstruments = () => {
  // ✅ Use DataContext connections directly (single source of truth)
  const { connections: instrumentRelationships } = useUnifiedConnections();

  // ✅ Use DataContext actions for mutations
  const { createConnection, updateConnection, deleteConnection } =
    useConnectedClientsData();

  // ✅ Derived state: clientsWithInstruments from connections (no separate state needed)
  const clientsWithInstruments = useMemo(() => {
    return new Set(
      instrumentRelationships.map(rel => rel.client_id).filter(Boolean)
    );
  }, [instrumentRelationships]);

  // ✅ Removed fetch functions - DataContext handles all fetching
  // If you need to refresh, use DataContext actions.fetchConnections()

  // ✅ For backward compatibility, provide no-op functions
  const fetchClientsWithInstruments = useCallback(async () => {
    // No-op: clientsWithInstruments is derived from DataContext
    // If refresh needed, call DataContext actions.fetchConnections()
  }, []);

  const fetchAllInstrumentRelationships = useCallback(async () => {
    // No-op: instrumentRelationships comes from DataContext
    // If refresh needed, call DataContext actions.fetchConnections()
  }, []);

  const fetchInstrumentRelationships = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_clientId: string) => {
      // No-op: instrumentRelationships comes from DataContext
      // If refresh needed, call DataContext actions.fetchConnections()
      // Note: For specific client filtering, filter instrumentRelationships in component
    },
    []
  );

  // ✅ Use DataContext mutation (updates context, which updates instrumentRelationships)
  const addInstrumentRelationship = useCallback(
    async (
      clientId: string,
      instrumentId: string,
      relationshipType: ClientInstrument['relationship_type'] = 'Interested'
    ) => {
      return await createConnection(
        clientId,
        instrumentId,
        relationshipType,
        ''
      );
    },
    [createConnection]
  );

  // ✅ Use DataContext mutation (updates context automatically)
  const removeInstrumentRelationship = useCallback(
    async (relationshipId: string) => {
      return await deleteConnection(relationshipId);
    },
    [deleteConnection]
  );

  // ✅ Use DataContext mutation (updates context automatically)
  const updateInstrumentRelationship = useCallback(
    async (
      relationshipId: string,
      relationshipType: ClientInstrument['relationship_type']
    ) => {
      return await updateConnection(relationshipId, {
        relationshipType: relationshipType,
        notes: '',
      });
    },
    [updateConnection]
  );

  const getClientInstruments = (clientId: string): ClientInstrument[] => {
    return instrumentRelationships.filter(rel => rel.client_id === clientId);
  };

  const hasInstrumentRelationship = (
    clientId: string,
    instrumentId: string
  ): boolean => {
    return instrumentRelationships.some(
      rel => rel.client_id === clientId && rel.instrument_id === instrumentId
    );
  };

  return {
    instrumentRelationships,
    clientsWithInstruments,
    loading: false, // ✅ Loading is handled by DataContext
    fetchClientsWithInstruments,
    fetchAllInstrumentRelationships,
    fetchInstrumentRelationships,
    addInstrumentRelationship,
    removeInstrumentRelationship,
    updateInstrumentRelationship,
    getClientInstruments,
    hasInstrumentRelationship,
  };
};
