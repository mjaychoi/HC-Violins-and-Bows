// src/app/clients/hooks/useClientInstruments.ts
import { useCallback, useMemo } from 'react';
import { ClientInstrument } from '@/types';
import {
  useUnifiedConnections,
  useConnectedClientsData,
} from '@/hooks/useUnifiedData';

/**
 * Hook for managing client-instrument relationships.
 *
 * Uses DataContext as the single source of truth:
 * - Connections are fetched and managed by DataContext
 * - No local state duplication
 * - Mutations update DataContext automatically
 *
 * @returns Client-instrument relationship data and operations
 */
export const useClientInstruments = () => {
  // Use DataContext connections directly (single source of truth)
  const { connections: instrumentRelationships } = useUnifiedConnections();

  // Use DataContext actions for mutations
  const { createConnection, updateConnection, deleteConnection } =
    useConnectedClientsData();

  // Derived state: clientsWithInstruments from connections
  const clientsWithInstruments = useMemo(() => {
    return new Set(
      instrumentRelationships.map(rel => rel.client_id).filter(Boolean)
    );
  }, [instrumentRelationships]);

  // Add instrument relationship (creates connection via DataContext)
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

  // Remove instrument relationship (deletes connection via DataContext)
  const removeInstrumentRelationship = useCallback(
    async (relationshipId: string) => {
      return await deleteConnection(relationshipId);
    },
    [deleteConnection]
  );

  // Update instrument relationship (updates connection via DataContext)
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

  // Get all instruments for a specific client
  const getClientInstruments = useCallback(
    (clientId: string): ClientInstrument[] => {
      return instrumentRelationships.filter(rel => rel.client_id === clientId);
    },
    [instrumentRelationships]
  );

  // Check if a relationship exists between client and instrument
  const hasInstrumentRelationship = useCallback(
    (clientId: string, instrumentId: string): boolean => {
      return instrumentRelationships.some(
        rel => rel.client_id === clientId && rel.instrument_id === instrumentId
      );
    },
    [instrumentRelationships]
  );

  return {
    // Data
    instrumentRelationships,
    clientsWithInstruments,

    // Operations
    addInstrumentRelationship,
    removeInstrumentRelationship,
    updateInstrumentRelationship,

    // Utilities
    getClientInstruments,
    hasInstrumentRelationship,
  };
};
