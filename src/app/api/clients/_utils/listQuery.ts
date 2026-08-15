/**
 * Canonical clients collection list query parsing and PostgREST execution.
 *
 * Pagination is offset-based (page / pageSize) with a hard pageSize cap.
 * `all=true` remains for internal directory callers only (hard-capped at 1000).
 * Ordinary `/clients` list workflows must use explicit page + pageSize.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import {
  escapePostgrestFilterValue,
  sanitizeSearchForOrIlike,
  validateSortColumn,
} from '@/utils/inputValidation';
import { CLIENT_TABLE_SELECT } from '@/utils/clientDbMap';
import { sortClientNumberKeys, type ClientNumberSortKey } from './clientSort';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
/** @deprecated Internal directory callers only — hard-capped. */
export const MAX_ALL_LIMIT = 1000;
/** Legacy unbound limit param (non-all) — still capped. */
export const MAX_LIMIT = 5000;
/**
 * PostgREST key-scan page size for numeric Client Number ordering.
 * Must stay at or below the typical Data API max-rows so every matching
 * row is collected before sorting and page slicing.
 */
export const CLIENT_NUMBER_KEY_SCAN_PAGE_SIZE = 1000;

export type HasInstrumentsFilter = 'has' | 'no' | null;

export type ClientsListQuery = {
  orderBy: string;
  ascending: boolean;
  all: boolean;
  /** True when the request is the ordinary paginated collection contract. */
  paged: boolean;
  page: number;
  pageSize: number;
  rangeStart: number;
  rangeEnd: number;
  search?: string;
  lastNames: string[];
  firstNames: string[];
  emails: string[];
  phones: string[];
  tags: string[];
  interests: string[];
  hasInstruments: HasInstrumentsFilter;
};

export type ClientsPaginationMeta = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type ClientsListPayload = {
  data: unknown[];
  count: number;
  pagination: ClientsPaginationMeta;
  has_more: boolean;
  truncated: boolean;
  scope: 'paged' | 'all';
};

function parsePositiveInt(
  input: string | null,
  opts?: { min?: number; max?: number }
): number | undefined {
  if (!input) return undefined;
  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;

  const min = opts?.min ?? 1;
  const max = opts?.max ?? Number.POSITIVE_INFINITY;
  return Math.min(Math.max(parsed, min), max);
}

function parseMultiParam(sp: URLSearchParams, keys: string[]): string[] {
  const values: string[] = [];
  for (const key of keys) {
    for (const raw of sp.getAll(key)) {
      for (const part of raw.split(',')) {
        const trimmed = part.trim();
        if (trimmed) values.push(trimmed);
      }
    }
  }
  // De-dupe while preserving order
  return [...new Set(values)].slice(0, 50);
}

function parseHasInstruments(sp: URLSearchParams): HasInstrumentsFilter {
  const raw = (sp.get('hasInstruments') ?? sp.get('has_instruments') ?? '')
    .trim()
    .toLowerCase();

  if (!raw) return null;
  if (
    raw === 'has' ||
    raw === 'has instruments' ||
    raw === 'true' ||
    raw === '1'
  ) {
    return 'has';
  }
  if (
    raw === 'no' ||
    raw === 'no instruments' ||
    raw === 'false' ||
    raw === '0'
  ) {
    return 'no';
  }
  return null;
}

function parseSortDirection(sp: URLSearchParams): boolean {
  const sortDirection = (
    sp.get('sort_direction') ??
    sp.get('sortDirection') ??
    ''
  )
    .trim()
    .toLowerCase();

  if (sortDirection === 'asc' || sortDirection === 'ascending') return true;
  if (sortDirection === 'desc' || sortDirection === 'descending') return false;

  // Legacy: ascending=false means descending; default ascending=true.
  return sp.get('ascending') !== 'false';
}

/**
 * Parse list query. Invalid page/pageSize values are normalized (clamped)
 * to match invoices/instruments API policy rather than hard-400.
 */
