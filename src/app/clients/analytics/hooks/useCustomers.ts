import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { CustomerWithPurchases, salesHistoryToPurchase } from '../types';
import { SalesHistory } from '@/types';
import { useUnifiedClients } from '@/hooks/useUnifiedData';
import { useErrorHandler } from '@/contexts/ToastContext';
import { compareDatesDesc } from '@/utils/dateParsing';
import { apiFetch } from '@/utils/apiFetch';
import { handleApiResponse } from '@/utils/handleApiResponse';
import { logInfo, logDebug, logError } from '@/utils/logger';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';

// Client sales summary type (from API)
export interface ClientSalesSummary {
  client_id: string;
  total_spend: number;
  purchase_count: number;
  last_purchase_date: string | null;
  first_purchase_date: string | null;
}

interface UseCustomersOptions {
  enabled?: boolean; // ✅ Control whether to fetch data (default: true)
}

type CustomersStatus = 'loading' | 'success' | 'empty' | 'error';

export function useCustomers({ enabled = true }: UseCustomersOptions = {}) {
  const { clients, loading: clientsLoading } = useUnifiedClients();
  const { handleError } = useErrorHandler();
  const { tenantIdentityKey } = useTenantIdentity();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<CustomersStatus>('empty');
  const [purchaseHistoryByClient, setPurchaseHistoryByClient] = useState<
    Map<string, ReturnType<typeof salesHistoryToPurchase>[]>
  >(new Map());
  const [salesSummaryByClient, setSalesSummaryByClient] = useState<
    Map<string, ClientSalesSummary>
  >(new Map());
  const [purchaseHistoryStatusByClient, setPurchaseHistoryStatusByClient] =
    useState<Map<string, 'idle' | 'loading' | 'success' | 'empty' | 'error'>>(
      new Map()
    );
  const [detailLoading, setDetailLoading] = useState(false);
  const purchaseHistoryRequestIdRef = useRef(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'spend' | 'recent'>('name');
  const [selectedCustomerPurchases, setSelectedCustomerPurchases] = useState<
    ReturnType<typeof salesHistoryToPurchase>[]
  >([]);
  const [selectedCustomerPurchasesStatus, setSelectedCustomerPurchasesStatus] =
    useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [selectedCustomerPurchasesError, setSelectedCustomerPurchasesError] =
    useState<string | null>(null);

  // Track if we've already fetched to prevent duplicate fetches
  const hasFetchedRef = useRef(false);
  const fetchSalesHistoryRef = useRef<(() => Promise<void>) | null>(null);
  const tenantIdentityKeyRef = useRef<string | null>(tenantIdentityKey);

  useEffect(() => {
    tenantIdentityKeyRef.current = tenantIdentityKey;
    hasFetchedRef.current = false;
    purchaseHistoryRequestIdRef.current += 1;
    setLoading(false);
    setStatus('empty');
    setPurchaseHistoryByClient(new Map());
    setSalesSummaryByClient(new Map());
    setPurchaseHistoryStatusByClient(new Map());
    setDetailLoading(false);
    setSelectedCustomerPurchases([]);
    setSelectedCustomerPurchasesStatus('idle');
    setSelectedCustomerPurchasesError(null);
  }, [tenantIdentityKey]);

  // Fetch sales summary (aggregated by client) only.
  const fetchSalesHistory = useCallback(async () => {
    const startedTenantIdentityKey = tenantIdentityKeyRef.current;

    // Prevent duplicate fetches
    if (hasFetchedRef.current) {
      if (
        typeof window !== 'undefined' &&
        process.env.NODE_ENV === 'development'
      ) {
        logInfo('[useCustomers] Skipping duplicate fetch');
      }
      return;
    }
    try {
      setLoading(true);
      setStatus('loading');

      // ✅ OPTIMIZED: Fetch aggregated summary first (much smaller data transfer)
      // This provides total_spend, purchase_count, last_purchase_date for sorting/filtering
      const summaryResponse = await apiFetch('/api/sales/summary-by-client');
      if (tenantIdentityKeyRef.current !== startedTenantIdentityKey) {
        return;
      }

      const summaries = await handleApiResponse<ClientSalesSummary[]>(
        summaryResponse,
        'Failed to fetch sales summary'
      );
      if (tenantIdentityKeyRef.current !== startedTenantIdentityKey) {
        return;
      }

      const summaryMap = new Map<string, ClientSalesSummary>();
      summaries.forEach(summary => {
        summaryMap.set(summary.client_id, summary);
      });
      if (tenantIdentityKeyRef.current !== startedTenantIdentityKey) {
        return;
      }

      setSalesSummaryByClient(summaryMap);

      // ✅ FIXED: Mark as fetched only after successful completion
      hasFetchedRef.current = true;
      setStatus(clients.length > 0 ? 'success' : 'empty');
    } catch (error) {
      if (tenantIdentityKeyRef.current !== startedTenantIdentityKey) {
        return;
      }

      logError('[useCustomers] Sales summary API error:', error);
      setSalesSummaryByClient(new Map());
      setPurchaseHistoryByClient(new Map());
      setPurchaseHistoryStatusByClient(new Map());
      setSelectedCustomerPurchases([]);
      setSelectedCustomerPurchasesStatus('error');
      setSelectedCustomerPurchasesError('Failed to load customer analytics');
      setStatus('error');
      handleError(error, 'Failed to fetch sales history');
      // Reset hasFetchedRef on error so we can retry
      hasFetchedRef.current = false;
    } finally {
      if (tenantIdentityKeyRef.current === startedTenantIdentityKey) {
        setLoading(false);
      }
    }
  }, [clients.length, handleError]);

  const fetchSelectedCustomerPurchases = useCallback(
    async (clientId: string) => {
      const currentRequestId = ++purchaseHistoryRequestIdRef.current;
      const startedTenantIdentityKey = tenantIdentityKeyRef.current;

      setSelectedCustomerPurchases([]);
      setSelectedCustomerPurchasesError(null);
      setSelectedCustomerPurchasesStatus('loading');
      setDetailLoading(true);
      setPurchaseHistoryStatusByClient(prev => {
        const next = new Map(prev);
        next.set(clientId, 'loading');
        return next;
      });

      try {
        const response = await apiFetch(
          `/api/sales?client_id=${clientId}&page=1&pageSize=200`
        );
        if (tenantIdentityKeyRef.current !== startedTenantIdentityKey) {
          return;
        }

        const sales = await handleApiResponse<SalesHistory[]>(
          response,
          'Failed to fetch customer purchases'
        );
        if (tenantIdentityKeyRef.current !== startedTenantIdentityKey) {
          return;
        }

        const purchases = sales.map(sale => salesHistoryToPurchase(sale));

        if (
          currentRequestId !== purchaseHistoryRequestIdRef.current ||
          tenantIdentityKeyRef.current !== startedTenantIdentityKey
        ) {
          return;
        }

        setPurchaseHistoryByClient(prev => {
          const next = new Map(prev);
          next.set(clientId, purchases);
          return next;
        });
        setPurchaseHistoryStatusByClient(prev => {
          const next = new Map(prev);
          next.set(clientId, purchases.length > 0 ? 'success' : 'empty');
          return next;
        });
        setSelectedCustomerPurchases(purchases);
        setSelectedCustomerPurchasesStatus(
          purchases.length > 0 ? 'success' : 'empty'
        );
      } catch (error) {
        if (
          currentRequestId !== purchaseHistoryRequestIdRef.current ||
          tenantIdentityKeyRef.current !== startedTenantIdentityKey
        ) {
          return;
        }

        setPurchaseHistoryByClient(prev => {
          const next = new Map(prev);
          next.delete(clientId);
          return next;
        });
        setPurchaseHistoryStatusByClient(prev => {
          const next = new Map(prev);
          next.set(clientId, 'error');
          return next;
        });
        setSelectedCustomerPurchases([]);
        setSelectedCustomerPurchasesStatus('error');
        setSelectedCustomerPurchasesError(
          error instanceof Error
            ? error.message
            : 'Failed to load customer purchases'
        );
        handleError(error, 'Failed to fetch customer purchases');
      } finally {
        if (
          currentRequestId === purchaseHistoryRequestIdRef.current &&
          tenantIdentityKeyRef.current === startedTenantIdentityKey
        ) {
          setDetailLoading(false);
        }
      }
    },
    [handleError]
  );

  // Store fetchSalesHistory in ref for stable reference
  fetchSalesHistoryRef.current = fetchSalesHistory;

  // ✅ Fetch sales history when clients are loaded (only if enabled)
  useEffect(() => {
    // ✅ Don't fetch if disabled (e.g., not in analytics tab)
    if (!enabled) {
      if (
        typeof window !== 'undefined' &&
        process.env.NODE_ENV === 'development'
      ) {
        logInfo('[useCustomers] Fetch disabled (enabled=false)');
      }
      return;
    }

    if (
      typeof window !== 'undefined' &&
      process.env.NODE_ENV === 'development'
    ) {
      logDebug('[useCustomers] Clients state:', {
        clientsLoading,
        clientsCount: clients.length,
        shouldFetch:
          !clientsLoading && clients.length > 0 && !hasFetchedRef.current,
        hasFetched: hasFetchedRef.current,
        enabled,
      });
    }

    if (
      !clientsLoading &&
      clients.length > 0 &&
      !hasFetchedRef.current &&
      fetchSalesHistoryRef.current
    ) {
      fetchSalesHistoryRef.current();
    } else if (!clientsLoading && clients.length === 0) {
      setStatus('empty');
      // Debug: 클라이언트가 로드되지 않았을 때
      if (
        typeof window !== 'undefined' &&
        process.env.NODE_ENV === 'development'
      ) {
        logInfo(
          `[useCustomers] No client data available. clientsLoading: ${clientsLoading}, clients.length: ${clients.length}`
        );
      }
    }
  }, [enabled, clientsLoading, clients.length, tenantIdentityKey]);
  // Note: fetchSalesHistoryRef.current is used instead of fetchSalesHistory to prevent infinite loops
  // The ref is updated whenever fetchSalesHistory changes, but doesn't trigger re-renders

  // Combine clients with their purchases
  // FIXED: Normalize tags and note to prevent runtime crashes
  const customers: CustomerWithPurchases[] = useMemo(() => {
    const result = clients.map(client => {
      const summary = salesSummaryByClient.get(client.id);
      const lastPurchaseAt = summary?.last_purchase_date || null;
      const cachedPurchases = purchaseHistoryByClient.get(client.id) || [];
      const purchasesStatus =
        purchaseHistoryStatusByClient.get(client.id) || 'idle';

      return {
        ...client,
        tags: Array.isArray(client.tags) ? client.tags : [],
        note: client.note || null,
        purchases: cachedPurchases,
        lastPurchaseAt,
        totalSpend: summary?.total_spend || 0,
        purchaseCount: summary?.purchase_count || 0,
        purchasesStatus,
      };
    });

    // Debug logging removed to reduce console noise

    return result;
  }, [
    clients,
    salesSummaryByClient,
    purchaseHistoryByClient,
    purchaseHistoryStatusByClient,
  ]);

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const filtered = customers.filter(c => {
      const fullName =
        `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
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
        const nameA =
          `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
        const nameB =
          `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase();
        return nameA.localeCompare(nameB);
      }
      if (sortBy === 'spend') {
        // ✅ OPTIMIZED: Use summary data for total spend (faster than calculating from purchases)
        const summaryA = salesSummaryByClient.get(a.id);
        const summaryB = salesSummaryByClient.get(b.id);
        const spendA = summaryA?.total_spend || 0;
        const spendB = summaryB?.total_spend || 0;
        return spendB - spendA;
      }
      // recent
      // ✅ FIXED: Use lastPurchaseAt (raw ISO string) for sorting, fallback to created_at
      const recentA = a.lastPurchaseAt || a.created_at || '';
      const recentB = b.lastPurchaseAt || b.created_at || '';
      return compareDatesDesc(recentA, recentB);
    });

    return sorted;
  }, [customers, searchTerm, tagFilter, sortBy, salesSummaryByClient]);

  useEffect(() => {
    // Only auto-select first customer if no customer is explicitly selected
    // Don't auto-select if user has explicitly cleared selection (selectedCustomerId === null)
    if (selectedCustomerId === undefined && filteredCustomers.length) {
      setSelectedCustomerId(filteredCustomers[0].id);
    } else if (
      selectedCustomerId &&
      !filteredCustomers.find(c => c.id === selectedCustomerId)
    ) {
      // If selected customer is not in filtered list, select first or clear
      setSelectedCustomerId(filteredCustomers[0]?.id ?? null);
    }
  }, [filteredCustomers, selectedCustomerId]);

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    customers.forEach(c => c.tags.forEach(tag => tagSet.add(tag)));
    return Array.from(tagSet);
  }, [customers]);

  // Only return selected customer if selectedCustomerId is explicitly set
  // Don't fallback to first customer - this causes stats to always show first customer's data
  const selectedCustomer = selectedCustomerId
    ? (() => {
        const customer =
          filteredCustomers.find(c => c.id === selectedCustomerId) || null;
        if (!customer) return null;
        return {
          ...customer,
          purchases: selectedCustomerPurchases,
          purchasesStatus: selectedCustomerPurchasesStatus,
        };
      })()
    : null;

  const refetch = useCallback(() => {
    hasFetchedRef.current = false;
    setStatus(clients.length > 0 ? 'loading' : 'empty');
    void fetchSalesHistory();
  }, [clients.length, fetchSalesHistory]);

  useEffect(() => {
    if (!selectedCustomerId) {
      purchaseHistoryRequestIdRef.current += 1;
      if (selectedCustomerPurchases.length > 0) {
        setSelectedCustomerPurchases([]);
      }
      if (selectedCustomerPurchasesStatus !== 'idle') {
        setSelectedCustomerPurchasesStatus('idle');
      }
      if (selectedCustomerPurchasesError !== null) {
        setSelectedCustomerPurchasesError(null);
      }
      if (detailLoading) {
        setDetailLoading(false);
      }
      return;
    }

    const cachedPurchases = purchaseHistoryByClient.get(selectedCustomerId);
    const cachedStatus = purchaseHistoryStatusByClient.get(selectedCustomerId);

    if (cachedPurchases) {
      setSelectedCustomerPurchases(cachedPurchases);
      setSelectedCustomerPurchasesStatus(
        cachedStatus || (cachedPurchases.length > 0 ? 'success' : 'empty')
      );
      setSelectedCustomerPurchasesError(null);
      setDetailLoading(false);
      return;
    }

    if (cachedStatus === 'error' || cachedStatus === 'loading') {
      setSelectedCustomerPurchases([]);
      setSelectedCustomerPurchasesStatus(cachedStatus);
      return;
    }

    void fetchSelectedCustomerPurchases(selectedCustomerId);
  }, [
    selectedCustomerId,
    purchaseHistoryByClient,
    purchaseHistoryStatusByClient,
    fetchSelectedCustomerPurchases,
    selectedCustomerPurchases.length,
    selectedCustomerPurchasesStatus,
    selectedCustomerPurchasesError,
    detailLoading,
  ]);

  const refetchSelectedCustomer = useCallback(() => {
    if (!selectedCustomerId) return;
    setPurchaseHistoryByClient(prev => {
      const next = new Map(prev);
      next.delete(selectedCustomerId);
      return next;
    });
    setPurchaseHistoryStatusByClient(prev => {
      const next = new Map(prev);
      next.delete(selectedCustomerId);
      return next;
    });
    void fetchSelectedCustomerPurchases(selectedCustomerId);
  }, [selectedCustomerId, fetchSelectedCustomerPurchases]);

  return {
    customers: filteredCustomers,
    rawCustomers: customers,
    allCustomersCount: customers.length, // Total count before filtering
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
    status,
    refetch,
    selectedCustomerPurchasesStatus,
    selectedCustomerPurchasesError,
    refetchSelectedCustomer,
    loading:
      (typeof clientsLoading === 'object' &&
      clientsLoading !== null &&
      'hasAnyLoading' in clientsLoading
        ? (clientsLoading as { hasAnyLoading: boolean }).hasAnyLoading
        : typeof clientsLoading === 'object' &&
            clientsLoading !== null &&
            'any' in clientsLoading
          ? (clientsLoading as { any: boolean }).any // Fallback for deprecated 'any'
          : Boolean(clientsLoading)) ||
      loading ||
      detailLoading,
  };
}
