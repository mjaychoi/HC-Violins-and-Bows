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
 * - The connections API embeds only a narrow instrument projection on each
 *   row (id, maker, type, year, price - see CONNECTION_INSTRUMENT_COLUMNS in
 *   src/app/api/connections/route.ts). That narrowing is a wire-payload
 *   minimization on the /api/connections response itself (see commit
 *   ebd6162), not a rule that status/serial_number/cost_price/note/etc.
 *   must stay hidden everywhere. `instruments` here comes from a separate,
 *   already-authorized org-wide fetch (/api/instruments, full row) for the
 *   same signed-in org member, so merging it in does not reintroduce any
 *   exposure the connections audit was guarding against.
 * - The org-wide instrument map always wins on every overlapping field
 *   (not just the fields it uniquely has). The two sources are independent
 *   fetches with no ordering guarantee, so preferring the org-wide fetch as
 *   a single coherent snapshot avoids ending up with a Frankenstein object
 *   that mixes fields from two different points in time. The embedded
 *   projection is used only as a whole-object fallback for instruments not
 *   yet present in the map.
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
      // Notes intentionally omitted: this call only changes the
      // relationship type, and updateConnection now only overwrites fields
      // it's explicitly given, so existing notes are preserved instead of
      // being wiped by an implicit empty string.
      return await updateConnection(relationshipId, {
        relationshipType: relationshipType,
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
