import { supabase } from '@/lib/supabase';

export class SupabaseHelpers {
  static async fetchAll<T>(
    table: string,
    options?: {
      select?: string;
      orderBy?: { column: string; ascending?: boolean };
      limit?: number;
      signal?: AbortSignal;
    }
  ): Promise<{ data: T[] | null; error: unknown }> {
    let query = supabase.from(table).select(options?.select || '*');

    if (options?.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending ?? true,
      });
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    return { data: data as T[], error };
  }

  static async fetchById<T>(
    table: string,
    id: string,
    select?: string
  ): Promise<{ data: T | null; error: unknown }> {
    const { data, error } = await supabase
      .from(table)
      .select(select || '*')
      .eq('id', id)
      .single();
    return { data: data as T, error };
  }

  static async create<T>(
    table: string,
    data: Record<string, unknown>
  ): Promise<{ data: T | null; error: unknown }> {
    const { data: result, error } = await supabase
      .from(table)
      .insert([data])
      .select()
      .single();
    return { data: result as T, error };
  }

  static async update<T>(
    table: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<{ data: T | null; error: unknown }> {
    const { data: result, error } = await supabase
      .from(table)
      .update(data)
      .eq('id', id)
      .select()
      .single();
    return { data: result as T, error };
  }

  static async delete(table: string, id: string): Promise<{ error: unknown }> {
    const { error } = await supabase.from(table).delete().eq('id', id);
    return { error };
  }

  static async search<T>(
    table: string,
    searchTerm: string,
    columns: string[],
    options?: {
      limit?: number;
      signal?: AbortSignal;
    }
  ): Promise<{ data: T[] | null; error: unknown }> {
    const limit = options?.limit ?? 10;
    const orCondition = columns
      .map(col => `${col}.ilike.%${searchTerm}%`)
      .join(',');

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .or(orCondition)
      .limit(limit);
    return { data: data as T[], error };
  }
}
