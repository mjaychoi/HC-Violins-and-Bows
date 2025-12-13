import { useState } from 'react';
import { Client, Instrument } from '@/types';
import { logError } from '@/utils/logger';
// Removed direct supabase import to reduce bundle size - using API routes instead

export function useOwnedItems() {
  const [ownedItems, setOwnedItems] = useState<Instrument[]>([]);
  const [loadingOwnedItems, setLoadingOwnedItems] = useState(false);

  const fetchOwnedItems = async (client: Client) => {
    try {
      setLoadingOwnedItems(true);
      // Use API route instead of direct Supabase client to reduce bundle size
      const ownershipValue = `${client.first_name} ${client.last_name}`;
      const params = new URLSearchParams({
        ownership: ownershipValue,
        orderBy: 'created_at',
        ascending: 'false',
      });
      const response = await fetch(`/api/instruments?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch owned items: ${response.statusText}`);
      }
      const result = await response.json();
      setOwnedItems(result.data || []);
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
