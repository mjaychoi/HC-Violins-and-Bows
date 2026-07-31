import { NextRequest } from 'next/server';
import { errorHandler } from '@/utils/errorHandler';
import type { ContactLog, Client, Instrument } from '@/types';
import { validateDateString, validateUUID } from '@/utils/inputValidation';
import { todayLocalYMD } from '@/utils/dateParsing';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import {
  requireAdmin,
  requireOrgContext,
} from '@/app/api/_utils/withAuthRoute';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import { logError } from '@/utils/logger';
import { mapClientsTableRowToClient } from '@/utils/clientDbMap';
import {
  claimCreateIdempotency,
  clearCreateIdempotency,
  completeCreateIdempotency,
  createRequestHash,
} from '@/app/api/_utils/createIdempotency';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const MAX_CLIENT_IDS = 50;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getOptionalNullableString(value: unknown): string | null | undefined {
  return value === null ? null : getOptionalString(value);
}

async function readJsonObject(
  request: NextRequest
): Promise<
  { ok: true; body: Record<string, unknown> } | { ok: false; error: string }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: 'Invalid JSON body' };
  }
  if (!isObject(body)) {
    return { ok: false, error: 'Invalid request body' };
  }
  return { ok: true, body };
}
const CONTACT_CREATE_ROUTE_KEY = 'POST:/api/contacts';

type ContactLogPatchPayload = {
  subject?: string | null;
  content?: string;
  contact_date?: string;
  next_follow_up_date?: string | null;
  follow_up_completed_at?: string | null;
  purpose?: string | null;
  contact_type?: ContactLog['contact_type'];
};

