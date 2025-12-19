import { NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
// captureException removed - withSentryRoute handles error reporting
import type { ContactLog, Client, Instrument } from '@/types';
import type { User } from '@supabase/supabase-js';
import { validateUUID } from '@/utils/inputValidation';
import { todayLocalYMD } from '@/utils/dateParsing';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';

async function getHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'ContactsAPI',
      context: 'ContactsAPI',
    },
    async () => {
      const searchParams = request.nextUrl.searchParams;
      const clientId = searchParams.get('clientId');
      const clientIdsParam = searchParams.get('clientIds'); // Batch query: comma-separated UUIDs
      const instrumentId = searchParams.get('instrumentId');
      const fromDate = searchParams.get('fromDate');
      const toDate = searchParams.get('toDate');
      const hasFollowUp = searchParams.get('hasFollowUp') === 'true';
      const followUpDate = searchParams.get('followUpDate'); // 오늘 연락해야 할 사람 필터
      const followUpDue = searchParams.get('followUpDue') === 'true'; // 오늘 및 지난 Follow-up 필터

      const supabase = getServerSupabase();
      // FIXED: Use separate queries to avoid Supabase relationship issues
      // Fetch contact logs first, then enrich with client and instrument data
      let query = supabase.from('contact_logs').select('*', { count: 'exact' });

      // Filter by client_id(s) - support both single and batch
      if (clientIdsParam) {
        // Batch query: parse comma-separated UUIDs
        const ids = clientIdsParam
          .split(',')
          .map(id => id.trim())
          .filter(id => validateUUID(id));
        if (ids.length > 0) {
          query = query.in('client_id', ids);
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

      const { data: logs, error, count } = await query;

      // 개발 환경에서 더 자세한 에러 정보 로깅
      if (error && process.env.NODE_ENV === 'development') {
        console.error('[ContactsAPI.GET] Supabase error:', {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
      }

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Fetch contact logs');
      }

      // Enrich logs with client and instrument data
      // Collect unique client_ids and instrument_ids to batch fetch
      const clientIdSet = new Set<string>();
      const instrumentIds = new Set<string>();
      (logs || []).forEach((log: ContactLog) => {
        if (log.client_id) clientIdSet.add(log.client_id);
        if (log.instrument_id) instrumentIds.add(log.instrument_id);
      });

      // Batch fetch clients and instruments
      const clientsMap = new Map<string, Client>();
      const instrumentsMap = new Map<string, Instrument>();

      if (clientIdSet.size > 0) {
        const { data: clientsData } = await supabase
          .from('clients')
          .select('*')
          .in('id', Array.from(clientIdSet));
        if (clientsData) {
          clientsData.forEach((client: Client) => {
            clientsMap.set(client.id, client);
          });
        }
      }

      if (instrumentIds.size > 0) {
        const { data: instrumentsData } = await supabase
          .from('instruments')
          .select('*')
          .in('id', Array.from(instrumentIds));
        if (instrumentsData) {
          instrumentsData.forEach((instrument: Instrument) => {
            instrumentsMap.set(instrument.id, instrument);
          });
        }
      }

      // Enrich logs with fetched data
      const enrichedLogs = (logs || []).map((log: ContactLog) => ({
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
          recordCount: enrichedLogs?.length || 0,
          totalCount: count || 0,
        },
      };
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));

async function postHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    {
      method: 'POST',
      path: 'ContactsAPI',
      context: 'ContactsAPI',
    },
    async () => {
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

      // Validation
      if (!client_id || !validateUUID(client_id)) {
        return {
          payload: { error: 'Valid client_id is required', success: false },
          status: 400,
        };
      }

      if (
        !contact_type ||
        !['email', 'phone', 'meeting', 'note', 'follow_up'].includes(
          contact_type
        )
      ) {
        return {
          payload: { error: 'Valid contact_type is required', success: false },
          status: 400,
        };
      }

      if (
        !content ||
        typeof content !== 'string' ||
        content.trim().length === 0
      ) {
        return {
          payload: { error: 'Content is required', success: false },
          status: 400,
        };
      }

      if (!contact_date) {
        return {
          payload: { error: 'contact_date is required', success: false },
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

      const supabase = getServerSupabase();

      const { data, error } = await supabase
        .from('contact_logs')
        .insert({
          client_id,
          instrument_id: instrument_id || null,
          contact_type,
          subject: subject || null,
          content: content.trim(),
          contact_date,
          next_follow_up_date: next_follow_up_date || null,
          purpose: purpose || null,
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
          contact_type,
        },
      };
    }
  );
}

export const POST = withSentryRoute(withAuthRoute(postHandler));

async function patchHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    {
      method: 'PATCH',
      path: 'ContactsAPI',
      context: 'ContactsAPI',
    },
    async () => {
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

      // Clean up updates (remove undefined values)
      const cleanUpdates: Partial<ContactLog> = {};
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

      const supabase = getServerSupabase();

      const { data, error } = await supabase
        .from('contact_logs')
        .update(cleanUpdates)
        .eq('id', id)
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

async function deleteHandler(request: NextRequest, _user: User) {
  void _user;

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
      const supabase = getServerSupabase();

      const { error } = await supabase
        .from('contact_logs')
        .delete()
        .eq('id', id);

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Delete contact log');
      }

      return {
        payload: {
          success: true,
        },
        metadata: { id },
      };
    }
  );
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));
