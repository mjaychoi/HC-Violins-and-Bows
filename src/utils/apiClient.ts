import { errorHandler } from './errorHandler';
import { supabase } from '@/lib/supabase';
import { logApiRequest, logError } from './logger';

export class ApiClient {
  private static instance: ApiClient;

  static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  async query<T>(
    table: string,
    options?: {
      select?: string;
      eq?: { column: string; value: unknown };
      order?: { column: string; ascending?: boolean };
      limit?: number;
    }
  ): Promise<{ data: T[] | null; error: unknown }> {
    const startTime = performance.now();
    const url = `supabase://${table}`;

    try {
      let query = supabase.from(table).select(options?.select || '*');

      if (options?.eq) {
        query = query.eq(options.eq.column, options.eq.value);
      }

      if (options?.order) {
        query = query.order(options.order.column, {
          ascending: options.order.ascending ?? true,
        });
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const queryResult = await query;
      const { data, error } = queryResult;
      const duration = Math.round(performance.now() - startTime);

      if (error) {
        const appError = errorHandler.handleSupabaseError(
          error,
          `Query ${table}`
        );
        logApiRequest('GET', url, undefined, duration, 'ApiClient', {
          table,
          operation: 'query',
          error: true,
          errorCode: (appError as { code?: string })?.code,
        });
        return { data: null, error: appError };
      }

      logApiRequest('GET', url, 200, duration, 'ApiClient', {
        table,
        operation: 'query',
        recordCount: data?.length || 0,
      });

      return { data: data as T[], error: null };
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      const appError = errorHandler.handleSupabaseError(
        error,
        `Query ${table}`
      );
      logError(`Query failed: ${table}`, error, 'ApiClient', {
        table,
        operation: 'query',
        duration,
      });
      return { data: null, error: appError };
    }
  }

  async create<T>(
    table: string,
    data: Record<string, unknown>
  ): Promise<{ data: T | null; error: unknown }> {
    const startTime = performance.now();
    const url = `supabase://${table}`;

    try {
      const { data: result, error } = await supabase
        .from(table)
        .insert([data])
        .select()
        .single();

      const duration = Math.round(performance.now() - startTime);

      if (error) {
        const appError = errorHandler.handleSupabaseError(
          error,
          `Create ${table}`
        );
        logApiRequest('POST', url, undefined, duration, 'ApiClient', {
          table,
          operation: 'create',
          error: true,
          errorCode: (appError as { code?: string })?.code,
        });
        return { data: null, error: appError };
      }

      logApiRequest('POST', url, 201, duration, 'ApiClient', {
        table,
        operation: 'create',
        recordId: (result as { id?: string })?.id,
      });

      return { data: result, error: null };
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      const appError = errorHandler.handleSupabaseError(
        error,
        `Create ${table}`
      );
      logError(`Create failed: ${table}`, error, 'ApiClient', {
        table,
        operation: 'create',
        duration,
      });
      return { data: null, error: appError };
    }
  }

  async update<T>(
    table: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<{ data: T | null; error: unknown }> {
    const startTime = performance.now();
    const url = `supabase://${table}/${id}`;

    try {
      const { data: result, error } = await supabase
        .from(table)
        .update(data)
        .eq('id', id)
        .select()
        .single();

      const duration = Math.round(performance.now() - startTime);

      if (error) {
        const appError = errorHandler.handleSupabaseError(
          error,
          `Update ${table}`
        );
        logApiRequest('PATCH', url, undefined, duration, 'ApiClient', {
          table,
          id,
          operation: 'update',
          error: true,
          errorCode: (appError as { code?: string })?.code,
        });
        return { data: null, error: appError };
      }

      logApiRequest('PATCH', url, 200, duration, 'ApiClient', {
        table,
        id,
        operation: 'update',
      });

      return { data: result, error: null };
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      const appError = errorHandler.handleSupabaseError(
        error,
        `Update ${table}`
      );
      logError(`Update failed: ${table}`, error, 'ApiClient', {
        table,
        id,
        operation: 'update',
        duration,
      });
      return { data: null, error: appError };
    }
  }

  async delete(
    table: string,
    id: string
  ): Promise<{ success: boolean; error: unknown }> {
    const startTime = performance.now();
    const url = `supabase://${table}/${id}`;

    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      const duration = Math.round(performance.now() - startTime);

      if (error) {
        const appError = errorHandler.handleSupabaseError(
          error,
          `Delete ${table}`
        );
        logApiRequest('DELETE', url, undefined, duration, 'ApiClient', {
          table,
          id,
          operation: 'delete',
          error: true,
          errorCode: (appError as { code?: string })?.code,
        });
        return { success: false, error: appError };
      }

      logApiRequest('DELETE', url, 204, duration, 'ApiClient', {
        table,
        id,
        operation: 'delete',
      });

      return { success: true, error: null };
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      const appError = errorHandler.handleSupabaseError(
        error,
        `Delete ${table}`
      );
      logError(`Delete failed: ${table}`, error, 'ApiClient', {
        table,
        id,
        operation: 'delete',
        duration,
      });
      return { success: false, error: appError };
    }
  }
}

export const apiClient = ApiClient.getInstance();