function parsePage(input: string | null): number {
  const parsed = Number.parseInt(input ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parsePageSize(input: string | null): number {
  const parsed = Number.parseInt(input ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE;

  return Math.min(parsed, MAX_PAGE_SIZE);
}

function parseClientIdsParam(input: string | null): {
  rawClientIds: string[];
  validClientIds: string[];
  invalidClientIds: string[];
} {
  const rawClientIds = input
    ? input
        .split(',')
        .map(id => id.trim())
        .filter(Boolean)
    : [];

  const invalidClientIds = rawClientIds.filter(id => !validateUUID(id));
  const validClientIds = rawClientIds.filter(id => validateUUID(id));

  return {
    rawClientIds,
    validClientIds,
    invalidClientIds,
  };
}

function requireIdempotencyKey(request: NextRequest) {
  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();

  if (!idempotencyKey) {
    return {
      ok: false as const,
      response: {
        payload: {
          error: 'Idempotency-Key header is required.',
          error_code: 'IDEMPOTENCY_KEY_REQUIRED',
          retryable: false,
          success: false,
        },
        status: 400,
      },
    };
  }

  return {
    ok: true as const,
    idempotencyKey,
  };
}

async function getHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'ContactsAPI',
      context: 'ContactsAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      const searchParams = request.nextUrl.searchParams;
      const clientId = searchParams.get('clientId');
      const clientIdsParam = searchParams.get('clientIds');
      const instrumentId = searchParams.get('instrumentId');
      const fromDate = searchParams.get('fromDate');
      const toDate = searchParams.get('toDate');
      const page = parsePage(searchParams.get('page'));
      const pageSize = parsePageSize(searchParams.get('pageSize'));
      const hasFollowUp = searchParams.get('hasFollowUp') === 'true';
      const followUpDate = searchParams.get('followUpDate');
      const followUpDue = searchParams.get('followUpDue') === 'true';

      const { rawClientIds, validClientIds, invalidClientIds } =
        parseClientIdsParam(clientIdsParam);

      if (clientIdsParam && rawClientIds.length === 0) {
        return {
          payload: {
            error: 'clientIds must contain at least one valid UUID.',
            success: false,
          },
          status: 400,
        };
      }

      if (rawClientIds.length > MAX_CLIENT_IDS) {
        return {
          payload: {
            error: `clientIds cannot exceed ${MAX_CLIENT_IDS} IDs`,
            success: false,
          },
          status: 400,
        };
      }

      if (invalidClientIds.length > 0) {
        return {
          payload: {
            error: 'clientIds contains invalid UUID values.',
            invalidClientIds,
            success: false,
          },
          status: 400,
        };
      }

      if (clientId && !validateUUID(clientId)) {
        return {
          payload: { error: 'Invalid clientId format', success: false },
          status: 400,
        };
      }

      if (instrumentId && !validateUUID(instrumentId)) {
        return {
          payload: { error: 'Invalid instrumentId format', success: false },
          status: 400,
        };
      }

      if (fromDate && !validateDateString(fromDate)) {
        return {
          payload: { error: 'Invalid fromDate format', success: false },
          status: 400,
        };
      }

      if (toDate && !validateDateString(toDate)) {
        return {
          payload: { error: 'Invalid toDate format', success: false },
          status: 400,
        };
      }

      if (followUpDate && !validateDateString(followUpDate)) {
        return {
          payload: { error: 'Invalid followUpDate format', success: false },
          status: 400,
        };
      }

      // Fetch contact logs first, then enrich with client and instrument data.
      let query = auth.userSupabase
        .from('contact_logs')
        .select('*', { count: 'exact' })
        .eq('org_id', auth.orgId!);

      // Filter by client_id(s): batch mode takes precedence over single clientId.
      if (clientIdsParam) {
        query = query.in('client_id', validClientIds);
      } else if (clientId) {
        query = query.eq('client_id', clientId);
      }

      if (instrumentId) {
        query = query.eq('instrument_id', instrumentId);
      }

      if (fromDate) {
        query = query.gte('contact_date', fromDate);
      }

      if (toDate) {
        query = query.lte('contact_date', toDate);
      }

      if (followUpDate) {
        query = query.eq('next_follow_up_date', followUpDate);
      } else if (followUpDue) {
        const today = todayLocalYMD();

        query = query
          .not('next_follow_up_date', 'is', null)
          .lte('next_follow_up_date', today)
          .is('follow_up_completed_at', null);
      } else if (hasFollowUp) {
        query = query.not('next_follow_up_date', 'is', null);
      }

      if (followUpDue || followUpDate) {
        query = query
          .order('next_follow_up_date', { ascending: true })
          .order('contact_date', { ascending: false });
      } else {
        query = query.order('contact_date', { ascending: false });
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data: logs, error, count } = await query.range(from, to);

      if (error && process.env.NODE_ENV === 'development') {
        logError('contacts.get.supabase_error', error, 'ContactsAPI', {
          code: error.code,
          details: error.details,
          hint: error.hint,
          path: request.nextUrl.pathname,
        });
      }

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Fetch contact logs');
      }

      const clientIdSet = new Set<string>();
      const instrumentIds = new Set<string>();

      (logs || []).forEach(log => {
        if (log.client_id) clientIdSet.add(log.client_id);
        if (log.instrument_id) instrumentIds.add(log.instrument_id);
      });

      const clientsMap = new Map<string, Client>();
      const instrumentsMap = new Map<string, Instrument>();

      if (clientIdSet.size > 0) {
        const { data: clientsData, error: clientsError } =
          await auth.userSupabase
            .from('clients')
            .select('*')
            .eq('org_id', auth.orgId!)
            .in('id', Array.from(clientIdSet));

        if (clientsError) {
          throw errorHandler.handleSupabaseError(
            clientsError,
            'Fetch contact log clients'
          );
        }

        if (clientsData) {
          clientsData.forEach(row => {
            clientsMap.set(row.id, mapClientsTableRowToClient(row));
          });
        }
      }

      if (instrumentIds.size > 0) {
        const { data: instrumentsData, error: instrumentsError } =
          await auth.userSupabase
            .from('instruments')
            .select('*')
            .eq('org_id', auth.orgId!)
            .in('id', Array.from(instrumentIds));

        if (instrumentsError) {
          throw errorHandler.handleSupabaseError(
            instrumentsError,
            'Fetch contact log instruments'
          );
        }

        if (instrumentsData) {
          instrumentsData.forEach(row => {
            instrumentsMap.set(row.id, row as unknown as Instrument);
          });
        }
      }

      const enrichedLogs = (logs || []).map(log => ({
        ...log,
        client: log.client_id ? clientsMap.get(log.client_id) || null : null,
        instrument: log.instrument_id
          ? instrumentsMap.get(log.instrument_id) || null
          : null,
      }));

      return {
        payload: {
          data: enrichedLogs,
          count: count || 0,
          total: count || 0,
          page,
          pageSize,
          success: true,
        },
        metadata: {
          clientId,
          clientIds: clientIdsParam
            ? `${validClientIds.length} clients`
            : undefined,
          instrumentId,
          fromDate,
          toDate,
          hasFollowUp,
          followUpDate,
          followUpDue,
          page,
          pageSize,
          recordCount: enrichedLogs.length,
          totalCount: count || 0,
        },
      };
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));

