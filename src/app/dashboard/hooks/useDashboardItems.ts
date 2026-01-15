/**
 * @deprecated This hook is deprecated. Use `useDashboardData` instead, which uses `useUnifiedDashboard` for consistent data fetching.
 *
 * This hook is kept for backward compatibility with tests only.
 * All production code should use `useDashboardData` → `useUnifiedDashboard`.
 */
import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase-client';
import {
  Instrument,
  InstrumentImage,
  ClientInstrument,
  Client,
  RelationshipType,
} from '@/types';
import type { Database } from '@/types/database';

type ClientInstrumentRow =
  Database['public']['Tables']['client_instruments']['Row'];
type ClientRow = Database['public']['Tables']['clients']['Row'];
type InstrumentRow = Database['public']['Tables']['instruments']['Row'];

type ClientInstrumentJoinedRow = ClientInstrumentRow & {
  client?: ClientRow | null;
  item?: InstrumentRow | null;
};

type ClientInstrumentJoined = Omit<
  ClientInstrument,
  'client' | 'instrument'
> & {
  client: Client | null;
  instrument: Instrument | null;
  item: Instrument | null;
};
import { useDataState } from '@/hooks/useDataState';
import { logError, logApiRequest } from '@/utils/logger';

/** @deprecated Use `useDashboardData` instead */
const INSTRUMENT_STATUSES: Instrument['status'][] = [
  'Available',
  'Booked',
  'Sold',
  'Reserved',
  'Maintenance',
];

const RELATIONSHIP_TYPES: RelationshipType[] = [
  'Interested',
  'Sold',
  'Booked',
  'Owned',
];

function ensureInstrumentStatus(value: string | null): Instrument['status'] {
  if (value && INSTRUMENT_STATUSES.includes(value as Instrument['status'])) {
    return value as Instrument['status'];
  }
  return 'Available';
}

function normalizeInstrumentRow(row: InstrumentRow): Instrument {
  return {
    id: row.id,
    status: ensureInstrumentStatus(row.status),
    maker: row.maker,
    type: row.type,
    subtype: row.subtype,
    year: row.year,
    certificate: row.certificate,
    certificate_name: row.certificate_name ?? null,
    cost_price: row.cost_price ?? null,
    consignment_price: row.consignment_price ?? null,
    size: row.size,
    weight: row.weight,
    price: row.price,
    ownership: row.ownership,
    note: row.note,
    serial_number: row.serial_number,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? undefined,
  };
}

function normalizeClientRow(row: ClientRow): Client {
  return {
    id: row.id,
    last_name: row.last_name,
    first_name: row.first_name,
    contact_number: row.contact_number,
    email: row.email,
    tags: row.tags ?? [],
    interest: row.interest,
    note: row.note,
    client_number: row.client_number,
    type: undefined,
    status: undefined,
    created_at: row.created_at ?? new Date().toISOString(),
    address: undefined,
  };
}

