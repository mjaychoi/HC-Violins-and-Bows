import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Client, Instrument } from '@/types';
import { logError } from '@/utils/logger';

export function useOwnedItems() {
  const [ownedItems, setOwnedItems] = useState<Instrument[]>([]);
  const [loadingOwnedItems, setLoadingOwnedItems] = useState(false);

  const fetchOwnedItems = async (client: Client) => {
    try {
      setLoadingOwnedItems(true);
      const { data, error } = await supabase
        .from('instruments')
        .select('*')
        .eq('ownership', `${client.first_name} ${client.last_name}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOwnedItems(data || []);
    } catch (error) {
      logError('Error fetching owned items', error, 'useOwnedItems', {
        clientId: client.id,
        clientName: `${client.first_name} ${client.last_name}`,
        operation: 'fetchOwnedItems',
      });
      setOwnedItems([]);
    } finally {
      setLoadingOwnedItems(false);
    }
  };

  const clearOwnedItems = () => {
    setOwnedItems([]);
  };

  return {
    ownedItems,
    loadingOwnedItems,
    fetchOwnedItems,
    clearOwnedItems,
  };
}