export function parseClientsListQuery(request: NextRequest): ClientsListQuery {
  const sp = request.nextUrl.searchParams;

  const sortByRaw = sp.get('sort_by') ?? sp.get('sortBy') ?? sp.get('orderBy');
  const orderBy = validateSortColumn('clients', sortByRaw);
  const ascending = parseSortDirection(sp);

  const all = sp.get('all') === 'true';

  const requestedPage = parsePositiveInt(sp.get('page'), { min: 1 }) ?? 1;
  const requestedPageSize =
    parsePositiveInt(sp.get('pageSize') ?? sp.get('page_size'), {
      min: 1,
      max: MAX_PAGE_SIZE,
    }) ?? DEFAULT_PAGE_SIZE;

  // Legacy `limit` without page — treat as pageSize for non-all requests
  const legacyLimit = !all
    ? parsePositiveInt(sp.get('limit'), { min: 1, max: MAX_PAGE_SIZE })
    : undefined;

  const pageSize = all
    ? MAX_ALL_LIMIT
    : legacyLimit && !sp.has('pageSize') && !sp.has('page_size')
      ? legacyLimit
      : requestedPageSize;

  const page = all ? 1 : requestedPage;
  const rangeStart = (page - 1) * pageSize;
  const rangeEnd = rangeStart + pageSize - 1;

  const search = sanitizeSearchForOrIlike(sp.get('search'));

  return {
    orderBy,
    ascending,
    all,
    paged: !all,
    page,
    pageSize,
    rangeStart,
    rangeEnd,
    search,
    lastNames: parseMultiParam(sp, ['last_name', 'lastName']),
    firstNames: parseMultiParam(sp, ['first_name', 'firstName']),
    emails: parseMultiParam(sp, ['email']),
    phones: parseMultiParam(sp, ['phone', 'contact_number', 'contactNumber']),
    tags: parseMultiParam(sp, ['tags', 'tag']),
    interests: parseMultiParam(sp, ['interest', 'interests']),
    hasInstruments: parseHasInstruments(sp),
  };
}

function buildSearchOrFilter(search: string): string {
  const s = escapePostgrestFilterValue(search);
  // Fields the /clients UI historically searched, mapped to DB columns.
  return [
    `name.ilike.%${s}%`,
    `first_name.ilike.%${s}%`,
    `last_name.ilike.%${s}%`,
    `email.ilike.%${s}%`,
    `phone.ilike.%${s}%`,
    `client_number.ilike.%${s}%`,
    `interest.ilike.%${s}%`,
    `note.ilike.%${s}%`,
  ].join(',');
}

function applyInFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  column: string,
  values: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (values.length === 0) return query;
  if (values.length === 1) return query.eq(column, values[0]);
  return query.in(column, values);
}

/**
 * Resolve client IDs that have at least one instrument relationship in-org.
 * Used for hasInstruments filter when an !inner select would complicate mapping.
 */
export async function fetchClientIdsWithInstruments(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ ids: string[]; error: unknown | null }> {
  const { data, error } = await supabase
    .from('client_instruments')
    .select('client_id')
    .eq('org_id', orgId);

  if (error) return { ids: [], error };

  const ids = [
    ...new Set(
      (data ?? [])
        .map(row =>
          row && typeof row === 'object' && 'client_id' in row
            ? String((row as { client_id: string }).client_id)
            : ''
        )
        .filter(Boolean)
    ),
  ];
  return { ids, error: null };
}

async function applyHasInstrumentsFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  supabase: SupabaseClient,
  q: ClientsListQuery,
  orgId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ query: any; error: unknown | null; empty?: boolean }> {
  if (!q.hasInstruments) return { query, error: null };

  const { ids, error } = await fetchClientIdsWithInstruments(supabase, orgId);
  if (error) {
    return { query, error };
  }

  if (q.hasInstruments === 'has') {
    if (ids.length === 0) {
      return { query, error: null, empty: true };
    }
    return { query: query.in('id', ids), error: null };
  }

  if (ids.length > 0) {
    return { query: query.not('id', 'in', `(${ids.join(',')})`), error: null };
  }
  return { query, error: null };
}

function applyClientsListFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  q: ClientsListQuery
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (q.search) {
    query = query.or(buildSearchOrFilter(q.search));
  }

  query = applyInFilter(query, 'last_name', q.lastNames);
  query = applyInFilter(query, 'first_name', q.firstNames);
  query = applyInFilter(query, 'email', q.emails);
  query = applyInFilter(query, 'phone', q.phones);
  query = applyInFilter(query, 'interest', q.interests);

  for (const tag of q.tags) {
    query = query.contains('tags', [tag]);
  }

  return query;
}

function reorderRowsByIds(rows: unknown[], orderedIds: string[]): unknown[] {
  const byId = new Map<string, unknown>();
  for (const row of rows) {
    if (row && typeof row === 'object' && 'id' in row) {
      byId.set(String((row as { id: unknown }).id), row);
    }
  }
  return orderedIds.map(id => byId.get(id)).filter(row => row !== undefined);
}

/**
 * Globally numeric-sort Client Number across the filtered set, then slice.
 * Uses existing `client_number` text (no schema change). Keys are scanned in
 * id-stable chunks so PostgREST max-rows cannot silently truncate the order.
 */
async function runNumericClientNumberListQuery(
  supabase: SupabaseClient,
  q: ClientsListQuery,
  orgId: string
) {
  let instrumentClientIds: string[] | null = null;
  if (q.hasInstruments) {
    const { ids, error } = await fetchClientIdsWithInstruments(supabase, orgId);
    if (error) {
      return { data: null, error, count: null };
    }
    if (q.hasInstruments === 'has' && ids.length === 0) {
      return { data: [], error: null, count: 0 };
    }
    instrumentClientIds = ids;
  }

  const keys: ClientNumberSortKey[] = [];
  let from = 0;
  let totalCount = 0;

  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let keyQuery: any = supabase
      .from('clients')
      .select('id, client_number', { count: 'exact' })
      .eq('org_id', orgId);

    keyQuery = applyClientsListFilters(keyQuery, q);
    if (q.hasInstruments === 'has' && instrumentClientIds) {
      keyQuery = keyQuery.in('id', instrumentClientIds);
    } else if (
      q.hasInstruments === 'no' &&
      instrumentClientIds &&
      instrumentClientIds.length > 0
    ) {
      keyQuery = keyQuery.not('id', 'in', `(${instrumentClientIds.join(',')})`);
    }

    keyQuery = keyQuery.order('id', { ascending: true });
    const to = from + CLIENT_NUMBER_KEY_SCAN_PAGE_SIZE - 1;
    const { data, error, count } = await keyQuery.range(from, to);

    if (error) {
      return { data: null, error, count: null };
    }

    const page = (data ?? []) as ClientNumberSortKey[];
    if (typeof count === 'number') {
      totalCount = count;
    }
    keys.push(...page);

    if (
      page.length === 0 ||
      page.length < CLIENT_NUMBER_KEY_SCAN_PAGE_SIZE ||
      (typeof count === 'number' && keys.length >= count)
    ) {
      break;
    }
    from += CLIENT_NUMBER_KEY_SCAN_PAGE_SIZE;
  }

  if (keys.length > totalCount) {
    totalCount = keys.length;
  } else if (totalCount === 0) {
    totalCount = keys.length;
  }

  const sorted = sortClientNumberKeys(keys, q.ascending);
  const window = q.all
    ? sorted.slice(0, q.pageSize + 1)
    : sorted.slice(q.rangeStart, q.rangeEnd + 1);
  const pageIds = window.map(row => row.id);

  if (pageIds.length === 0) {
    return { data: [], error: null, count: totalCount };
  }

  const { data: fullRows, error: fullError } = await supabase
    .from('clients')
    .select(CLIENT_TABLE_SELECT)
    .eq('org_id', orgId)
    .in('id', pageIds);

  if (fullError) {
    return { data: null, error: fullError, count: null };
  }

  return {
    data: reorderRowsByIds(fullRows ?? [], pageIds),
    error: null,
    count: totalCount,
  };
}