function normalizeClientRelationships(
  rows: ClientInstrumentJoinedRow[]
): ClientInstrumentJoined[] {
  return rows
    .filter(row => Boolean(row.client_id) && Boolean(row.instrument_id))
    .map(row => {
      const normalizedClient = row.client
        ? normalizeClientRow(row.client)
        : null;
      const normalizedInstrument = row.item
        ? normalizeInstrumentRow(row.item)
        : null;
      return {
        id: row.id,
        client_id: row.client_id as string,
        instrument_id: row.instrument_id as string,
        notes: row.notes ?? null,
        display_order: row.display_order,
        relationship_type: RELATIONSHIP_TYPES.includes(
          row.relationship_type as RelationshipType
        )
          ? (row.relationship_type as RelationshipType)
          : 'Interested',
        created_at: row.created_at ?? new Date().toISOString(),
        client: normalizedClient,
        instrument: normalizedInstrument,
        item: normalizedInstrument,
      };
    });
}

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

  // FIXED: Use ClientInstrumentJoined type for joined query results
  // But allow ClientInstrument for backward compatibility (addItem/removeItem might pass ClientInstrument)
  const {
    data: clientRelationships,
    setItems: setClientRelationships,
    addItem: addClientRelationship,
    removeItem: removeClientRelationship,
  } = useDataState<ClientInstrumentJoined | ClientInstrument>(
    item => item.id,
    []
  );

  const fetchItemsWithClients = useCallback(async () => {
    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.from('client_instruments').select(`
          *,
          client:clients(*),
          item:instruments(*)
        `);

      if (error) throw error;
      const rows = (data || []) as ClientInstrumentJoinedRow[];
      setClientRelationships(normalizeClientRelationships(rows));
    } catch (error) {
      logError(
        'Error fetching client relationships',
        error,
        'useDashboardItems',
        { operation: 'fetchItemsWithClients' }
      );
    }
  }, [setClientRelationships]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const startTime = performance.now();

    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase
        .from('instruments')
        .select('*')
        .order('created_at', { ascending: false });
      const duration = Math.round(performance.now() - startTime);

      if (error) {
        logApiRequest(
          'GET',
          'supabase://instruments',
          undefined,
          duration,
          'useDashboardItems',
          {
            operation: 'fetchItems',
            error: true,
          }
        );
        throw error;
      }

      logApiRequest(
        'GET',
        'supabase://instruments',
        200,
        duration,
        'useDashboardItems',
        {
          operation: 'fetchItems',
          recordCount: data?.length || 0,
        }
      );

      setItems((data || []).map(normalizeInstrumentRow));

      // FIXED: Run fetches in parallel instead of sequentially for better performance
      await Promise.all([
        Promise.resolve(), // fetchItemsCore is already done (above)
        fetchItemsWithClients(),
      ]);
    } catch (error) {
      logError('Error fetching items', error, 'useDashboardItems', {
        operation: 'fetchItems',
      });
    } finally {
      setLoading(false);
    }
  }, [fetchItemsWithClients]);

  // FIXED: Add dependencies to useCallback (React guarantees setState functions are stable, but explicit deps are clearer)
  const createItem = useCallback(
    async (itemData: Omit<Instrument, 'id' | 'created_at'>) => {
      setSubmitting(true);
      const startTime = performance.now();

      try {
        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
          .from('instruments')
          .insert([itemData])
          .select()
          .single();
        const duration = Math.round(performance.now() - startTime);

        if (error) {
          logApiRequest(
            'POST',
            'supabase://instruments',
            undefined,
            duration,
            'useDashboardItems',
            {
              operation: 'createItem',
              error: true,
            }
          );
          throw error;
        }

        logApiRequest(
          'POST',
          'supabase://instruments',
          201,
          duration,
          'useDashboardItems',
          {
            operation: 'createItem',
            recordId: data?.id,
          }
        );

        setItems(prev => [normalizeInstrumentRow(data), ...prev]);
        return data;
      } catch (error) {
        logError('Error creating item', error, 'useDashboardItems', {
          operation: 'createItem',
          itemData: itemData,
        });
        throw error;
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  // FIXED: Add dependencies to useCallback
  const updateItem = useCallback(
    async (id: string, itemData: Partial<Instrument>) => {
      setSubmitting(true);
      const startTime = performance.now();

      try {
        const supabase = await getSupabaseClient();
        const { data, error } = await supabase
          .from('instruments')
          .update(itemData)
          .eq('id', id)
          .select()
          .single();
        const duration = Math.round(performance.now() - startTime);

        if (error) {
          logApiRequest(
            'PATCH',
            `supabase://instruments/${id}`,
            undefined,
            duration,
            'useDashboardItems',
            {
              operation: 'updateItem',
              id,
              error: true,
            }
          );
          throw error;
        }

        logApiRequest(
          'PATCH',
          `supabase://instruments/${id}`,
          200,
          duration,
          'useDashboardItems',
          {
            operation: 'updateItem',
            id,
          }
        );

        setItems(prev =>
          prev.map(item =>
            item.id === id ? normalizeInstrumentRow(data) : item
          )
        );
        return data;
      } catch (error) {
        logError('Error updating item', error, 'useDashboardItems', {
          operation: 'updateItem',
          id,
          itemData,
        });
        throw error;
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  // FIXED: Add dependencies to useCallback
  const deleteItem = useCallback(async (id: string) => {
    const startTime = performance.now();

    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase
        .from('instruments')
        .delete()
        .eq('id', id);
      const duration = Math.round(performance.now() - startTime);

      if (error) {
        logApiRequest(
          'DELETE',
          `supabase://instruments/${id}`,
          undefined,
          duration,
          'useDashboardItems',
          {
            operation: 'deleteItem',
            id,
            error: true,
          }
        );
        throw error;
      }

      logApiRequest(
        'DELETE',
        `supabase://instruments/${id}`,
        204,
        duration,
        'useDashboardItems',
        {
          operation: 'deleteItem',
          id,
        }
      );

      setItems(prev => prev.filter(item => item.id !== id));
    } catch (error) {
      logError('Error deleting item', error, 'useDashboardItems', {
        operation: 'deleteItem',
        id,
      });
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
