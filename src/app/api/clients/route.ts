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
import { logDebug } from '@/utils/logger';
import {
  validateClient,
  validateClientArray,
  validatePartialClient,
  validateCreateClient,
  safeValidate,
} from '@/utils/typeGuards';
import { validateUUID } from '@/utils/inputValidation';
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
import {
  claimCreateIdempotency,
  clearCreateIdempotency,
  completeCreateIdempotency,
  createRequestHash,
} from '@/app/api/_utils/createIdempotency';
import { assertClientsSchemaReadiness } from '@/app/api/_utils/schemaReadiness';
import { searchRateLimit, applyRateLimit } from '@/app/api/_utils/rateLimit';
import { writeAuditLog } from '@/utils/auditLog';
import {
  buildClientsListPayload,
  parseClientsListQuery,
  runClientsListQuery,
} from '@/app/api/clients/_utils/listQuery';

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

// -----------------------------
// GET
// -----------------------------
async function getHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    { method: 'GET', path: 'ClientsAPI', context: 'ClientsAPI' },
    async () => {
      const singleId = request.nextUrl.searchParams.get('id');
      if (singleId) {
        if (!validateUUID(singleId)) {
          return {
            payload: { error: 'Invalid client ID format', success: false },
            status: 400,
          };
        }

        if (!auth.orgId) {
          return {
            payload: { error: 'Organization context required', success: false },
            status: 403,
          };
        }

        await assertClientsSchemaReadiness({ supabase: auth.userSupabase });

        const { data, error } = await auth.userSupabase
          .from('clients')
          .select(CLIENT_TABLE_SELECT)
          .eq('id', singleId)
          .eq('org_id', auth.orgId)
          .maybeSingle();

        if (error) {
          throw errorHandler.handleSupabaseError(error, 'Fetch client');
        }

        if (!data) {
          return {
            payload: { error: 'Client not found', success: false },
            status: 404,
          };
        }

        const client = validateClient(mapClientsTableRowToClient(data));
        return {
          payload: { data: client },
          metadata: { clientId: singleId },
        };
      }

      const q = parseClientsListQuery(request);

      if (!auth.orgId) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      const { limited } = await applyRateLimit(searchRateLimit, auth.user.id);
      if (limited) {
        return {
          payload: { error: 'Too many requests', success: false },
          status: 429,
        };
      }

      await assertClientsSchemaReadiness({ supabase: auth.userSupabase });

      const { data, error, count } = await runClientsListQuery(
        auth.userSupabase,
        q,
        auth.orgId
      );

      debugQueryResult({
        dataLength: data?.length ?? 0,
        count,
        error: error
          ? { message: error.message, details: error.details, hint: error.hint }
          : null,
        page: q.page,
        pageSize: q.pageSize,
        orderBy: q.orderBy,
        ascending: q.ascending,
        search: q.search,
        all: q.all,
        hasInstruments: q.hasInstruments,
      });

      if (error) throw errorHandler.handleSupabaseError(error, 'Fetch clients');

      const rawRows = (data ?? []) as unknown[];
      const totalCount = count ?? 0;
      const { rows, payloadMeta } = buildClientsListPayload(
        rawRows,
        totalCount,
        q
      );
      const normalized = normalizeClientRows(rows);

      if (normalized.length === 0) {
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
        payload: {
          data: normalized,
          count: payloadMeta.count,
          pagination: payloadMeta.pagination,
          has_more: payloadMeta.has_more,
          truncated: payloadMeta.truncated,
          scope: payloadMeta.scope,
        },
        metadata: {
          recordCount: normalized.length,
          totalCount: payloadMeta.count,
          orderBy: q.orderBy,
          ascending: q.ascending,
          search: q.search,
          page: q.page,
          pageSize: q.pageSize,
          all: q.all,
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

      await assertClientsSchemaReadiness({ supabase: auth.userSupabase });

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

      const idempotency = await claimCreateIdempotency(
        request,
        auth,
        'POST:/api/clients',
        createRequestHash({
          name: clientName,
          email: insertRow.email,
          phone: insertRow.phone,
          tags: insertRow.tags ?? [],
          interest: insertRow.interest,
          note: insertRow.note,
        })
      );

      if (idempotency.kind === 'replay') {
        return { payload: idempotency.payload, status: 200 };
      }

      if (idempotency.kind === 'conflict') {
        return { payload: idempotency.payload, status: idempotency.status };
      }

      const idempotencyKey =
        idempotency.kind === 'claimed' ? idempotency.idempotencyKey : null;

      const { data, error } = await insertClientWithClientNumber(
        auth.userSupabase,
        auth.orgId!,
        {
          name: clientName,
          first_name: insertRow.first_name ?? null,
          last_name: insertRow.last_name ?? null,
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
        await clearCreateIdempotency(auth, 'POST:/api/clients', idempotencyKey);

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
      const payload = { data: validated };

      await completeCreateIdempotency(
        auth,
        'POST:/api/clients',
        idempotencyKey,
        payload
      );

      void writeAuditLog({
        orgId: auth.orgId!,
        actorId: auth.user.id,
        actorRole: auth.role as 'admin' | 'member' | 'service',
        action: 'client.create',
        resourceType: 'client',
        resourceId: validated.id,
      });

      return {
        payload,
        status: 201,
        metadata: {
          clientId: validated.id,
        },
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

      if (!id) {
        return { payload: { error: 'Client ID is required' }, status: 400 };
      }

      if (!validateUUID(id)) {
        return { payload: { error: 'Invalid client ID format' }, status: 400 };
      }

      const validation = safeValidate(updates, validatePartialClient);
      if (!validation.success) {
        return {
          payload: { error: `Invalid update data: ${validation.error}` },
          status: 400,
        };
      }

      const patchFields = { ...validation.data } as Partial<Client> & {
        client_number?: unknown;
      };
      delete patchFields.client_number;

      await assertClientsSchemaReadiness({ supabase: auth.userSupabase });

      const { data: currentRow, error: curErr } = await auth.userSupabase
        .from('clients')
        .select('name, first_name, last_name')
        .eq('id', id)
        .eq('org_id', auth.orgId!)
        .single();

      if (curErr || !currentRow) {
        return { payload: { error: 'Client not found' }, status: 404 };
      }

      const dbPatch = mergePartialClientIntoDbPatch(
        {
          name: typeof currentRow.name === 'string' ? currentRow.name : null,
          first_name:
            typeof currentRow.first_name === 'string'
              ? currentRow.first_name
              : null,
          last_name:
            typeof currentRow.last_name === 'string'
              ? currentRow.last_name
              : null,
        },
        patchFields
      );

      if (
        (Object.prototype.hasOwnProperty.call(dbPatch, 'first_name') ||
          Object.prototype.hasOwnProperty.call(dbPatch, 'last_name') ||
          Object.prototype.hasOwnProperty.call(dbPatch, 'name')) &&
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

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Update client');
      }

      const validated = validateClient(mapClientsTableRowToClient(data));

      void writeAuditLog({
        orgId: auth.orgId!,
        actorId: auth.user.id,
        actorRole: auth.role as 'admin' | 'member' | 'service',
        action: 'client.update',
        resourceType: 'client',
        resourceId: id,
        metadata: { changed_fields: Object.keys(dbPatch) },
      });

      return {
        payload: { data: validated },
        metadata: { clientId: id },
      };
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

      if (!id) {
        return { payload: { error: 'Client ID is required' }, status: 400 };
      }

      if (!validateUUID(id)) {
        return { payload: { error: 'Invalid client ID format' }, status: 400 };
      }

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

      void writeAuditLog({
        orgId: auth.orgId!,
        actorId: auth.user.id,
        actorRole: auth.role as 'admin' | 'member' | 'service',
        action: 'client.delete',
        resourceType: 'client',
        resourceId: id,
      });

      return {
        payload: { success: true },
        metadata: { clientId: id },
      };
    }
  );
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));
