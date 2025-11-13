import { supabase } from '@/lib/supabase';
import { logApiRequest, logError } from './logger';
import type {
  MaintenanceTask,
  TaskFilters,
} from '@/types';

// Supabase error type for better type safety
interface SupabaseError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

// Escape ILike special characters
function escapeILike(s: string): string {
  return s.replace(/[%_]/g, c => '\\' + c);
}

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
    const startTime = performance.now();
    const url = `supabase://${table}`;
    
    try {
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
      const duration = Math.round(performance.now() - startTime);

      if (error) {
        logApiRequest('GET', url, undefined, duration, 'SupabaseHelpers', {
          table,
          operation: 'fetchAll',
          error: true,
        });
        return { data: null, error };
      }

      logApiRequest('GET', url, 200, duration, 'SupabaseHelpers', {
        table,
        operation: 'fetchAll',
        recordCount: data?.length || 0,
      });

      return { data: data as T[], error: null };
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      logError(
        `fetchAll failed: ${table}`,
        error,
        'SupabaseHelpers',
        { table, operation: 'fetchAll', duration }
      );
      return { data: null, error };
    }
  }

  static async fetchById<T>(
    table: string,
    id: string,
    select?: string
  ): Promise<{ data: T | null; error: unknown }> {
    const startTime = performance.now();
    const url = `supabase://${table}/${id}`;
    
    try {
      const { data, error } = await supabase
        .from(table)
        .select(select || '*')
        .eq('id', id)
        .single();
      const duration = Math.round(performance.now() - startTime);

      if (error) {
        logApiRequest('GET', url, undefined, duration, 'SupabaseHelpers', {
          table,
          id,
          operation: 'fetchById',
          error: true,
        });
        return { data: null, error };
      }

      logApiRequest('GET', url, 200, duration, 'SupabaseHelpers', {
        table,
        id,
        operation: 'fetchById',
      });

      return { data: data as T, error: null };
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      logError(
        `fetchById failed: ${table}`,
        error,
        'SupabaseHelpers',
        { table, id, operation: 'fetchById', duration }
      );
      return { data: null, error };
    }
  }

  static async create<T>(
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
        logApiRequest('POST', url, undefined, duration, 'SupabaseHelpers', {
          table,
          operation: 'create',
          error: true,
        });
        return { data: null, error };
      }

      logApiRequest('POST', url, 201, duration, 'SupabaseHelpers', {
        table,
        operation: 'create',
        recordId: (result as { id?: string })?.id,
      });

      return { data: result as T, error: null };
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      logError(
        `create failed: ${table}`,
        error,
        'SupabaseHelpers',
        { table, operation: 'create', duration }
      );
      return { data: null, error };
    }
  }

  static async update<T>(
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
        logApiRequest('PATCH', url, undefined, duration, 'SupabaseHelpers', {
          table,
          id,
          operation: 'update',
          error: true,
        });
        return { data: null, error };
      }

      logApiRequest('PATCH', url, 200, duration, 'SupabaseHelpers', {
        table,
        id,
        operation: 'update',
      });

      return { data: result as T, error: null };
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      logError(
        `update failed: ${table}`,
        error,
        'SupabaseHelpers',
        { table, id, operation: 'update', duration }
      );
      return { data: null, error };
    }
  }

  static async delete(table: string, id: string): Promise<{ error: unknown }> {
    const startTime = performance.now();
    const url = `supabase://${table}/${id}`;
    
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      const duration = Math.round(performance.now() - startTime);

      if (error) {
        logApiRequest('DELETE', url, undefined, duration, 'SupabaseHelpers', {
          table,
          id,
          operation: 'delete',
          error: true,
        });
        return { error };
      }

      logApiRequest('DELETE', url, 204, duration, 'SupabaseHelpers', {
        table,
        id,
        operation: 'delete',
      });

      return { error: null };
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      logError(
        `delete failed: ${table}`,
        error,
        'SupabaseHelpers',
        { table, id, operation: 'delete', duration }
      );
      return { error };
    }
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
    const startTime = performance.now();
    const url = `supabase://${table}/search`;
    const limit = options?.limit ?? 10;
    
    try {
      const term = escapeILike(searchTerm);
      const orCondition = columns.map(col => `${col}.ilike.%${term}%`).join(',');

      const { data, error } = await supabase
        .from(table)
        .select('*')
        .or(orCondition)
        .limit(limit);
      const duration = Math.round(performance.now() - startTime);

      if (error) {
        logApiRequest('GET', url, undefined, duration, 'SupabaseHelpers', {
          table,
          searchTerm,
          columns,
          operation: 'search',
          error: true,
        });
        return { data: null, error };
      }

      logApiRequest('GET', url, 200, duration, 'SupabaseHelpers', {
        table,
        searchTerm,
        columns,
        operation: 'search',
        recordCount: data?.length || 0,
      });

      return { data: data as T[], error: null };
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      logError(
        `search failed: ${table}`,
        error,
        'SupabaseHelpers',
        { table, searchTerm, columns, operation: 'search', duration }
      );
      return { data: null, error };
    }
  }

  // Maintenance Tasks specific methods
  static async fetchMaintenanceTasks(
    filters?: TaskFilters
  ): Promise<{ data: MaintenanceTask[] | null; error: unknown }> {
    // Fetch tasks without instrument relation to avoid foreign key relationship errors
    // Instrument data can be fetched separately if needed
    let query = supabase
      .from('maintenance_tasks')
      .select('*')
      .order('received_date', { ascending: false });

    if (filters?.instrument_id) {
      query = query.eq('instrument_id', filters.instrument_id);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.task_type) {
      query = query.eq('task_type', filters.task_type);
    }

    if (filters?.priority) {
      query = query.eq('priority', filters.priority);
    }

    if (filters?.date_from) {
      query = query.gte('received_date', filters.date_from);
    }

    if (filters?.date_to) {
      query = query.lte('received_date', filters.date_to);
    }

    if (filters?.search) {
      const searchTerm = escapeILike(filters.search);
      query = query.or(
        `title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`
      );
    }

    const { data, error } = await query;
    return { data: data as MaintenanceTask[], error };
  }

  static async fetchMaintenanceTaskById(
    id: string
  ): Promise<{ data: MaintenanceTask | null; error: unknown }> {
    // Fetch task without instrument relation to avoid foreign key relationship errors
    // Instrument data can be fetched separately if needed
    const { data, error } = await supabase
      .from('maintenance_tasks')
      .select('*')
      .eq('id', id)
      .single();

    return { data: data as MaintenanceTask, error };
  }

  static async fetchTasksByDateRange(
    startDate: string,
    endDate: string
  ): Promise<{ data: MaintenanceTask[] | null; error: unknown }> {
    try {
      // Fetch tasks where any of the date fields fall within the range
      // received_date를 기준으로 필터링
      // 실제로는 여러 날짜 필드를 고려해야 하지만, 우선 received_date 기준으로 구현
      // Note: instrument relationship is fetched separately if needed to avoid foreign key relationship errors
      let { data, error } = await supabase
        .from('maintenance_tasks')
        .select('*')
        .gte('received_date', startDate)
        .lte('received_date', endDate)
        .order('scheduled_date', { ascending: true })
        .order('due_date', { ascending: true });
      
      // If error occurs due to relationship issue, try without relationship
      if (error) {
        const supabaseError = error as SupabaseError;
        const errorCode = supabaseError?.code;
        const errorMessage = supabaseError?.message || '';
        
        // If it's a relationship error (PGRST200), retry without relationship (silently)
        if (errorCode === 'PGRST200' || errorMessage.includes('relationship') || errorMessage.includes('foreign key')) {
          // Relationship query failed, fetch without relation (this is expected if foreign key is not set up in Supabase)
          const retryResult = await supabase
            .from('maintenance_tasks')
            .select('*')
            .gte('received_date', startDate)
            .lte('received_date', endDate)
            .order('scheduled_date', { ascending: true })
            .order('due_date', { ascending: true });
          
          data = retryResult.data;
          error = retryResult.error;
        }
      }

      if (error) {
        // Only log non-relationship errors
        const supabaseError = error as SupabaseError;
        const errorCode = supabaseError?.code;
        const errorMessage = supabaseError?.message || '';
        
        // 테이블이 없을 수 있는 경우를 위한 체크
        if (errorCode === '42P01' || errorMessage.includes('does not exist') || errorMessage.includes('relation')) {
          logError('maintenance_tasks 테이블이 존재하지 않습니다', error, 'SupabaseHelpers', {
            operation: 'fetchTasksByDateRange',
            errorCode,
            migrationGuide: 'https://supabase.com/dashboard/project/dmilmlhquttcozxlpfxw/sql/new',
          });
        } else if (errorCode === 'PGRST116' || errorMessage.includes('permission denied')) {
          // RLS 정책 문제
          logError('RLS 정책 문제가 발생했습니다', error, 'SupabaseHelpers', {
            operation: 'fetchTasksByDateRange',
            errorCode,
            suggestion: 'Supabase 대시보드에서 RLS 정책을 확인해주세요',
          });
        } else {
          // Other errors - log for debugging
          logError('Supabase fetchTasksByDateRange error', error, 'SupabaseHelpers', {
            operation: 'fetchTasksByDateRange',
            errorCode,
          });
        }
      }

      // 데이터가 있으면 날짜 범위로 필터링
      // received_date로 이미 필터링되어 있지만, 다른 날짜 필드도 확인
      if (data && !error) {
        const filteredData = data.filter((task: MaintenanceTask) => {
          const dates = [
            task.scheduled_date,
            task.due_date,
            task.personal_due_date,
            task.received_date,
          ].filter((date): date is string => Boolean(date));
          
          return dates.some(date => date >= startDate && date <= endDate);
        });
        return { data: filteredData as MaintenanceTask[], error };
      }

      return { data: data as MaintenanceTask[] | null, error };
    } catch (err) {
      logError('Unexpected error in fetchTasksByDateRange', err, 'SupabaseHelpers', {
        operation: 'fetchTasksByDateRange',
      });
      return { data: null, error: err };
    }
  }

  static async createMaintenanceTask(
    task: Omit<
      MaintenanceTask,
      'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
    >
  ): Promise<{ data: MaintenanceTask | null; error: unknown }> {
    // Fetch task without instrument relation to avoid foreign key relationship errors
    const { data, error } = await supabase
      .from('maintenance_tasks')
      .insert([task])
      .select('*')
      .single();

    return { data: data as MaintenanceTask, error };
  }

  static async updateMaintenanceTask(
    id: string,
    updates: Partial<
      Omit<MaintenanceTask, 'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'>
    >
  ): Promise<{ data: MaintenanceTask | null; error: unknown }> {
    // Fetch task without instrument relation to avoid foreign key relationship errors
    const { data, error } = await supabase
      .from('maintenance_tasks')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    return { data: data as MaintenanceTask, error };
  }

  static async deleteMaintenanceTask(
    id: string
  ): Promise<{ error: unknown }> {
    const { error } = await supabase
      .from('maintenance_tasks')
      .delete()
      .eq('id', id);

    return { error };
  }

  static async fetchTasksByScheduledDate(
    date: string
  ): Promise<{ data: MaintenanceTask[] | null; error: unknown }> {
    // Fetch tasks without instrument relation to avoid foreign key relationship errors
    const { data, error } = await supabase
      .from('maintenance_tasks')
      .select('*')
      .eq('scheduled_date', date)
      .order('priority', { ascending: false })
      .order('due_date', { ascending: true });

    return { data: data as MaintenanceTask[], error };
  }

  static async fetchOverdueTasks(): Promise<{
    data: MaintenanceTask[] | null;
    error: unknown;
  }> {
    // Fetch tasks without instrument relation to avoid foreign key relationship errors
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('maintenance_tasks')
      .select('*')
      .in('status', ['pending', 'in_progress'])
      .or(`due_date.lt.${today},personal_due_date.lt.${today}`)
      .order('due_date', { ascending: true });

    return { data: data as MaintenanceTask[], error };
  }
}
