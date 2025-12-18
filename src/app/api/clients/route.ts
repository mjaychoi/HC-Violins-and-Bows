import { NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
import { Logger } from '@/utils/logger';
// captureException removed - withSentryRoute handles error reporting
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import type { Client } from '@/types';
import type { User } from '@supabase/supabase-js';
import {
  validateClient,
  validateClientArray,
  validatePartialClient,
  validateCreateClient,
  safeValidate,
} from '@/utils/typeGuards';
import { validateSortColumn, validateUUID } from '@/utils/inputValidation';

async function getHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'ClientsAPI',
      context: 'ClientsAPI',
    },
    async () => {
      const searchParams = request.nextUrl.searchParams;
      const orderBy = validateSortColumn(
        'clients',
        searchParams.get('orderBy')
      );
      const ascending = searchParams.get('ascending') !== 'false';
      const search = searchParams.get('search') || undefined;
      const all = searchParams.get('all') === 'true'; // 전체 데이터 요청 플래그
      const limitParam = searchParams.get('limit');
      const limit = limitParam
        ? parseInt(limitParam, 10)
        : all
          ? undefined // all=true면 limit 없음
          : 1000; // 기본 limit: 1000개

      const supabase = getServerSupabase();
      let query = supabase.from('clients').select('*', { count: 'exact' });

      // Add search filter if provided
      if (search && search.length >= 2) {
        // ✅ FIXED: 특수문자 이스케이프 (검색어 특수문자에서 터지는 것 방지)
        const sanitizedSearch = search.trim().replace(/[(),%]/g, ' ');
        query = query.or(
          `last_name.ilike.%${sanitizedSearch}%,first_name.ilike.%${sanitizedSearch}%,email.ilike.%${sanitizedSearch}%`
        );
      }

      // Add limit if provided and not requesting all data
      if (limit !== undefined && limit > 0) {
        query = query.limit(limit);
      }

      query = query.order(orderBy, { ascending });

      const { data, error, count } = await query;

      // 디버깅: 쿼리 결과 로깅 (개발 환경에서만)
      if (process.env.NODE_ENV === 'development') {
        interface SupabaseErrorInfo {
          message: string;
          code?: string;
          details?: string;
          hint?: string;
        }
        const errorInfo: SupabaseErrorInfo | null = error
          ? {
              message: error.message,
              code: 'code' in error ? String(error.code) : undefined,
              details: 'details' in error ? String(error.details) : undefined,
              hint: 'hint' in error ? String(error.hint) : undefined,
            }
          : null;
        Logger.debug(
          '[ClientsAPI] Raw query result',
          {
            dataLength: data?.length || 0,
            count,
            error: errorInfo,
          },
          'ClientsAPI'
        );
      }

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Fetch clients');
      }

      // 데이터가 없는 경우 경고
      if (!data || data.length === 0) {
        Logger.warn('No clients found in database', 'ClientsAPI', { count });
        if (count && count > 0) {
          Logger.warn(
            'Count is positive but data array is empty - possible RLS issue',
            'ClientsAPI',
            { count }
          );
        }
      }

      // Preprocess data: normalize tags from null to empty array
      const normalizedData = (data || []).map(
        (
          client: Client & { tags?: string[] | null; email?: string | null }
        ) => ({
          ...client,
          tags:
            client.tags === null || client.tags === undefined
              ? []
              : client.tags,
          email: client.email === null ? null : client.email || null,
        })
      );

      const recordCount = normalizedData?.length || 0;
      const totalCount = count || 0;

      // 상세 로깅: 실제 반환된 데이터 수 확인 (개발 환경에서만)
      if (process.env.NODE_ENV === 'development') {
        Logger.debug(
          `GET /api/clients - Returning ${recordCount} clients (total: ${totalCount})`,
          {
            recordCount,
            totalCount,
          },
          'ClientsAPI'
        );
        if (recordCount === 0 && totalCount > 0) {
          Logger.warn(
            'totalCount is positive but recordCount is 0 - data may be filtered out',
            'ClientsAPI',
            {
              totalCount,
              recordCount,
            }
          );
        }
      }

      // Validate response data
      const validationResult = safeValidate(
        normalizedData || [],
        validateClientArray
      );
      const validationWarning = !validationResult.success;

      return {
        payload: {
          data: normalizedData || [],
          count: count || 0,
        },
        metadata: {
          recordCount,
          totalCount,
          orderBy,
          ascending,
          search,
          limit,
          validationWarning,
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
      path: 'ClientsAPI',
      context: 'ClientsAPI',
    },
    async () => {
      const body = await request.json();

      // Validate request body using create schema (without id and created_at)
      const validationResult = safeValidate(body, validateCreateClient);
      if (!validationResult.success) {
        return {
          payload: { error: `Invalid client data: ${validationResult.error}` },
          status: 400,
        };
      }

      // Use validated data instead of raw body
      const validatedInput = validationResult.data;

      const supabase = getServerSupabase();
      const { data, error } = await supabase
        .from('clients')
        .insert(validatedInput)
        .select()
        .single();

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Create client');
      }

      // Validate response data
      const validatedResponse = validateClient(data);

      return {
        payload: { data: validatedResponse },
        status: 201,
        metadata: { clientId: validatedResponse.id },
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
      path: 'ClientsAPI',
      context: 'ClientsAPI',
    },
    async () => {
      const body = await request.json();
      const { id, ...updates } = body;

      if (!id) {
        return {
          payload: { error: 'Client ID is required' },
          status: 400,
        };
      }

      // Validate UUID format
      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid client ID format' },
          status: 400,
        };
      }

      // Validate update data using partial schema
      const validationResult = safeValidate(updates, validatePartialClient);
      if (!validationResult.success) {
        return {
          payload: { error: `Invalid update data: ${validationResult.error}` },
          status: 400,
        };
      }

      const supabase = getServerSupabase();
      const { data, error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Update client');
      }

      // Validate response data
      const validatedData = validateClient(data);

      return {
        payload: { data: validatedData },
        metadata: { clientId: id },
      };
    }
  );
}

export const PATCH = withSentryRoute(withAuthRoute(patchHandler));

async function deleteHandler(request: NextRequest, _user: User) {
  void _user;

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return apiHandler(
      request,
      {
        method: 'DELETE',
        path: 'ClientsAPI',
        context: 'ClientsAPI',
      },
      async () => ({
        payload: { error: 'Client ID is required' },
        status: 400,
      })
    );
  }

  // Validate UUID format
  if (!validateUUID(id)) {
    return apiHandler(
      request,
      {
        method: 'DELETE',
        path: 'ClientsAPI',
        context: 'ClientsAPI',
      },
      async () => ({
        payload: { error: 'Invalid client ID format' },
        status: 400,
      })
    );
  }

  return apiHandler(
    request,
    {
      method: 'DELETE',
      path: 'ClientsAPI',
      context: 'ClientsAPI',
      metadata: { clientId: id },
    },
    async () => {
      const supabase = getServerSupabase();
      const { error } = await supabase.from('clients').delete().eq('id', id);

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Delete client');
      }

      return {
        payload: { success: true },
        metadata: { clientId: id },
      };
    }
  );
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));
