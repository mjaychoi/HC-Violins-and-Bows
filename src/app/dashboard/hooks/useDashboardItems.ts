import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Instrument, InstrumentImage, ClientInstrument } from '@/types';
import { useDataState } from '@/hooks/useDataState';
import { logError } from '@/utils/logger';

export function useDashboardItems() {
  const [items, setItems] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Item images state
  const {
    data: itemImages,
    setItems: setItemImages,
    addItem: addItemImage,
    removeItem: removeItemImage,
  } = useDataState<InstrumentImage>(item => item.id, []);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imagesToDelete, setImagesToDelete] = useState<string[]>([]);

  // Client relationships state
  const {
    data: clientRelationships,
    setItems: setClientRelationships,
    addItem: addClientRelationship,
    removeItem: removeClientRelationship,
  } = useDataState<ClientInstrument>(item => item.id, []);

  const fetchItemsWithClients = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('client_instruments').select(`
          *,
          client:clients(*),
          item:instruments(*)
        `);

      if (error) throw error;
      setClientRelationships(data || []);
    } catch (error) {
      logError(
        'Error fetching client relationships',
        error,
        'useDashboardItems'
      );
    }
  }, [setClientRelationships]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('instruments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);

      // Fetch which items have clients
      await fetchItemsWithClients();
    } catch (error) {
      logError('Error fetching items', error, 'useDashboardItems');
    } finally {
      setLoading(false);
    }
  }, [fetchItemsWithClients]);

  const createItem = useCallback(
    async (itemData: Omit<Instrument, 'id' | 'created_at'>) => {
      setSubmitting(true);
      try {
        const { data, error } = await supabase
          .from('instruments')
          .insert([itemData])
          .select()
          .single();

        if (error) throw error;
        setItems(prev => [data, ...prev]);
        return data;
      } catch (error) {
        logError('Error creating item', error, 'useDashboardItems');
        throw error;
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  const updateItem = useCallback(
    async (id: string, itemData: Partial<Instrument>) => {
      setSubmitting(true);
      try {
        const { data, error } = await supabase
          .from('instruments')
          .update(itemData)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        setItems(prev => prev.map(item => (item.id === id ? data : item)));
        return data;
      } catch (error) {
        logError('Error updating item', error, 'useDashboardItems');
        throw error;
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  const deleteItem = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('instruments')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setItems(prev => prev.filter(item => item.id !== id));
    } catch (error) {
      logError('Error deleting item', error, 'useDashboardItems');
      throw error;
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return {
    items,
    loading,
    submitting,
    itemImages,
    uploadingImages,
    imagesToDelete,
    clientRelationships,
    setItemImages,
    addItemImage,
    removeItemImage,
    setUploadingImages,
    setImagesToDelete,
    setClientRelationships,
    addClientRelationship,
    removeClientRelationship,
    fetchItems,
    fetchItemsWithClients,
    createItem,
    updateItem,
    deleteItem,
  };
}
