import { NextRequest } from 'next/server';
import { errorHandler } from '@/utils/errorHandler';
import { Logger } from '@/utils/logger';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import {
  requireAdmin,
  requireOrgContext,
} from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import type { Client } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logDebug } from '@/utils/logger';
import {
  validateClient,
  validateClientArray,
  validatePartialClient,
  validateCreateClient,
  safeValidate,
} from '@/utils/typeGuards';
import { validateSortColumn, validateUUID } from '@/utils/inputValidation';
import {
  CLIENT_TABLE_SELECT,
  createClientInputToDbRow,
  mapClientsTableRowToClient,
  mergePartialClientIntoDbPatch,
  type ClientsTableRow,
} from '@/utils/clientDbMap';
import {
  insertClientWithClientNumber,
  isClientNumberAllocationExhausted,
} from '@/app/api/_utils/insertClientWithAllocatedNumber';

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

function parseListQuery(request: NextRequest): { q: ListQuery } {
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
  };
}

function normalizeClientRows(rows: unknown[]): Client[] {
  return rows.map(raw =>
    mapClientsTableRowToClient(
      raw as Parameters<typeof mapClientsTableRowToClient>[0]
    )
  );
}

function debugQueryResult(meta: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'development') return;
  logDebug('[ClientsAPI] Raw query result', meta, 'ClientsAPI');
}

async function runClientsQuery(
  supabase: SupabaseClient,
  q: ListQuery,
  orgId: string
) {
  let query = supabase
    .from('clients')
    .select(CLIENT_TABLE_SELECT, { count: 'exact' })
    .eq('org_id', orgId);

  if (q.search) {
    const s = q.search;
    query = query.or(`name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
  }

  query = query.order(q.orderBy, { ascending: q.ascending });

  if (
    q.shouldApplyRange &&
    q.rangeStart !== undefined &&
    q.rangeEnd !== undefined
  ) {
    query = query.range(q.rangeStart, q.rangeEnd);
  } else if (q.limit !== undefined) {
    query = query.limit(q.limit);
  }

  return query;
}

// -----------------------------
// GET
// -----------------------------
async function getHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    { method: 'GET', path: 'ClientsAPI', context: 'ClientsAPI' },
    async () => {
      const { q } = parseListQuery(request);
      if (!auth.orgId) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      const query = runClientsQuery(auth.userSupabase, q, auth.orgId!);
      const { data, error, count } = await query;

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

      const normalized = normalizeClientRows(data ?? []);

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
async function postHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    { method: 'POST', path: 'ClientsAPI', context: 'ClientsAPI' },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: { error: 'Admin role required' },
          status: 403,
        };
      }

      const body = await request.json();

      const validation = safeValidate(body, validateCreateClient);
      if (!validation.success) {
        return {
          payload: { error: `Invalid client data: ${validation.error}` },
          status: 400,
        };
      }

      const raw = validation.data;
      // client_number is always server-assigned for standard create (ignore request body)
      const insertRow = createClientInputToDbRow({
        ...raw,
        client_number: null,
        tags: raw.tags ?? [],
      });
      const clientName = insertRow.name.trim();
      if (!clientName) {
        return {
          payload: { error: 'Client name is required' },
          status: 400,
        };
      }

      const { data, error } = await insertClientWithClientNumber(
        auth.userSupabase,
        auth.orgId!,
        {
          name: clientName,
          email: insertRow.email,
          phone: insertRow.phone,
          client_number: insertRow.client_number,
          tags: insertRow.tags ?? [],
          interest: insertRow.interest,
          note: insertRow.note,
        },
        CLIENT_TABLE_SELECT
      );

      if (error) {
        if (error.code === '23505') {
          if (isClientNumberAllocationExhausted(error)) {
            return {
              status: 409,
              payload: {
                error:
                  'Could not assign a client number after several attempts (high load). Please try again in a moment.',
                error_code: 'client_number_allocation_exhausted',
                retryable: true,
              },
            };
          }
          const hint =
            `${error.details ?? ''} ${error.message ?? ''}`.toLowerCase();
          const isClientNumber =
            hint.includes('client_number') ||
            hint.includes('idx_clients_org_id_client_number');
          return {
            status: 409,
            payload: {
              error: isClientNumber
                ? 'This client number is already in use for your organization.'
                : 'A record with the same unique value already exists.',
            },
          };
        }
        throw errorHandler.handleSupabaseError(error, 'Create client');
      }

      const validated = validateClient(
        mapClientsTableRowToClient(data as ClientsTableRow)
      );
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
async function patchHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    { method: 'PATCH', path: 'ClientsAPI', context: 'ClientsAPI' },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: { error: 'Admin role required' },
          status: 403,
        };
      }

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

      const { data: currentRow, error: curErr } = await auth.userSupabase
        .from('clients')
        .select('name')
        .eq('id', id)
        .eq('org_id', auth.orgId!)
        .single();

      if (curErr || !currentRow) {
        return { payload: { error: 'Client not found' }, status: 404 };
      }

      const dbPatch = mergePartialClientIntoDbPatch(
        typeof currentRow.name === 'string' ? currentRow.name : null,
        validation.data
      );
      if (
        Object.prototype.hasOwnProperty.call(dbPatch, 'name') &&
        typeof dbPatch.name === 'string' &&
        dbPatch.name.trim() === ''
      ) {
        return {
          payload: { error: 'Client name is required' },
          status: 400,
        };
      }

      if (Object.keys(dbPatch).length === 0) {
        return {
          payload: { error: 'No updatable fields provided' },
          status: 400,
        };
      }

      const { data, error } = await auth.userSupabase
        .from('clients')
        .update(dbPatch)
        .eq('id', id)
        .eq('org_id', auth.orgId!)
        .select(CLIENT_TABLE_SELECT)
        .single();

      if (error) throw errorHandler.handleSupabaseError(error, 'Update client');

      const validated = validateClient(mapClientsTableRowToClient(data));
      return { payload: { data: validated }, metadata: { clientId: id } };
    }
  );
}

export const PATCH = withSentryRoute(withAuthRoute(patchHandler));

// -----------------------------
// DELETE
// -----------------------------
async function deleteHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    { method: 'DELETE', path: 'ClientsAPI', context: 'ClientsAPI' },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: { error: 'Admin role required' },
          status: 403,
        };
      }

      const id = request.nextUrl.searchParams.get('id');
      if (!id)
        return { payload: { error: 'Client ID is required' }, status: 400 };
      if (!validateUUID(id))
        return { payload: { error: 'Invalid client ID format' }, status: 400 };

      // userSupabase + RLS prevents cross-tenant deletes
      const { error, count } = await auth.userSupabase
        .from('clients')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('org_id', auth.orgId!);

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Delete client');
      }

      if (!count || count === 0) {
        return { payload: { error: 'Client not found' }, status: 404 };
      }

      return { payload: { success: true }, metadata: { clientId: id } };
    }
  );
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));
