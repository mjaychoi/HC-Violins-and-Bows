'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Client } from '@/types';
import { apiFetch } from '@/utils/apiFetch';
import { readApiResponseEnvelope } from '@/utils/handleApiResponse';
import { useDebounce } from '@/hooks/useDebounce';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  buildClientsCollectionQueryString,
  DEFAULT_PAGE_SIZE,
  type HasInstrumentsFilter,
} from '@/app/api/clients/_utils/listQuery';
import {
  canonicalizeClientSortField,
  clientSortArrow,
  type ClientCanonicalSortField,
} from '@/app/api/clients/_utils/clientSort';
import {
  EMPTY_FILTER_STATE,
  handleColumnSort as nextColumnSort,
} from '../utils/filterUtils';
import type { ClientFilterOptions, FilterState } from '../types';
import { HAS_INSTRUMENTS_FILTER_OPTIONS } from '../constants';
import { isAuthLikeTenantError } from '@/utils/tenantIdentity';

export type ClientCollectionSortField = ClientCanonicalSortField;

type PaginationMeta = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type CollectionEnvelope = {
  data: Client[];
  count?: number;
  pagination?: PaginationMeta;
  has_more?: boolean;
  truncated?: boolean;
  scope?: string;
};

function hasInstrumentsFromFilter(filters: FilterState): HasInstrumentsFilter {
  const values = filters.hasInstruments ?? [];
  if (values.length !== 1) return null;
  if (values[0] === HAS_INSTRUMENTS_FILTER_OPTIONS.HAS) return 'has';
  if (values[0] === HAS_INSTRUMENTS_FILTER_OPTIONS.NO) return 'no';
  return null;
}

function parseFiltersFromSearchParams(sp: URLSearchParams): FilterState {
  const getAll = (key: string) =>
    sp
      .getAll(key)
      .flatMap(v => v.split(','))
      .map(s => s.trim())
      .filter(Boolean);

  const hasRaw = sp.get('hasInstruments') ?? sp.get('has_instruments') ?? '';
  let hasInstruments: string[] = [];
  if (hasRaw === 'has' || hasRaw === HAS_INSTRUMENTS_FILTER_OPTIONS.HAS) {
    hasInstruments = [HAS_INSTRUMENTS_FILTER_OPTIONS.HAS];
  } else if (hasRaw === 'no' || hasRaw === HAS_INSTRUMENTS_FILTER_OPTIONS.NO) {
    hasInstruments = [HAS_INSTRUMENTS_FILTER_OPTIONS.NO];
  }

  return {
    last_name: getAll('last_name'),
    first_name: getAll('first_name'),
    contact_number: getAll('contact_number'),
    email: getAll('email'),
    tags: getAll('tags'),
    interest: getAll('interest'),
    hasInstruments,
  };
}