async function postHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'POST',
      path: 'ContactsAPI',
      context: 'ContactsAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      // Any authenticated member in an org may create contact logs. Updates and
      // deletes remain admin-only below, and every write is still scoped by
      // auth.orgId.
      const idempotency = requireIdempotencyKey(request);
      if (!idempotency.ok) {
        return idempotency.response;
      }

      const bodyResult = await readJsonObject(request);
      if (!bodyResult.ok) {
        return {
          payload: { error: bodyResult.error, success: false },
          status: 400,
        };
      }
      const b = bodyResult.body;
      const client_id = getOptionalString(b.client_id);
      const instrument_id = getOptionalString(b.instrument_id);
      const contact_type = getOptionalString(b.contact_type);
      const subject = getOptionalString(b.subject);
      const content = getOptionalString(b.content);
      const contact_date = getOptionalString(b.contact_date);
      const next_follow_up_date = getOptionalString(b.next_follow_up_date);
      const purpose = getOptionalString(b.purpose);

      const normalizedContactType =
        typeof contact_type === 'string'
          ? contact_type.trim().toLowerCase().replace(/\s+/g, '_')
          : '';

      const dbContactType =
        normalizedContactType === 'call' ? 'phone' : normalizedContactType;

      const normalizedContent =
        typeof content === 'string' && content.trim().length > 0
          ? content.trim()
          : typeof purpose === 'string' && purpose.trim().length > 0
            ? purpose.trim()
            : typeof subject === 'string' && subject.trim().length > 0
              ? subject.trim()
              : null;

      const normalizedContactDate =
        typeof contact_date === 'string' && contact_date.trim().length > 0
          ? contact_date
          : todayLocalYMD();

      if (!client_id || !validateUUID(client_id)) {
        return {
          payload: { error: 'Valid client_id is required', success: false },
          status: 400,
        };
      }

      if (
        !dbContactType ||
        !['email', 'phone', 'meeting', 'note', 'follow_up'].includes(
          dbContactType
        )
      ) {
        return {
          payload: { error: 'Valid contact_type is required', success: false },
          status: 400,
        };
      }

      if (!normalizedContent) {
        return {
          payload: { error: 'Content is required', success: false },
          status: 400,
        };
      }

      if (instrument_id && !validateUUID(instrument_id)) {
        return {
          payload: { error: 'Invalid instrument_id format', success: false },
          status: 400,
        };
      }

      if (!validateDateString(normalizedContactDate)) {
        return {
          payload: { error: 'Invalid contact_date format', success: false },
          status: 400,
        };
      }

      if (next_follow_up_date && !validateDateString(next_follow_up_date)) {
        return {
          payload: {
            error: 'Invalid next_follow_up_date format',
            success: false,
          },
          status: 400,
        };
      }

      const { data: clientRecord, error: clientError } = await auth.userSupabase
        .from('clients')
        .select('id')
        .eq('id', client_id)
        .eq('org_id', auth.orgId!)
        .maybeSingle();

      if (clientError) {
        throw errorHandler.handleSupabaseError(clientError, 'Fetch client');
      }

      if (!clientRecord) {
        return {
          payload: {
            error: 'Client not found in organization',
            success: false,
          },
          status: 400,
        };
      }

      if (instrument_id) {
        const { data: instrumentRecord, error: instrumentError } =
          await auth.userSupabase
            .from('instruments')
            .select('id')
            .eq('id', instrument_id)
            .eq('org_id', auth.orgId!)
            .maybeSingle();

        if (instrumentError) {
          throw errorHandler.handleSupabaseError(
            instrumentError,
            'Fetch instrument'
          );
        }

        if (!instrumentRecord) {
          return {
            payload: {
              error: 'Instrument not found in organization',
              success: false,
            },
            status: 400,
          };
        }
      }

      const insertPayload = {
        client_id,
        instrument_id: instrument_id || null,
        contact_type: dbContactType,
        subject: subject || null,
        content: normalizedContent,
        contact_date: normalizedContactDate,
        next_follow_up_date: next_follow_up_date || null,
        purpose: purpose || null,
        org_id: auth.orgId!,
      };

      const idempotencyClaim = await claimCreateIdempotency(
        request,
        auth,
        CONTACT_CREATE_ROUTE_KEY,
        createRequestHash(insertPayload)
      );

      if (idempotencyClaim.kind === 'replay') {
        return {
          payload: idempotencyClaim.payload,
          status: 200,
          metadata: {
            client_id,
            contact_type: dbContactType,
            idempotencyKeyPresent: true,
            idempotentReplay: true,
          },
        };
      }

      if (idempotencyClaim.kind === 'conflict') {
        return {
          payload: idempotencyClaim.payload,
          status: idempotencyClaim.status,
          metadata: {
            client_id,
            contact_type: dbContactType,
            idempotencyKeyPresent: true,
          },
        };
      }

      const idempotencyKey =
        idempotencyClaim.kind === 'claimed'
          ? idempotencyClaim.idempotencyKey
          : null;

      const { data, error } = await auth.userSupabase
        .from('contact_logs')
        .insert(insertPayload)
        .select(
          `
          *,
          client:clients(*),
          instrument:instruments(*)
        `
        )
        .single();

      if (error) {
        await clearCreateIdempotency(
          auth,
          CONTACT_CREATE_ROUTE_KEY,
          idempotencyKey
        );
        throw errorHandler.handleSupabaseError(error, 'Create contact log');
      }

      const responsePayload = {
        data,
        success: true,
      };

      await completeCreateIdempotency(
        auth,
        CONTACT_CREATE_ROUTE_KEY,
        idempotencyKey,
        responsePayload
      );

      return {
        payload: responsePayload,
        status: 201,
        metadata: {
          client_id,
          contact_type: dbContactType,
          idempotencyKeyPresent: true,
        },
      };
    }
  );
}

