import { NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
// captureException removed - withSentryRoute handles error reporting
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import type { User } from '@supabase/supabase-js';
import {
  validateInstrument,
  validateInstrumentArray,
  validatePartialInstrument,
  validateCreateInstrument,
  safeValidate,
} from '@/utils/typeGuards';
import { validateSortColumn, validateUUID } from '@/utils/inputValidation';

async function getHandler(request: NextRequest, _user: User) {
  void _user;

  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'InstrumentsAPI',
      context: 'InstrumentsAPI',
    },
    async () => {
      const searchParams = request.nextUrl.searchParams;
      const orderBy = validateSortColumn(
        'instruments',
        searchParams.get('orderBy')
      );
      const ascending = searchParams.get('ascending') !== 'false';
      const ownership = searchParams.get('ownership') || undefined;
      const search = searchParams.get('search') || undefined;
      const all = searchParams.get('all') === 'true'; // 전체 데이터 요청 플래그
      const limitParam = searchParams.get('limit');
      const limit = limitParam
        ? parseInt(limitParam, 10)
        : all
          ? undefined // all=true면 limit 없음
          : 1000; // 기본 limit: 1000개

      const supabase = getServerSupabase();
      let query = supabase.from('instruments').select('*', { count: 'exact' });

      // Add ownership filter if provided
      if (ownership) {
        query = query.eq('ownership', ownership);
      }

      // Add search filter if provided
      if (search && search.length >= 2) {
        // ✅ FIXED: 특수문자 이스케이프 (검색어 특수문자에서 터지는 것 방지)
        const sanitizedSearch = search.trim().replace(/[(),%]/g, ' ');
        query = query.or(
          `maker.ilike.%${sanitizedSearch}%,type.ilike.%${sanitizedSearch}%,subtype.ilike.%${sanitizedSearch}%,serial_number.ilike.%${sanitizedSearch}%`
        );
      }

      // Add limit if provided and not requesting all data
      if (limit !== undefined && limit > 0) {
        query = query.limit(limit);
      }

      query = query.order(orderBy, { ascending });

      const { data, error, count } = await query;

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Fetch instruments');
      }

      // Validate response data
      const validationResult = safeValidate(
        data || [],
        validateInstrumentArray
      );
      const validationWarning = !validationResult.success;

      return {
        payload: {
          data: data || [],
          count: count || 0,
        },
        metadata: {
          recordCount: data?.length || 0,
          totalCount: count || 0,
          orderBy,
          ascending,
          ownership,
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
      path: 'InstrumentsAPI',
      context: 'InstrumentsAPI',
    },
    async () => {
      const body = await request.json();

      // Validate request body using create schema (without id and created_at)
      const validationResult = safeValidate(body, validateCreateInstrument);
      if (!validationResult.success) {
        return {
          payload: {
            error: `Invalid instrument data: ${validationResult.error}`,
          },
          status: 400,
        };
      }

      // Use validated data instead of raw body
      const validatedInput = validationResult.data;

      const supabase = getServerSupabase();
      const { data, error } = await supabase
        .from('instruments')
        .insert(validatedInput)
        .select()
        .single();

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Create instrument');
      }

      // Validate response data
      const validatedResponse = validateInstrument(data);

      return {
        payload: { data: validatedResponse },
        status: 201,
        metadata: { instrumentId: validatedResponse.id },
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
      path: 'InstrumentsAPI',
      context: 'InstrumentsAPI',
    },
    async () => {
      const body = await request.json();
      const { id, ...updates } = body;

      if (!id) {
        return {
          payload: { error: 'Instrument ID is required' },
          status: 400,
        };
      }

      // Validate UUID format
      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid instrument ID format' },
          status: 400,
        };
      }

      // Validate update data using partial schema
      const validationResult = safeValidate(updates, validatePartialInstrument);
      if (!validationResult.success) {
        return {
          payload: { error: `Invalid update data: ${validationResult.error}` },
          status: 400,
        };
      }

      const supabase = getServerSupabase();
      const { data, error } = await supabase
        .from('instruments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Update instrument');
      }

      // Validate response data
      const validatedData = validateInstrument(data);

      return {
        payload: { data: validatedData },
        metadata: { instrumentId: id },
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
        path: 'InstrumentsAPI',
        context: 'InstrumentsAPI',
      },
      async () => ({
        payload: { error: 'Instrument ID is required' },
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
        path: 'InstrumentsAPI',
        context: 'InstrumentsAPI',
      },
      async () => ({
        payload: { error: 'Invalid instrument ID format' },
        status: 400,
      })
    );
  }

  return apiHandler(
    request,
    {
      method: 'DELETE',
      path: 'InstrumentsAPI',
      context: 'InstrumentsAPI',
      metadata: { instrumentId: id },
    },
    async () => {
      const supabase = getServerSupabase();
      const { error } = await supabase
        .from('instruments')
        .delete()
        .eq('id', id);

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Delete instrument');
      }

      return {
        payload: { success: true },
        metadata: { instrumentId: id },
      };
    }
  );
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));
