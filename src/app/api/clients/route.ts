import { NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
import { Logger } from '@/utils/logger';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import type { Client } from '@/types';
import type { User } from '@supabase/supabase-js';
import type { PostgrestError } from '@supabase/postgrest-js';
import { logWarn, logDebug } from '@/utils/logger';
import {
  validateClient,
  validateClientArray,
  validatePartialClient,
  validateCreateClient,
  safeValidate,
} from '@/utils/typeGuards';
import { validateSortColumn, validateUUID } from '@/utils/inputValidation';

const CLIENT_SELECT_COLUMNS =
  'id, client_number, first_name, last_name, email, contact_number, interest, note, tags, created_at';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;
const MAX_LIMIT = 5000;

type ListQuery = {
  orderBy: string;
  ascending: boolean;
  all: boolean;
  limit?: number;
  page?: number;
  pageSize?: number;
  shouldApplyRange: boolean;
  rangeStart?: number;
  rangeEnd?: number;
  search?: string;
};

function extractOrgId(user: User | undefined): string | undefined {
  if (!user || typeof user !== 'object') return undefined;
  const u = user as unknown as Record<string, unknown>;

  const userMeta =
    (u.user_metadata as Record<string, unknown> | undefined) ?? undefined;
  const appMeta =
    (u.app_metadata as Record<string, unknown> | undefined) ?? undefined;

  const candidates = [
    u.org_id,
    u.organization_id,
    u.orgId,
    u.organizationId,
    userMeta?.org_id,
    userMeta?.organization_id,
    appMeta?.org_id,
    appMeta?.organization_id,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c;
  }
  return undefined;
}

function isMissingColumnError(error: PostgrestError | null, column: string) {
  if (!error) return false;
  const haystack =
    `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  return haystack.includes(`column "${column.toLowerCase()}" does not exist`);
}

/**
 * PostgREST filter-string safety:
 * - remove chars that can break `or()` filter syntax
 * - cap length
 */
function sanitizeSearchForOrIlike(input: string | null): string | undefined {
  const s = (input ?? '').trim();
  if (s.length < 2) return undefined;

  const cleaned = s
    .replace(/[%_]/g, ' ')
    .replace(/[(),]/g, ' ')
    .replace(/['"\\]/g, ' ')
    .replace(/[\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96);

  return cleaned.length >= 2 ? cleaned : undefined;
}

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

function parseLimit(
  limitParam: string | null,
  all: boolean
): number | undefined {
  if (all) return undefined;
  if (!limitParam) return DEFAULT_PAGE_SIZE;

  const parsed = parsePositiveInt(limitParam, { min: 1, max: MAX_LIMIT });
  return parsed ?? DEFAULT_PAGE_SIZE;
}

function parseListQuery(
  request: NextRequest,
  user: User
): {
  q: ListQuery;
  orgId?: string;
} {
  const sp = request.nextUrl.searchParams;

  const orderBy = validateSortColumn('clients', sp.get('orderBy'));
  const ascending = sp.get('ascending') !== 'false';

  const all = sp.get('all') === 'true';

  const hasPage = sp.has('page');
  const hasPageSize = sp.has('pageSize');

  const page = parsePositiveInt(sp.get('page'), { min: 1 });
  const pageSize = parsePositiveInt(sp.get('pageSize'), {
    min: 1,
    max: MAX_PAGE_SIZE,
  });

  const resolvedPageSize =
    hasPageSize && pageSize !== undefined
      ? pageSize
      : hasPageSize
        ? DEFAULT_PAGE_SIZE
        : undefined;

  const limitFromQuery = sp.has('limit')
    ? parseLimit(sp.get('limit'), all)
    : undefined;

  // baseLimit logic (keep same behavior)
  const baseLimit = !all
    ? (limitFromQuery ??
      (hasPageSize || hasPage
        ? (resolvedPageSize ?? DEFAULT_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE))
    : undefined;

  const shouldApplyRange = baseLimit !== undefined && (hasPage || hasPageSize);
  const pageNumber = page ?? 1;

  const rangeStart =
    shouldApplyRange && typeof baseLimit === 'number'
      ? (pageNumber - 1) * baseLimit
      : undefined;
  const rangeEnd =
    typeof rangeStart === 'number'
      ? rangeStart + (baseLimit ?? 0) - 1
      : undefined;

  const search = sanitizeSearchForOrIlike(sp.get('search'));

  return {
    q: {
      orderBy,
      ascending,
      all,
      limit: baseLimit,
      page: shouldApplyRange ? pageNumber : undefined,
      pageSize: shouldApplyRange ? baseLimit : undefined,
      shouldApplyRange,
      rangeStart,
      rangeEnd,
      search,
    },
    orgId: extractOrgId(user),
  };
}

function normalizeClientRows(
  rows: Array<Client & { tags?: string[] | null; email?: string | null }>
): Client[] {
  return rows.map(c => ({
    ...c,
    tags: c.tags ?? [],
    email: c.email === null ? null : c.email || null,
  }));
}

function debugQueryResult(meta: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'development') return;
  logDebug('[ClientsAPI] Raw query result', meta, 'ClientsAPI');
}

async function runClientsQueryWithOptionalOrg(args: {
  q: ListQuery;
  orgId?: string;
}) {
  const supabase = getServerSupabase();

  const build = (applyOrgFilter: boolean) => {
    let query = supabase
      .from('clients')
      .select(CLIENT_SELECT_COLUMNS, { count: 'exact' });

    if (args.q.search) {
      const s = args.q.search;
      query = query.or(
        `last_name.ilike.%${s}%,first_name.ilike.%${s}%,email.ilike.%${s}%`
      );
    }

    if (applyOrgFilter && args.orgId) {
      query = query.eq('org_id', args.orgId);
    }

    query = query.order(args.q.orderBy, { ascending: args.q.ascending });

    if (
      args.q.shouldApplyRange &&
      args.q.rangeStart !== undefined &&
      args.q.rangeEnd !== undefined
    ) {
      query = query.range(args.q.rangeStart, args.q.rangeEnd);
    } else if (args.q.limit !== undefined) {
      query = query.limit(args.q.limit);
    }

    return query;
  };

  // Try with org filter first
  let result = await build(true);

  // If schema doesn't have org_id, retry without it
  if (isMissingColumnError(result.error, 'org_id')) {
    logWarn(
      '[ClientsAPI] org_id column missing, skipping org filter',
      'ClientsAPI'
    );
    result = await build(false);
  }

  return result;
}

// -----------------------------
// GET
// -----------------------------
async function getHandler(request: NextRequest, user: User) {
  return apiHandler(
    request,
    { method: 'GET', path: 'ClientsAPI', context: 'ClientsAPI' },
    async () => {
      const { q, orgId } = parseListQuery(request, user);

      const result = await runClientsQueryWithOptionalOrg({ q, orgId });
      const { data, error, count } = result;

      debugQueryResult({
        dataLength: data?.length ?? 0,
        count,
        error: error
          ? { message: error.message, details: error.details, hint: error.hint }
          : null,
        limit: q.limit,
        page: q.page,
        pageSize: q.pageSize,
        orderBy: q.orderBy,
        ascending: q.ascending,
        search: q.search,
      });

      if (error) throw errorHandler.handleSupabaseError(error, 'Fetch clients');

      const normalized = normalizeClientRows(
        (data ?? []) as Array<
          Client & { tags?: string[] | null; email?: string | null }
        >
      );

      const recordCount = normalized.length;
      const totalCount = count ?? 0;

      if (!data || data.length === 0) {
        Logger.warn('No clients found in database', 'ClientsAPI', { count });
        if (totalCount > 0) {
          Logger.warn(
            'Count is positive but data array is empty - possible RLS issue',
            'ClientsAPI',
            { count: totalCount }
          );
        }
      }

      const validationResult = safeValidate(normalized, validateClientArray);
      const validationWarning = !validationResult.success;

      return {
        payload: { data: normalized, count: totalCount },
        metadata: {
          recordCount,
          totalCount,
          orderBy: q.orderBy,
          ascending: q.ascending,
          search: q.search,
          limit: q.limit,
          page: q.page,
          pageSize: q.pageSize,
          validationWarning,
        },
      };
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));

// -----------------------------
// POST
// -----------------------------
async function postHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    { method: 'POST', path: 'ClientsAPI', context: 'ClientsAPI' },
    async () => {
      const body = await request.json();

      const validation = safeValidate(body, validateCreateClient);
      if (!validation.success) {
        return {
          payload: { error: `Invalid client data: ${validation.error}` },
          status: 400,
        };
      }

      const supabase = getServerSupabase();
      const { data, error } = await supabase
        .from('clients')
        .insert(validation.data)
        .select()
        .single();

      if (error) throw errorHandler.handleSupabaseError(error, 'Create client');

      const validated = validateClient(data);
      return {
        payload: { data: validated },
        status: 201,
        metadata: { clientId: validated.id },
      };
    }
  );
}

export const POST = withSentryRoute(withAuthRoute(postHandler));

// -----------------------------
// PATCH
// -----------------------------
async function patchHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    { method: 'PATCH', path: 'ClientsAPI', context: 'ClientsAPI' },
    async () => {
      const body = await request.json();
      const { id, ...updates } = body || {};

      if (!id)
        return { payload: { error: 'Client ID is required' }, status: 400 };
      if (!validateUUID(id))
        return { payload: { error: 'Invalid client ID format' }, status: 400 };

      const validation = safeValidate(updates, validatePartialClient);
      if (!validation.success) {
        return {
          payload: { error: `Invalid update data: ${validation.error}` },
          status: 400,
        };
      }

      const supabase = getServerSupabase();
      const { data, error } = await supabase
        .from('clients')
        .update(validation.data) // ✅ validated updates only
        .eq('id', id)
        .select()
        .single();

      if (error) throw errorHandler.handleSupabaseError(error, 'Update client');

      const validated = validateClient(data);
      return { payload: { data: validated }, metadata: { clientId: id } };
    }
  );
}

export const PATCH = withSentryRoute(withAuthRoute(patchHandler));

// -----------------------------
// DELETE
// -----------------------------
async function deleteHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    { method: 'DELETE', path: 'ClientsAPI', context: 'ClientsAPI' },
    async () => {
      const id = request.nextUrl.searchParams.get('id');
      if (!id)
        return { payload: { error: 'Client ID is required' }, status: 400 };
      if (!validateUUID(id))
        return { payload: { error: 'Invalid client ID format' }, status: 400 };

      const supabase = getServerSupabase();
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw errorHandler.handleSupabaseError(error, 'Delete client');

      return { payload: { success: true }, metadata: { clientId: id } };
    }
  );
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));
