// src/app/clients/hooks/useClientInstruments.ts
import { useCallback, useMemo } from 'react';
import { ClientInstrument } from '@/types';
import {
  useUnifiedConnections,
  useConnectedClientsData,
  useUnifiedInstruments,
} from '@/hooks/useUnifiedData';

/**
 * Hook for managing client-instrument relationships.
 *
 * Uses DataContext as the single source of truth:
 * - Connections are fetched and managed by DataContext
 * - Enriches flat connection rows with InstrumentsContext map (no N+1)
 * - The connections API embeds a narrow instrument projection on each row
 *   (id, maker, type, year, price - see CONNECTION_INSTRUMENT_COLUMNS in
 *   src/app/api/connections/route.ts), not the full Instrument shape, so the
 *   org-wide instrument map (source of status/serial_number/etc.) always
 *   wins on overlapping fields; the embedded projection is only a fallback
 *   for instruments not yet present in the map.
 *
 * @returns Client-instrument relationship data and operations
 */
export const useClientInstruments = () => {
  const { connections: rawConnections } = useUnifiedConnections();
  const { instruments } = useUnifiedInstruments();

  const { createConnection, updateConnection, deleteConnection } =
    useConnectedClientsData();

  const instrumentMap = useMemo(
    () => new Map(instruments.map(inst => [inst.id, inst])),
    [instruments]
  );

  const instrumentRelationships = useMemo((): ClientInstrument[] => {
    return rawConnections.map(rel => {
      const fromMap = instrumentMap.get(rel.instrument_id);
      if (fromMap) {
        return { ...rel, instrument: { ...rel.instrument, ...fromMap } };
      }
      if (rel.instrument) return rel;

      return {
        ...rel,
        instrument: null,
      };
    });
  }, [rawConnections, instrumentMap]);

  const clientsWithInstruments = useMemo(() => {
    return new Set(
      instrumentRelationships.map(rel => rel.client_id).filter(Boolean)
    );
  }, [instrumentRelationships]);

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

  const removeInstrumentRelationship = useCallback(
    async (relationshipId: string) => {
      return await deleteConnection(relationshipId);
    },
    [deleteConnection]
  );

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

  const getClientInstruments = useCallback(
    (clientId: string): ClientInstrument[] => {
      return instrumentRelationships.filter(rel => rel.client_id === clientId);
    },
    [instrumentRelationships]
  );

  const hasInstrumentRelationship = useCallback(
    (clientId: string, instrumentId: string): boolean => {
      return instrumentRelationships.some(
        rel => rel.client_id === clientId && rel.instrument_id === instrumentId
      );
    },
    [instrumentRelationships]
  );

  return {
    instrumentRelationships,
    clientsWithInstruments,
    addInstrumentRelationship,
    removeInstrumentRelationship,
    updateInstrumentRelationship,
    getClientInstruments,
    hasInstrumentRelationship,
  };
};
