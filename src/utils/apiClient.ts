import { errorHandler } from './errorHandler';
import { supabase } from '@/lib/supabase';

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

      const { data, error } = await query;

      if (error) {
        const appError = errorHandler.handleSupabaseError(
          error,
          `Query ${table}`
        );
        return { data: null, error: appError };
      }

      return { data: data as T[], error: null };
    } catch (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        `Query ${table}`
      );
      return { data: null, error: appError };
    }
  }

  async create<T>(
    table: string,
    data: Record<string, unknown>
  ): Promise<{ data: T | null; error: unknown }> {
    try {
      const { data: result, error } = await supabase
        .from(table)
        .insert([data])
        .select()
        .single();

      if (error) {
        const appError = errorHandler.handleSupabaseError(
          error,
          `Create ${table}`
        );
        return { data: null, error: appError };
      }

      return { data: result, error: null };
    } catch (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        `Create ${table}`
      );
      return { data: null, error: appError };
    }
  }

  async update<T>(
    table: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<{ data: T | null; error: unknown }> {
    try {
      const { data: result, error } = await supabase
        .from(table)
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        const appError = errorHandler.handleSupabaseError(
          error,
          `Update ${table}`
        );
        return { data: null, error: appError };
      }

      return { data: result, error: null };
    } catch (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        `Update ${table}`
      );
      return { data: null, error: appError };
    }
  }

  async delete(
    table: string,
    id: string
  ): Promise<{ success: boolean; error: unknown }> {
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);

      if (error) {
        const appError = errorHandler.handleSupabaseError(
          error,
          `Delete ${table}`
        );
        return { success: false, error: appError };
      }

      return { success: true, error: null };
    } catch (error) {
      const appError = errorHandler.handleSupabaseError(
        error,
        `Delete ${table}`
      );
      return { success: false, error: appError };
    }
  }
}

export const apiClient = ApiClient.getInstance();