function parsePage(sp: URLSearchParams): number {
  const n = Number.parseInt(sp.get('page') || '1', 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function parseSort(sp: URLSearchParams): {
  sortBy: ClientCanonicalSortField;
  sortOrder: 'asc' | 'desc';
} {
  const sortBy = canonicalizeClientSortField(
    sp.get('sortBy') || sp.get('sort_by') || sp.get('orderBy')
  );
  const explicitDir = (
    sp.get('sortOrder') ||
    sp.get('sort_direction') ||
    sp.get('sortDirection') ||
    ''
  )
    .trim()
    .toLowerCase();

  let sortOrder: 'asc' | 'desc';
  if (explicitDir === 'asc' || explicitDir === 'ascending') {
    sortOrder = 'asc';
  } else if (explicitDir === 'desc' || explicitDir === 'descending') {
    sortOrder = 'desc';
  } else if (sp.get('ascending') === 'true') {
    sortOrder = 'asc';
  } else {
    // Default collection contract: created_at newest-first.
    sortOrder = 'desc';
  }

  return { sortBy, sortOrder };
}

const EMPTY_FILTER_OPTIONS: ClientFilterOptions = {
  lastNames: [],
  firstNames: [],
  contactNumbers: [],
  emails: [],
  tags: [],
  interests: [],
};

/**
 * Server-backed /clients collection: pagination, search, filters, sort, URL sync.
 * Does not use `all=true`. Completeness comes from pagination.totalCount.
 */
export function useClientCollection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { tenantIdentityKey } = useTenantIdentity();

  const [pageRows, setPageRows] = useState<Client[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] =
    useState<ClientFilterOptions>(EMPTY_FILTER_OPTIONS);
  const [selectedById, setSelectedById] = useState<Record<string, Client>>({});

  // Local editable search (debounced before fetch/URL)
  const urlSearch = searchParams.get('search') ?? '';
  const [searchTerm, setSearchTerm] = useState(urlSearch);
  const debouncedSearch = useDebounce(searchTerm, 300);

  const page = parsePage(searchParams);
  const { sortBy, sortOrder } = parseSort(searchParams);
  const filters = useMemo(
    () => parseFiltersFromSearchParams(searchParams),
    [searchParams]
  );

  const pageSize = DEFAULT_PAGE_SIZE;
  const requestIdRef = useRef(0);
  const tenantRef = useRef(tenantIdentityKey);
  const pageRowsRef = useRef(pageRows);

  useEffect(() => {
    pageRowsRef.current = pageRows;
  }, [pageRows]);

  // Sync search input from URL (back/forward)
  useEffect(() => {
    setSearchTerm(urlSearch);
  }, [urlSearch]);

  // Clear on tenant change
  useEffect(() => {
    if (tenantRef.current !== tenantIdentityKey) {
      requestIdRef.current += 1;
      setPageRows([]);
      setTotalCount(0);
      setTotalPages(1);
      setHasMore(false);
      setError(null);
      setSelectedById({});
      setFilterOptions(EMPTY_FILTER_OPTIONS);
      tenantRef.current = tenantIdentityKey;
    }
  }, [tenantIdentityKey]);

  const replaceUrl = useCallback(
    (mutate: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(searchParams.toString());
      mutate(sp);
      // Preserve tab / clientId
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  // Debounced search → URL (resets page)
  useEffect(() => {
    const current = searchParams.get('search') ?? '';
    if (debouncedSearch === current) return;
    replaceUrl(sp => {
      if (debouncedSearch.trim()) sp.set('search', debouncedSearch.trim());
      else sp.delete('search');
      sp.set('page', '1');
    });
  }, [debouncedSearch, replaceUrl, searchParams]);

  const queryKey = useMemo(() => {
    return [
      tenantIdentityKey ?? '__none__',
      page,
      pageSize,
      debouncedSearch.trim(),
      sortBy,
      sortOrder,
      JSON.stringify(filters),
    ].join('|');
  }, [
    tenantIdentityKey,
    page,
    pageSize,
    debouncedSearch,
    sortBy,
    sortOrder,
    filters,
  ]);

  const fetchCollection = useCallback(
    async (opts?: { force?: boolean }) => {
      const startedTenant = tenantIdentityKey;
      const requestId = ++requestIdRef.current;
      const hadRows = pageRowsRef.current.length > 0;

      if (hadRows && !opts?.force) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const qs = buildClientsCollectionQueryString({
          page,
          pageSize,
          search: debouncedSearch.trim() || undefined,
          orderBy: sortBy,
          ascending: sortOrder === 'asc',
          lastNames: filters.last_name,
          firstNames: filters.first_name,
          emails: filters.email,
          phones: filters.contact_number,
          tags: filters.tags,
          interests: filters.interest,
          hasInstruments: hasInstrumentsFromFilter(filters),
        });

        const res = await apiFetch(`/api/clients?${qs}`);
        const body = await readApiResponseEnvelope<Client[]>(
          res,
          `Failed to fetch clients (${res.status})`
        );

        if (
          requestId !== requestIdRef.current ||
          tenantRef.current !== startedTenant
        ) {
          return;
        }

        const envelope = body as unknown as CollectionEnvelope;
        const rows = Array.isArray(envelope.data) ? envelope.data : [];
        const total =
          envelope.pagination?.totalCount ??
          (typeof envelope.count === 'number' ? envelope.count : rows.length);
        const pages =
          envelope.pagination?.totalPages ??
          Math.max(1, Math.ceil(total / pageSize) || 1);

        setPageRows(rows);
        setTotalCount(total);
        setTotalPages(pages);
        setHasMore(envelope.has_more === true || page * pageSize < total);
        setError(null);

        // If current page is empty but totals say earlier pages exist (e.g. deleted
        // last row on final page), step back.
        if (rows.length === 0 && total > 0 && page > 1) {
          replaceUrl(sp => {
            sp.set('page', String(page - 1));
          });
        }
      } catch (err) {
        if (
          requestId !== requestIdRef.current ||
          tenantRef.current !== startedTenant
        ) {
          return;
        }
        if (isAuthLikeTenantError(err)) {
          setPageRows([]);
          setTotalCount(0);
          setError(err);
          return;
        }
        setError(err);
        // Preserve same-tenant rows on refetch failure
      } finally {
        if (
          requestId === requestIdRef.current &&
          tenantRef.current === startedTenant
        ) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [
      tenantIdentityKey,
      page,
      pageSize,
      debouncedSearch,
      sortBy,
      sortOrder,
      filters,
      replaceUrl,
    ]
  );

  useEffect(() => {
    void fetchCollection();
    // Intentionally keyed only by queryKey so request identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  // Filter facets (org-scoped, independent of page)
  useEffect(() => {
    const startedTenant = tenantIdentityKey;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch('/api/clients/filter-options');
        if (!res.ok) return;
        const body = await readApiResponseEnvelope<{
          lastNames: string[];
          firstNames: string[];
          emails: string[];
          contactNumbers: string[];
          tags: string[];
          interests: string[];
        }>(res, 'Failed to load filter options');
        if (cancelled || tenantRef.current !== startedTenant) return;
        const data = body.data;
        if (data) {
          setFilterOptions({
            lastNames: data.lastNames ?? [],
            firstNames: data.firstNames ?? [],
            emails: data.emails ?? [],
            contactNumbers: data.contactNumbers ?? [],
            tags: data.tags ?? [],
            interests: data.interests ?? [],
          });
        }
      } catch {
        // Facets are non-critical; keep prior options
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantIdentityKey]);

  const setPage = useCallback(
    (nextPage: number) => {
      replaceUrl(sp => {
        sp.set('page', String(Math.max(1, nextPage)));
      });
    },
    [replaceUrl]
  );

  const handleFilterChange = useCallback(
    (category: keyof FilterState, value: string) => {
      replaceUrl(sp => {
        const key = String(category);
        if (category === 'hasInstruments') {
          // Delegated to handleHasInstrumentsChange typically
          return;
        }
        const current = sp
          .getAll(key)
          .flatMap(v => v.split(','))
          .map(s => s.trim())
          .filter(Boolean);
        const exists = current.includes(value);
        const next = exists
          ? current.filter(v => v !== value)
          : [...current, value];
        sp.delete(key);
        for (const v of next) sp.append(key, v);
        sp.set('page', '1');
      });
    },
    [replaceUrl]
  );

  const handleHasInstrumentsChange = useCallback(
    (value: string) => {
      replaceUrl(sp => {
        if (!value) {
          sp.delete('hasInstruments');
        } else if (value === HAS_INSTRUMENTS_FILTER_OPTIONS.HAS) {
          sp.set('hasInstruments', 'has');
        } else if (value === HAS_INSTRUMENTS_FILTER_OPTIONS.NO) {
          sp.set('hasInstruments', 'no');
        }
        sp.set('page', '1');
      });
    },
    [replaceUrl]
  );

  const clearAllFiltersHandler = useCallback(() => {
    setSearchTerm('');
    replaceUrl(sp => {
      for (const key of Object.keys(EMPTY_FILTER_STATE)) {
        sp.delete(key);
      }
      sp.delete('hasInstruments');
      sp.delete('search');
      sp.set('page', '1');
    });
  }, [replaceUrl]);

  const handleColumnSort = useCallback(
    (column: string) => {
      const canonical = canonicalizeClientSortField(column);
      const next = nextColumnSort(sortBy, sortOrder, canonical);
      replaceUrl(sp => {
        sp.set('sortBy', next.sortBy);
        sp.set('sortOrder', next.sortOrder);
        sp.set('ascending', next.sortOrder === 'asc' ? 'true' : 'false');
        sp.set('orderBy', next.sortBy);
        sp.delete('sort_by');
        sp.delete('sort_direction');
        sp.delete('sortDirection');
        sp.set('page', '1');
      });
    },
    [replaceUrl, sortBy, sortOrder]
  );

  const getSortArrow = useCallback(
    (column: string) => clientSortArrow(sortBy, sortOrder, column),
    [sortBy, sortOrder]
  );

  const getActiveFiltersCount = useCallback(() => {
    let count = 0;
    if (searchTerm.trim()) count += 1;
    for (const key of Object.keys(filters) as (keyof FilterState)[]) {
      count += (filters[key] ?? []).length;
    }
    return count;
  }, [filters, searchTerm]);

  const cacheSelectedClient = useCallback((client: Client) => {
    setSelectedById(prev => ({ ...prev, [client.id]: client }));
  }, []);

  const fetchClientById = useCallback(
    async (clientId: string): Promise<Client | null> => {
      const startedTenant = tenantIdentityKey;
      const cached = selectedById[clientId];
      if (cached) return cached;

      const inPage = pageRows.find(c => c.id === clientId);
      if (inPage) {
        setSelectedById(prev => ({ ...prev, [clientId]: inPage }));
        return inPage;
      }

      try {
        const res = await apiFetch(
          `/api/clients?id=${encodeURIComponent(clientId)}`
        );
        if (tenantRef.current !== startedTenant) return null;
        if (!res.ok) return null;
        const body = await readApiResponseEnvelope<Client>(
          res,
          'Failed to fetch client'
        );
        if (tenantRef.current !== startedTenant) return null;
        const client = body.data;
        if (client?.id === clientId) {
          setSelectedById(prev => ({ ...prev, [clientId]: client }));
          return client;
        }
        return null;
      } catch {
        return null;
      }
    },
    [pageRows, selectedById, tenantIdentityKey]
  );

  const clearSelectedClient = useCallback((clientId?: string) => {
    if (!clientId) {
      setSelectedById({});
      return;
    }
    setSelectedById(prev => {
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
  }, []);

  return {
    // Collection rows — never treat as complete org census
    pageRows,
    totalCount,
    totalPages,
    hasMore,
    page,
    pageSize,
    loading,
    refreshing,
    error,
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    filters,
    sortBy,
    sortOrder,
    showFilters,
    setShowFilters,
    filterOptions,
    paginatedClients: pageRows,
    filteredClients: pageRows,
    handleFilterChange,
    handleHasInstrumentsChange,
    clearAllFilters: clearAllFiltersHandler,
    handleColumnSort,
    getSortArrow,
    getActiveFiltersCount,
    setPage,
    refetch: () => fetchCollection({ force: true }),
    fetchClientById,
    cacheSelectedClient,
    clearSelectedClient,
    selectedById,
  };
}
