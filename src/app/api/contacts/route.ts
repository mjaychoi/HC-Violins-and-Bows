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

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const MAX_CLIENT_IDS = 50;

function parsePage(input: string | null): number {
  const parsed = Number.parseInt(input ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parsePageSize(input: string | null): number {
  const parsed = Number.parseInt(input ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(parsed, MAX_PAGE_SIZE);
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
      const clientIdsParam = searchParams.get('clientIds'); // Batch query: comma-separated UUIDs
      const instrumentId = searchParams.get('instrumentId');
      const fromDate = searchParams.get('fromDate');
      const toDate = searchParams.get('toDate');
      const page = parsePage(searchParams.get('page'));
      const pageSize = parsePageSize(searchParams.get('pageSize'));
      const hasFollowUp = searchParams.get('hasFollowUp') === 'true';
      const followUpDate = searchParams.get('followUpDate'); // 오늘 연락해야 할 사람 필터
      const followUpDue = searchParams.get('followUpDue') === 'true'; // 오늘 및 지난 Follow-up 필터

      const batchClientIds = clientIdsParam
        ? clientIdsParam
            .split(',')
            .map(id => id.trim())
            .filter(id => validateUUID(id))
        : [];

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

      if (batchClientIds.length > MAX_CLIENT_IDS) {
        return {
          payload: {
            error: `clientIds cannot exceed ${MAX_CLIENT_IDS} IDs`,
            success: false,
          },
          status: 400,
        };
      }

      // FIXED: Use separate queries to avoid Supabase relationship issues
      // Fetch contact logs first, then enrich with client and instrument data
      let query = auth.userSupabase
        .from('contact_logs')
        .select('*', { count: 'exact' })
        .eq('org_id', auth.orgId!);

      // Filter by client_id(s) - support both single and batch
      if (clientIdsParam) {
        if (batchClientIds.length > 0) {
          query = query.in('client_id', batchClientIds);
        }
      } else if (clientId && validateUUID(clientId)) {
        // Single client query (backward compatibility)
        query = query.eq('client_id', clientId);
      }

      // Filter by instrument_id
      if (instrumentId && validateUUID(instrumentId)) {
        query = query.eq('instrument_id', instrumentId);
      }

      // Filter by date range
      if (fromDate) {
        query = query.gte('contact_date', fromDate);
      }
      if (toDate) {
        query = query.lte('contact_date', toDate);
      }

      // Filter by follow-up date (오늘 연락해야 할 사람)
      if (followUpDate) {
        query = query.eq('next_follow_up_date', followUpDate);
      } else if (followUpDue) {
        // FIXED: Get today and overdue follow-ups (next_follow_up_date <= today AND not null AND not completed)
        // Use todayLocalYMD() utility to avoid timezone bugs (single source of truth)
        const today = todayLocalYMD(); // local date 기준
        query = query
          .not('next_follow_up_date', 'is', null)
          .lte('next_follow_up_date', today)
          .is('follow_up_completed_at', null); // Only incomplete follow-ups
      } else if (hasFollowUp) {
        // Follow-up이 있는 것만
        query = query.not('next_follow_up_date', 'is', null);
      }

      // FIXED: Order by next_follow_up_date for follow-up queries, contact_date otherwise
      if (followUpDue || followUpDate) {
        // Follow-up 대시보드: next_follow_up_date가 급한 순, 같은 날짜면 최근 contact_date 순
        query = query
          .order('next_follow_up_date', { ascending: true })
          .order('contact_date', { ascending: false });
      } else {
        // 일반 조회: contact_date 최신순
        query = query.order('contact_date', { ascending: false });
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data: logs, error, count } = await query.range(from, to);

      // 개발 환경에서 더 자세한 에러 정보 로깅
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

      // Enrich logs with client and instrument data
      // Collect unique client_ids and instrument_ids to batch fetch
      const clientIdSet = new Set<string>();
      const instrumentIds = new Set<string>();
      (logs || []).forEach(log => {
        if (log.client_id) clientIdSet.add(log.client_id);
        if (log.instrument_id) instrumentIds.add(log.instrument_id);
      });

      // Batch fetch clients and instruments
      const clientsMap = new Map<string, Client>();
      const instrumentsMap = new Map<string, Instrument>();

      if (clientIdSet.size > 0) {
        const { data: clientsData } = await auth.userSupabase
          .from('clients')
          .select('*')
          .eq('org_id', auth.orgId!)
          .in('id', Array.from(clientIdSet));
        if (clientsData) {
          clientsData.forEach(row => {
            clientsMap.set(row.id, mapClientsTableRowToClient(row));
          });
        }
      }

      if (instrumentIds.size > 0) {
        const { data: instrumentsData } = await auth.userSupabase
          .from('instruments')
          .select('*')
          .eq('org_id', auth.orgId!)
          .in('id', Array.from(instrumentIds));
        if (instrumentsData) {
          instrumentsData.forEach(row => {
            // DB status is string|null; domain type is stricter enum — cast is safe here
            instrumentsMap.set(row.id, row as unknown as Instrument);
          });
        }
      }

      // Enrich logs with fetched data
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
            ? `${clientIdsParam.split(',').length} clients`
            : undefined,
          instrumentId,
          fromDate,
          toDate,
          hasFollowUp,
          followUpDate,
          followUpDue,
          page,
          pageSize,
          recordCount: enrichedLogs?.length || 0,
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

      const body = await request.json();
      const {
        client_id,
        instrument_id,
        contact_type,
        subject,
        content,
        contact_date,
        next_follow_up_date,
        purpose,
      } = body;
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

      // Validation
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

      // Validate instrument_id if provided
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

      const { data, error } = await auth.userSupabase
        .from('contact_logs')
        .insert({
          client_id,
          instrument_id: instrument_id || null,
          contact_type: dbContactType,
          subject: subject || null,
          content: normalizedContent,
          contact_date: normalizedContactDate,
          next_follow_up_date: next_follow_up_date || null,
          purpose: purpose || null,
          org_id: auth.orgId!,
        })
        .select(
          `
          *,
          client:clients(*),
          instrument:instruments(*)
        `
        )
        .single();

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Create contact log');
      }

      return {
        payload: {
          data,
          success: true,
        },
        status: 201,
        metadata: {
          client_id,
          contact_type: dbContactType,
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

      const body = await request.json();
      const { id, ...updates } = body;

      if (!id || !validateUUID(id)) {
        return {
          payload: { error: 'Valid id is required', success: false },
          status: 400,
        };
      }

      // Validate updates
      if (updates.client_id && !validateUUID(updates.client_id)) {
        return {
          payload: { error: 'Invalid client_id format', success: false },
          status: 400,
        };
      }

      if (updates.instrument_id && !validateUUID(updates.instrument_id)) {
        return {
          payload: { error: 'Invalid instrument_id format', success: false },
          status: 400,
        };
      }

      if (
        updates.contact_date !== undefined &&
        updates.contact_date !== null &&
        !validateDateString(updates.contact_date)
      ) {
        return {
          payload: { error: 'Invalid contact_date format', success: false },
          status: 400,
        };
      }

      if (
        updates.next_follow_up_date !== undefined &&
        updates.next_follow_up_date !== null &&
        updates.next_follow_up_date !== '' &&
        !validateDateString(updates.next_follow_up_date)
      ) {
        return {
          payload: {
            error: 'Invalid next_follow_up_date format',
            success: false,
          },
          status: 400,
        };
      }

      if (
        updates.contact_type &&
        !['email', 'phone', 'meeting', 'note', 'follow_up'].includes(
          updates.contact_type
        )
      ) {
        return {
          payload: { error: 'Invalid contact_type', success: false },
          status: 400,
        };
      }

      // Clean up updates (remove undefined values and relation-only fields)
      const cleanUpdates: Partial<Omit<ContactLog, 'client' | 'instrument'>> =
        {};
      if (updates.subject !== undefined) cleanUpdates.subject = updates.subject;
      if (updates.content !== undefined)
        cleanUpdates.content = updates.content?.trim();
      if (updates.contact_date !== undefined)
        cleanUpdates.contact_date = updates.contact_date;
      if (updates.next_follow_up_date !== undefined)
        cleanUpdates.next_follow_up_date = updates.next_follow_up_date;
      if (updates.follow_up_completed_at !== undefined)
        cleanUpdates.follow_up_completed_at = updates.follow_up_completed_at;
      if (updates.purpose !== undefined) cleanUpdates.purpose = updates.purpose;
      if (updates.contact_type !== undefined)
        cleanUpdates.contact_type = updates.contact_type;

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