export const POST = withSentryRoute(withAuthRoute(postHandler));

async function patchHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'PATCH',
      path: 'ContactsAPI',
      context: 'ContactsAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: { error: 'Admin role required', success: false },
          status: 403,
        };
      }

      const bodyResult = await readJsonObject(request);
      if (!bodyResult.ok) {
        return {
          payload: { error: bodyResult.error, success: false },
          status: 400,
        };
      }
      const { id: rawId, ...updates } = bodyResult.body;
      const id = getOptionalString(rawId);

      if (!id || !validateUUID(id)) {
        return {
          payload: { error: 'Valid id is required', success: false },
          status: 400,
        };
      }

      if (
        Object.prototype.hasOwnProperty.call(updates, 'client_id') ||
        Object.prototype.hasOwnProperty.call(updates, 'instrument_id')
      ) {
        return {
          payload: {
            error:
              'Reassigning contact client_id or instrument_id is not supported',
            error_code: 'contact_reassignment_not_supported',
            success: false,
          },
          status: 400,
        };
      }

      const clientId = getOptionalString(updates.client_id);
      if (updates.client_id && (!clientId || !validateUUID(clientId))) {
        return {
          payload: { error: 'Invalid client_id format', success: false },
          status: 400,
        };
      }

      const instrumentId = getOptionalString(updates.instrument_id);
      if (
        updates.instrument_id &&
        (!instrumentId || !validateUUID(instrumentId))
      ) {
        return {
          payload: { error: 'Invalid instrument_id format', success: false },
          status: 400,
        };
      }

      const contactDate = getOptionalNullableString(updates.contact_date);
      if (
        updates.contact_date !== undefined &&
        updates.contact_date !== null &&
        (!contactDate || !validateDateString(contactDate))
      ) {
        return {
          payload: { error: 'Invalid contact_date format', success: false },
          status: 400,
        };
      }

      const nextFollowUpDate = getOptionalNullableString(
        updates.next_follow_up_date
      );
      if (
        updates.next_follow_up_date !== undefined &&
        updates.next_follow_up_date !== null &&
        updates.next_follow_up_date !== '' &&
        (!nextFollowUpDate || !validateDateString(nextFollowUpDate))
      ) {
        return {
          payload: {
            error: 'Invalid next_follow_up_date format',
            success: false,
          },
          status: 400,
        };
      }

      const contactType = getOptionalString(updates.contact_type);
      if (
        updates.contact_type &&
        (!contactType ||
          !['email', 'phone', 'meeting', 'note', 'follow_up'].includes(
            contactType
          ))
      ) {
        return {
          payload: { error: 'Invalid contact_type', success: false },
          status: 400,
        };
      }

      const cleanUpdates: ContactLogPatchPayload = {};

      const subject = getOptionalNullableString(updates.subject);
      if (updates.subject !== undefined) {
        cleanUpdates.subject = subject;
      }

      const content = getOptionalString(updates.content);
      if (updates.content !== undefined) {
        cleanUpdates.content = content?.trim();
      }

      if (updates.contact_date !== undefined && contactDate !== null) {
        cleanUpdates.contact_date = contactDate;
      }

      if (updates.next_follow_up_date !== undefined) {
        cleanUpdates.next_follow_up_date = nextFollowUpDate;
      }

      const followUpCompletedAt = getOptionalNullableString(
        updates.follow_up_completed_at
      );
      if (updates.follow_up_completed_at !== undefined) {
        cleanUpdates.follow_up_completed_at = followUpCompletedAt;
      }

      const purpose = getOptionalNullableString(updates.purpose);
      if (updates.purpose !== undefined) {
        cleanUpdates.purpose = purpose;
      }

      if (updates.contact_type !== undefined) {
        cleanUpdates.contact_type = contactType as ContactLog['contact_type'];
      }

      const { data, error } = await auth.userSupabase
        .from('contact_logs')
        .update(cleanUpdates)
        .eq('id', id)
        .eq('org_id', auth.orgId!)
        .select(
          `
          *,
          client:clients(*),
          instrument:instruments(*)
        `
        )
        .single();

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Update contact log');
      }

      return {
        payload: {
          data,
          success: true,
        },
        metadata: { id },
      };
    }
  );
}

export const PATCH = withSentryRoute(withAuthRoute(patchHandler));

async function deleteHandler(request: NextRequest, auth: AuthContext) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id || !validateUUID(id)) {
    return apiHandler(
      request,
      {
        method: 'DELETE',
        path: 'ContactsAPI',
        context: 'ContactsAPI',
      },
      async () => ({
        payload: { error: 'Valid id is required', success: false },
        status: 400,
      })
    );
  }

  return apiHandler(
    request,
    {
      method: 'DELETE',
      path: 'ContactsAPI',
      context: 'ContactsAPI',
      metadata: { id },
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: { error: 'Admin role required', success: false },
          status: 403,
        };
      }

      const { error, count } = await auth.userSupabase
        .from('contact_logs')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('org_id', auth.orgId!);

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Delete contact log');
      }

      if (!count || count === 0) {
        return {
          payload: { error: 'Contact log not found', success: false },
          status: 404,
          metadata: { id },
        };
      }

      return {
        payload: { success: true },
        metadata: { id },
      };
    }
  );
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));
