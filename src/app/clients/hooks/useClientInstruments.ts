// src/app/clients/hooks/useClientInstruments.ts
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ClientInstrument } from '@/types';
import { logError } from '@/utils/logger';

export const useClientInstruments = () => {
  const [instrumentRelationships, setInstrumentRelationships] = useState<
    ClientInstrument[]
  >([]);
  const [clientsWithInstruments, setClientsWithInstruments] = useState<
    Set<string>
  >(new Set());
  const [loading, setLoading] = useState(false);

  const fetchClientsWithInstruments = async () => {
    try {
      const { data, error } = await supabase
        .from('client_instruments')
        .select('client_id');

      if (error) throw error;

      const clientIds = new Set(data?.map(item => item.client_id) || []);
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
  };

  const fetchAllInstrumentRelationships = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('client_instruments').select(
        `
          *,
          client:clients(*),
          instrument:instruments(*)
        `
      );

      if (error) throw error;
      const relationships = data || [];

      setInstrumentRelationships(relationships);

      // clientsWithInstruments 집합을 동기화
      const clientIds = new Set(relationships.map(rel => rel.client_id));
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

  const fetchInstrumentRelationships = async (clientId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('client_instruments')
        .select(
          `
          *,
          client:clients(*),
          instrument:instruments(*)
        `
        )
        .eq('client_id', clientId);

      if (error) throw error;
      const relationships = data || [];

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
  };

  const addInstrumentRelationship = async (
    clientId: string,
    instrumentId: string,
    relationshipType: ClientInstrument['relationship_type'] = 'Interested'
  ) => {
    try {
      const { data, error } = await supabase.from('client_instruments').insert([
        {
          client_id: clientId,
          instrument_id: instrumentId,
          relationship_type: relationshipType,
        },
      ]).select(`
          *,
          client:clients(*),
          instrument:instruments(*)
        `);

      if (error) throw error;

      if (data && data[0]) {
        setInstrumentRelationships(prev => [...prev, data[0]]);
        setClientsWithInstruments(prev => new Set([...prev, clientId]));
        return data[0];
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
  };

  const removeInstrumentRelationship = async (relationshipId: string) => {
    try {
      const rel = instrumentRelationships.find(r => r.id === relationshipId);
      const clientId = rel?.client_id;

      const { error } = await supabase
        .from('client_instruments')
        .delete()
        .eq('id', relationshipId);

      if (error) throw error;

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
  };

  const updateInstrumentRelationship = async (
    relationshipId: string,
    relationshipType: ClientInstrument['relationship_type']
  ) => {
    try {
      const { data, error } = await supabase
        .from('client_instruments')
        .update({ relationship_type: relationshipType })
        .eq('id', relationshipId).select(`
          *,
          client:clients(*),
          instrument:instruments(*)
        `);

      if (error) throw error;

      if (data && data[0]) {
        setInstrumentRelationships(prev =>
          prev.map(rel => (rel.id === relationshipId ? data[0] : rel))
        );
        return data[0];
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
  };

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