export async function runClientsListQuery(
  supabase: SupabaseClient,
  q: ClientsListQuery,
  orgId: string
) {
  if (q.orderBy === 'client_number') {
    return runNumericClientNumberListQuery(supabase, q, orgId);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('clients')
    .select(CLIENT_TABLE_SELECT, { count: 'exact' })
    .eq('org_id', orgId);

  query = applyClientsListFilters(query, q);

  const filtered = await applyHasInstrumentsFilter(query, supabase, q, orgId);
  if (filtered.error) {
    return { data: null, error: filtered.error, count: null };
  }
  if (filtered.empty) {
    return { data: [], error: null, count: 0 };
  }
  query = filtered.query;

  // Deterministic ordering: primary + stable secondary on id
  query = query.order(q.orderBy, { ascending: q.ascending });
  if (q.orderBy !== 'id') {
    query = query.order('id', { ascending: true });
  }

  if (q.all) {
    query = query.limit(q.pageSize + 1);
  } else {
    query = query.range(q.rangeStart, q.rangeEnd);
  }

  return query;
}

export function buildClientsListPayload(
  rows: unknown[],
  totalCount: number,
  q: ClientsListQuery
): {
  rows: unknown[];
  payloadMeta: Omit<ClientsListPayload, 'data'>;
} {
  let truncated = false;
  let resultRows = rows;

  if (q.all && rows.length > MAX_ALL_LIMIT) {
    truncated = true;
    resultRows = rows.slice(0, MAX_ALL_LIMIT);
  }

  const pageSize = q.all ? resultRows.length : q.pageSize;
  const totalPages = q.all
    ? 1
    : Math.max(1, Math.ceil(totalCount / q.pageSize) || 1);
  const hasMore = q.all ? truncated : q.page * q.pageSize < totalCount;

  return {
    rows: resultRows,
    payloadMeta: {
      count: totalCount,
      pagination: {
        page: q.page,
        pageSize,
        totalCount,
        totalPages,
      },
      has_more: hasMore,
      truncated,
      scope: q.all ? 'all' : 'paged',
    },
  };
}

/**
 * Build a URL query string for the paginated collection (frontend helper).
 */
export function buildClientsCollectionQueryString(params: {
  page: number;
  pageSize: number;
  search?: string;
  orderBy?: string;
  ascending?: boolean;
  lastNames?: string[];
  firstNames?: string[];
  emails?: string[];
  phones?: string[];
  tags?: string[];
  interests?: string[];
  hasInstruments?: HasInstrumentsFilter;
}): string {
  const sp = new URLSearchParams();
  sp.set('page', String(Math.max(1, params.page)));
  sp.set(
    'pageSize',
    String(Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize)))
  );

  if (params.search?.trim()) {
    sp.set('search', params.search.trim());
  }

  if (params.orderBy) {
    sp.set('orderBy', params.orderBy);
  }
  sp.set('ascending', params.ascending === true ? 'true' : 'false');

  const appendAll = (key: string, values?: string[]) => {
    for (const v of values ?? []) {
      if (v.trim()) sp.append(key, v.trim());
    }
  };

  appendAll('last_name', params.lastNames);
  appendAll('first_name', params.firstNames);
  appendAll('email', params.emails);
  appendAll('contact_number', params.phones);
  appendAll('tags', params.tags);
  appendAll('interest', params.interests);

  if (params.hasInstruments === 'has') {
    sp.set('hasInstruments', 'has');
  } else if (params.hasInstruments === 'no') {
    sp.set('hasInstruments', 'no');
  }

  return sp.toString();
}
