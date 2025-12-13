// src/app/clients/hooks/useClientInstruments.ts
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ClientInstrument } from '@/types';
import { logError } from '@/utils/logger';
import { useUnifiedConnections } from '@/hooks/useUnifiedData';

export const useClientInstruments = () => {
  // FIXED: Use connections from DataContext instead of separate state
  // This prevents duplicate API calls - connections are already fetched by useUnifiedData
  const { connections: connectionsFromContext } = useUnifiedConnections();
  
  const [instrumentRelationships, setInstrumentRelationships] = useState<
    ClientInstrument[]
  >([]);
  const [clientsWithInstruments, setClientsWithInstruments] = useState<
    Set<string>
  >(new Set());
  const [loading, setLoading] = useState(false);

  // Optimized: Create Map for O(1) lookups instead of O(n) find operations
  const relationshipsMap = useMemo(
    () => new Map(instrumentRelationships.map(rel => [rel.id, rel])),
    [instrumentRelationships]
  );

  // FIXED: Sync with DataContext connections to avoid duplicate state
  // This ensures we use data from DataContext instead of fetching separately
  // Use a ref to track if we've already synced to prevent infinite loops
  const hasSyncedRef = useRef(false);
  const lastConnectionsLengthRef = useRef(0);
  const lastConnectionsIdsRef = useRef<string>('');
  
  useEffect(() => {
    // Create a stable ID string from connections to detect actual changes
    const connectionsIds = JSON.stringify(
      connectionsFromContext.map(c => c.id).sort()
    );
    const connectionsLength = connectionsFromContext.length;
    
    // Only sync if:
    // 1. We haven't synced yet, OR
    // 2. The connections have actually changed (different IDs or length)
    const hasChanged =
      !hasSyncedRef.current ||
      lastConnectionsLengthRef.current !== connectionsLength ||
      lastConnectionsIdsRef.current !== connectionsIds;
    
    if (hasChanged && connectionsLength > 0) {
      setInstrumentRelationships(connectionsFromContext);
      
      // Sync clientsWithInstruments set
      const clientIds = new Set<string>(
        connectionsFromContext.map(rel => rel.client_id).filter(Boolean)
      );
      setClientsWithInstruments(clientIds);
      
      // Update refs
      hasSyncedRef.current = true;
      lastConnectionsLengthRef.current = connectionsLength;
      lastConnectionsIdsRef.current = connectionsIds;
    }
  }, [connectionsFromContext]);

  const fetchClientsWithInstruments = useCallback(async () => {
    try {
      const response = await fetch('/api/connections');
      if (!response.ok) {
        const errorData = await response.json();
        throw errorData.error || new Error('Failed to fetch connections');
      }
      const result = await response.json();
      const clientIds = new Set<string>(
        (result.data || []).map((item: ClientInstrument) => item.client_id).filter(Boolean)
      );
      setClientsWithInstruments(clientIds);
    } catch (error) {
      logError(
        'Error fetching clients with instruments',
        error,
        'useClientInstruments',
        {
          operation: 'fetchClientsWithInstruments',
        }
      );
    }
  }, []);

  const fetchAllInstrumentRelationships = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/connections');
      if (!response.ok) {
        const errorData = await response.json();
        throw errorData.error || new Error('Failed to fetch connections');
      }
      const result = await response.json();
      const relationships = result.data || [];

      setInstrumentRelationships(relationships);

      // clientsWithInstruments 집합을 동기화
      const clientIds = new Set<string>(
        relationships.map((rel: ClientInstrument) => rel.client_id).filter(Boolean)
      );
      setClientsWithInstruments(clientIds);
    } catch (error) {
      logError(
        'Error fetching all instrument relationships',
        error,
        'useClientInstruments',
        {
          operation: 'fetchAllInstrumentRelationships',
        }
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInstrumentRelationships = useCallback(async (clientId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/connections?client_id=${clientId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw errorData.error || new Error('Failed to fetch connections');
      }
      const result = await response.json();
      const relationships = result.data || [];

      // 기존 관계들을 유지하면서 특정 클라이언트의 관계만 업데이트
      setInstrumentRelationships(prev => {
        // 다른 클라이언트의 관계들은 유지
        const otherRelationships = prev.filter(
          rel => rel.client_id !== clientId
        );
        // 새로 가져온 관계들과 합치기
        return [...otherRelationships, ...relationships];
      });

      // clientsWithInstruments 집합을 동기화
      if (relationships.length > 0) {
        setClientsWithInstruments(prev => new Set([...prev, clientId]));
      } else {
        setClientsWithInstruments(prev => {
          const next = new Set(prev);
          next.delete(clientId);
          return next;
        });
      }
    } catch (error) {
      logError(
        'Error fetching instrument relationships',
        error,
        'useClientInstruments',
        {
          operation: 'fetchInstrumentRelationships',
          clientId,
        }
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const addInstrumentRelationship = useCallback(async (
    clientId: string,
    instrumentId: string,
    relationshipType: ClientInstrument['relationship_type'] = 'Interested'
  ) => {
    try {
      const response = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          instrument_id: instrumentId,
          relationship_type: relationshipType,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw errorData.error || new Error('Failed to create connection');
      }
      const result = await response.json();
      if (result.data) {
        setInstrumentRelationships(prev => [...prev, result.data]);
        setClientsWithInstruments(prev => new Set([...prev, clientId]));
        return result.data;
      }
      return null;
    } catch (error) {
      logError(
        'Error adding instrument relationship',
        error,
        'useClientInstruments',
        {
          operation: 'addInstrumentRelationship',
          clientId,
          instrumentId,
        }
      );
      return null;
    }
  }, []);

  const removeInstrumentRelationship = useCallback(async (relationshipId: string) => {
    try {
      // O(1) lookup instead of O(n) find
      const rel = relationshipsMap.get(relationshipId);
      const clientId = rel?.client_id;

      const response = await fetch(`/api/connections?id=${relationshipId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw errorData.error || new Error('Failed to delete connection');
      }

      setInstrumentRelationships(prev => {
        const next = prev.filter(rel => rel.id !== relationshipId);
        if (clientId) {
          const stillHas = next.some(r => r.client_id === clientId);
          if (!stillHas) {
            setClientsWithInstruments(prevSet => {
              const nextSet = new Set(prevSet);
              nextSet.delete(clientId);
              return nextSet;
            });
          }
        }
        return next;
      });

      return true;
    } catch (error) {
      logError(
        'Error removing instrument relationship',
        error,
        'useClientInstruments',
        {
          operation: 'removeInstrumentRelationship',
          relationshipId,
        }
      );
      return false;
    }
  }, [relationshipsMap]);

  const updateInstrumentRelationship = useCallback(async (
    relationshipId: string,
    relationshipType: ClientInstrument['relationship_type']
  ) => {
    try {
      const response = await fetch('/api/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: relationshipId,
          relationship_type: relationshipType,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw errorData.error || new Error('Failed to update connection');
      }
      const result = await response.json();
      if (result.data) {
        setInstrumentRelationships(prev =>
          prev.map(rel => (rel.id === relationshipId ? result.data : rel))
        );
        return result.data;
      }
      return null;
    } catch (error) {
      logError(
        'Error updating instrument relationship',
        error,
        'useClientInstruments',
        {
          operation: 'updateInstrumentRelationship',
          relationshipId,
          relationshipType,
        }
      );
      return null;
    }
  }, []);

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
    loading,
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
