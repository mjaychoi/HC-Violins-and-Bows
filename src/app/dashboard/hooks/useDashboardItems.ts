/**
 * @deprecated This hook is deprecated. Use `useDashboardData` instead, which uses `useUnifiedDashboard` for consistent data fetching.
 *
 * This hook is kept for backward compatibility with tests only.
 * All production code should use `useDashboardData` → `useUnifiedDashboard`.
 */
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/utils/apiFetch';
import { handleApiResponse } from '@/utils/handleApiResponse';
import {
  Instrument,
  InstrumentImage,
  ClientInstrument,
  Client,
  RelationshipType,
} from '@/types';

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

function ensureInstrumentStatus(
  value: Instrument['status'] | string | null
): Instrument['status'] {
  if (value && INSTRUMENT_STATUSES.includes(value as Instrument['status'])) {
    return value as Instrument['status'];
  }
  return 'Available';
}

function normalizeInstrumentRow(row: Instrument): Instrument {
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

function normalizeClientRow(row: Client): Client {
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
  rows: ClientInstrument[],
  clients: Client[],
  instruments: Instrument[]
): ClientInstrumentJoined[] {
  const clientMap = new Map(clients.map(client => [client.id, client]));
  const instrumentMap = new Map(
    instruments.map(instrument => [instrument.id, instrument])
  );

  return rows
    .filter(row => Boolean(row.client_id) && Boolean(row.instrument_id))
    .map(row => {
      const normalizedClient = row.client
        ? normalizeClientRow(row.client)
        : row.client_id
          ? (clientMap.get(row.client_id) ?? null)
          : null;
      const normalizedInstrument = row.instrument
        ? normalizeInstrumentRow(row.instrument)
        : row.instrument_id
          ? (instrumentMap.get(row.instrument_id) ?? null)
          : null;
      return {
        id: row.id,
        client_id: row.client_id,
        instrument_id: row.instrument_id,
        notes: row.notes ?? null,
        display_order: row.display_order ?? undefined,
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

async function fetchDashboardCollection<T>(
  url: string,
  fallbackMessage: string
): Promise<T[]> {
  const res = await apiFetch(url);
  const payload = await handleApiResponse<T[]>(res, fallbackMessage);
  return Array.isArray(payload) ? payload : [];
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
      const [connections, clients, instruments] = await Promise.all([
        fetchDashboardCollection<ClientInstrument>(
          '/api/connections?orderBy=created_at&ascending=false&pageSize=100',
          'Failed to fetch connections'
        ),
        fetchDashboardCollection<Client>(
          '/api/clients?orderBy=created_at&ascending=false&all=true',
          'Failed to fetch clients'
        ),
        fetchDashboardCollection<Instrument>(
          '/api/instruments?orderBy=created_at&ascending=false&all=true',
          'Failed to fetch instruments'
        ),
      ]);

      setClientRelationships(
        normalizeClientRelationships(connections, clients, instruments)
      );
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
      const data = await fetchDashboardCollection<Instrument>(
        '/api/instruments?orderBy=created_at&ascending=false&all=true',
        'Failed to fetch instruments'
      );
      const duration = Math.round(performance.now() - startTime);

      logApiRequest(
        'GET',
        '/api/instruments',
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
        const res = await apiFetch('/api/instruments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(itemData),
        });
        const data = await handleApiResponse<Instrument>(
          res,
          'Failed to create instrument'
        );
        const duration = Math.round(performance.now() - startTime);

        logApiRequest(
          'POST',
          '/api/instruments',
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
        const res = await apiFetch('/api/instruments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...itemData }),
        });
        const data = await handleApiResponse<Instrument>(
          res,
          'Failed to update instrument'
        );
        const duration = Math.round(performance.now() - startTime);

        logApiRequest(
          'PATCH',
          '/api/instruments',
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
      const res = await apiFetch(
        `/api/instruments?id=${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        }
      );
      await handleApiResponse<{ success: boolean }>(
        res,
        'Failed to delete instrument'
      );
      const duration = Math.round(performance.now() - startTime);

      logApiRequest(
        'DELETE',
        '/api/instruments',
        200,
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
