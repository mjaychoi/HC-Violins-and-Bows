import { errorHandler } from './errorHandler';
import { getSupabase } from '@/lib/supabase';
import { logApiRequest, logError } from './logger';
import { captureException } from './monitoring';
import { ErrorSeverity } from '@/types/errors';
import { validateSortColumn, ALLOWED_SORT_COLUMNS } from './inputValidation';

// Lazy load Supabase client to prevent dependency leakage
// Only load when actually used, not at module initialization time
const getSupabaseClient = () => getSupabase();

// Safe timing helper that works in both browser and Node.js/SSR
const nowMs = (): number => {
  if (typeof globalThis !== 'undefined' && globalThis.performance?.now) {
    const perfNow = globalThis.performance.now();
    return typeof perfNow === 'number' ? perfNow : Date.now();
  }
  return Date.now();
};

export class ApiClient {
  private static instance: ApiClient;

  static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  async query<T>(
    table: keyof typeof ALLOWED_SORT_COLUMNS,
    options?: {
      select?: string;
      eq?: { column: string; value: unknown };
      order?: { column: string; ascending?: boolean };
      limit?: number;
    }
  ): Promise<{ data: T[] | null; error: unknown }> {
    const startTime = nowMs();
    const url = `supabase://${table}`;

    try {
      const supabase = getSupabaseClient();
      let query = supabase.from(table).select(options?.select || '*');

      if (options?.eq) {
        query = query.eq(options.eq.column, options.eq.value);
      }

      // SECURITY: Validate order column against whitelist to prevent injection
      if (options?.order) {
        const safeColumn = validateSortColumn(
          table,
          options.order.column ?? null
        );
        query = query.order(safeColumn, {
          ascending: options.order.ascending ?? true,
        });
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const queryResult = await query;
      const { data, error } = queryResult;
      const duration = Math.round(nowMs() - startTime);

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
        captureException(
          appError,
          `ApiClient.query(${table})`,
          { table, operation: 'query', duration },
          ErrorSeverity.MEDIUM
        );
        return { data: null, error: appError };
      }

      logApiRequest('GET', url, 200, duration, 'ApiClient', {
        table,
        operation: 'query',
        recordCount: data?.length || 0,
      });

      return { data: data as T[], error: null };
    } catch (error) {
      const duration = Math.round(nowMs() - startTime);
      const appError = errorHandler.handleSupabaseError(
        error,
        `Query ${table}`
      );
      logError(`Query failed: ${table}`, error, 'ApiClient', {
        table,
        operation: 'query',
        duration,
      });
      captureException(
        error,
        `ApiClient.query(${table})`,
        { table, operation: 'query', duration },
        ErrorSeverity.HIGH
      );
      return { data: null, error: appError };
    }
  }

  async create<T>(
    table: string,
    data: Record<string, unknown>
  ): Promise<{ data: T | null; error: unknown }> {
    const startTime = nowMs();
    const url = `supabase://${table}`;

    try {
      const supabase = getSupabaseClient();
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
        captureException(
          appError,
          `ApiClient.create(${table})`,
          { table, operation: 'create', duration },
          ErrorSeverity.MEDIUM
        );
        return { data: null, error: appError };
      }

      logApiRequest('POST', url, 201, duration, 'ApiClient', {
        table,
        operation: 'create',
        recordId: (result as { id?: string })?.id,
      });

      return { data: result, error: null };
    } catch (error) {
      const duration = Math.round(nowMs() - startTime);
      const appError = errorHandler.handleSupabaseError(
        error,
        `Create ${table}`
      );
      logError(`Create failed: ${table}`, error, 'ApiClient', {
        table,
        operation: 'create',
        duration,
      });
      captureException(
        error,
        `ApiClient.create(${table})`,
        { table, operation: 'create', duration },
        ErrorSeverity.HIGH
      );
      return { data: null, error: appError };
    }
  }

  async update<T>(
    table: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<{ data: T | null; error: unknown }> {
    const startTime = nowMs();
    const url = `supabase://${table}/${id}`;

    try {
      const supabase = getSupabaseClient();
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
        captureException(
          appError,
          `ApiClient.update(${table})`,
          { table, id, operation: 'update', duration },
          ErrorSeverity.MEDIUM
        );
        return { data: null, error: appError };
      }

      logApiRequest('PATCH', url, 200, duration, 'ApiClient', {
        table,
        id,
        operation: 'update',
      });

      return { data: result, error: null };
    } catch (error) {
      const duration = Math.round(nowMs() - startTime);
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
      captureException(
        error,
        `ApiClient.update(${table})`,
        { table, id, operation: 'update', duration },
        ErrorSeverity.HIGH
      );
      return { data: null, error: appError };
    }
  }

  async delete(
    table: string,
    id: string
  ): Promise<{ success: boolean; error: unknown }> {
    const startTime = nowMs();
    const url = `supabase://${table}/${id}`;

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from(table).delete().eq('id', id);
      const duration = Math.round(nowMs() - startTime);

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
        captureException(
          appError,
          `ApiClient.delete(${table})`,
          { table, id, operation: 'delete', duration },
          ErrorSeverity.MEDIUM
        );
        return { success: false, error: appError };
      }

      logApiRequest('DELETE', url, 204, duration, 'ApiClient', {
        table,
        id,
        operation: 'delete',
      });

      return { success: true, error: null };
    } catch (error) {
      const duration = Math.round(nowMs() - startTime);
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
      captureException(
        error,
        `ApiClient.delete(${table})`,
        { table, id, operation: 'delete', duration },
        ErrorSeverity.HIGH
      );
      return { success: false, error: appError };
    }
  }
}

export const apiClient = ApiClient.getInstance();
