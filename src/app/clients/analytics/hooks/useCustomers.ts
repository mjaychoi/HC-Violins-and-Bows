import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { CustomerWithPurchases, salesHistoryToPurchase } from '../types';
import { SalesHistory, Instrument } from '@/types';
import { useUnifiedClients } from '@/hooks/useUnifiedData';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { getMostRecentDate, compareDatesDesc } from '@/utils/dateParsing';

export function useCustomers() {
  const { clients, loading: clientsLoading } = useUnifiedClients();
  const { handleError } = useErrorHandler();
  const [loading, setLoading] = useState(false);
  const [salesByClient, setSalesByClient] = useState<Map<string, SalesHistory[]>>(new Map());
  const [instrumentsMap, setInstrumentsMap] = useState<Map<string, Instrument>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'spend' | 'recent'>('name');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Track if we've already fetched to prevent duplicate fetches
  const hasFetchedRef = useRef(false);
  const fetchSalesHistoryRef = useRef<(() => Promise<void>) | null>(null);

  // Fetch all sales history and group by client_id
  const fetchSalesHistory = useCallback(async () => {
    // Prevent duplicate fetches
    if (hasFetchedRef.current) {
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.log('[useCustomers] Skipping duplicate fetch');
      }
      return;
    }
    try {
      setLoading(true);
      console.log('[useCustomers] Fetching sales history...');
      
      // FIXED: Performance note - fetching all sales (10k limit) for analytics
      // TODO: Consider server-side aggregation endpoint /api/sales/summary-by-client
      // that returns {client_id, total_spend, last_purchase_date, purchase_count}
      // to avoid pulling 10k rows just to compute totals/sorting
      const response = await fetch('/api/sales?page=1&pageSize=10000');
      const result = await response.json();

      if (!response.ok) {
        console.error('[useCustomers] Sales API error:', { status: response.status, error: result.error });
        throw result.error || new Error('Failed to fetch sales history');
      }

      const sales = (result.data || []) as SalesHistory[];
      console.log('[useCustomers] Sales fetched:', { count: sales.length });
      
      // Group sales by client_id
      const grouped = new Map<string, SalesHistory[]>();
      sales.forEach(sale => {
        if (sale.client_id) {
          const existing = grouped.get(sale.client_id) || [];
          existing.push(sale);
          grouped.set(sale.client_id, existing);
        }
      });

      console.log('[useCustomers] Sales grouped by client:', { 
        uniqueClients: grouped.size,
        totalSales: sales.length 
      });
      setSalesByClient(grouped);

      // Fetch instruments for item names
      const instrumentIds = new Set<string>();
      sales.forEach(sale => {
        if (sale.instrument_id) {
          instrumentIds.add(sale.instrument_id);
        }
      });

      if (instrumentIds.size > 0) {
        console.log('[useCustomers] Fetching instruments...', { count: instrumentIds.size });
        // FIXED: Performance note - fetching all instruments when only specific IDs are needed
        // TODO: Add endpoint /api/instruments?ids=... (or POST body) to fetch only required IDs
        // This reduces network transfer and memory usage
        const instrumentsResponse = await fetch('/api/instruments');
        const instrumentsResult = await instrumentsResponse.json();
        
        if (instrumentsResponse.ok && instrumentsResult.data) {
          const instruments = instrumentsResult.data as Instrument[];
          const map = new Map<string, Instrument>();
          // Filter to only instruments we actually need
          instruments.forEach(inst => {
            if (instrumentIds.has(inst.id)) {
              map.set(inst.id, inst);
            }
          });
          console.log('[useCustomers] Instruments loaded:', { count: map.size });
          setInstrumentsMap(map);
        } else {
          console.warn('[useCustomers] Failed to fetch instruments:', instrumentsResult);
        }
      } else {
        console.log('[useCustomers] No instruments to fetch');
      }
    } catch (error) {
      console.error('[useCustomers] Error fetching sales history:', error);
      handleError(error, 'Failed to fetch sales history');
      // Reset hasFetchedRef on error so we can retry
      hasFetchedRef.current = false;
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  // Store fetchSalesHistory in ref for stable reference
  fetchSalesHistoryRef.current = fetchSalesHistory;

  // Fetch sales history when clients are loaded (only once)
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('[useCustomers] Clients state:', {
        clientsLoading,
        clientsCount: clients.length,
        shouldFetch: !clientsLoading && clients.length > 0 && !hasFetchedRef.current,
        hasFetched: hasFetchedRef.current,
      });
    }
    
    if (!clientsLoading && clients.length > 0 && !hasFetchedRef.current && fetchSalesHistoryRef.current) {
      fetchSalesHistoryRef.current();
    } else if (!clientsLoading && clients.length === 0) {
      // Debug: 클라이언트가 로드되지 않았을 때
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.warn('[useCustomers] 클라이언트 데이터가 없습니다. clientsLoading:', clientsLoading, 'clients.length:', clients.length);
      }
    }
  }, [clientsLoading, clients.length]);
  // Note: fetchSalesHistoryRef.current is used instead of fetchSalesHistory to prevent infinite loops
  // The ref is updated whenever fetchSalesHistory changes, but doesn't trigger re-renders

  // Combine clients with their purchases
  // FIXED: Normalize tags and note to prevent runtime crashes
  const customers: CustomerWithPurchases[] = useMemo(() => {
    const result = clients.map(client => {
      const sales = salesByClient.get(client.id) || [];
      const purchases = sales.map(sale => {
        const instrument = sale.instrument_id ? instrumentsMap.get(sale.instrument_id) : null;
        return salesHistoryToPurchase(sale, instrument);
      });

      return {
        ...client,
        tags: Array.isArray(client.tags) ? client.tags : [],
        note: client.note || null,
        purchases,
      };
    });
    
    // Debug logging
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('[useCustomers] Customers calculated:', {
        clientsCount: clients.length,
        customersCount: result.length,
        salesByClientSize: salesByClient.size,
        instrumentsMapSize: instrumentsMap.size,
        customersWithPurchases: result.filter(c => c.purchases.length > 0).length,
      });
    }
    
    return result;
  }, [clients, salesByClient, instrumentsMap]);

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const filtered = customers.filter(c => {
      const fullName = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
      const matchesSearch =
        !term ||
        fullName.includes(term) ||
        (c.email || '').toLowerCase().includes(term) ||
        c.tags.some(tag => tag.toLowerCase().includes(term));
      const matchesTag = tagFilter ? c.tags.includes(tagFilter) : true;
      return matchesSearch && matchesTag;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'name') {
        const nameA = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
        const nameB = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase();
        return nameA.localeCompare(nameB);
      }
      if (sortBy === 'spend') {
        const spendA = a.purchases.reduce((s, p) => s + p.amount, 0);
        const spendB = b.purchases.reduce((s, p) => s + p.amount, 0);
        return spendB - spendA;
      }
      // recent
      // FIXED: Use getMostRecentDate and compareDatesDesc for reliable date sorting
      // FIXED: Handle empty purchases array - use created_at as fallback when getMostRecentDate returns '—'
      const aRecentDate = a.purchases.length > 0 ? getMostRecentDate(a.purchases.map(p => p.date)) : null;
      const bRecentDate = b.purchases.length > 0 ? getMostRecentDate(b.purchases.map(p => p.date)) : null;
      const recentA = (aRecentDate && aRecentDate !== '—') ? aRecentDate : (a.created_at || '');
      const recentB = (bRecentDate && bRecentDate !== '—') ? bRecentDate : (b.created_at || '');
      return compareDatesDesc(recentA, recentB);
    });

    return sorted;
  }, [customers, searchTerm, tagFilter, sortBy]);

  useEffect(() => {
    if (!selectedCustomerId && filteredCustomers.length) {
      setSelectedCustomerId(filteredCustomers[0].id);
    } else if (
      selectedCustomerId &&
      !filteredCustomers.find(c => c.id === selectedCustomerId)
    ) {
      setSelectedCustomerId(filteredCustomers[0]?.id ?? null);
    }
  }, [filteredCustomers, selectedCustomerId]);

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    customers.forEach(c => c.tags.forEach(tag => tagSet.add(tag)));
    return Array.from(tagSet);
  }, [customers]);

  const selectedCustomer =
    filteredCustomers.find(c => c.id === selectedCustomerId) ||
    filteredCustomers[0] ||
    null;

  return {
    customers: filteredCustomers,
    rawCustomers: customers,
    searchTerm,
    setSearchTerm,
    tagFilter,
    setTagFilter,
    sortBy,
    setSortBy,
    selectedCustomerId,
    setSelectedCustomerId,
    selectedCustomer,
    availableTags,
    loading: (typeof clientsLoading === 'object' && 'any' in clientsLoading ? clientsLoading.any : Boolean(clientsLoading)) || loading,
  };
}
