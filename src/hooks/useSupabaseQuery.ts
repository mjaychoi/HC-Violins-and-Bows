/**
 * @deprecated This hook is deprecated. Use `useUnifiedData` or `useUnifiedDashboard` instead.
 *
 * This hook is kept for backward compatibility with tests only.
 * All production code should use `useUnifiedData` → `useUnifiedDashboard` for consistent data fetching.
 */
// src/hooks/useSupabaseQuery.ts
import { useState, useCallback, useRef } from 'react';
import { apiClient } from '@/utils/apiClient';
import { useErrorHandler } from '@/contexts/ToastContext';

export function useSupabaseQuery<T>(table: string) {
  // NOTE: table parameter is intentionally string (not restricted to ALLOWED_SORT_COLUMNS)
  // This hook may be used with tables not in the sort whitelist (e.g., custom queries)
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const { handleError } = useErrorHandler();
  const reqIdRef = useRef(0);

  const fetch = useCallback(
    async (options?: {
      select?: string;
      eq?: { column: string; value: unknown };
      order?: { column: string; ascending?: boolean };
      limit?: number;
    }) => {
      setLoading(true);
      setError(null);
      const myId = ++reqIdRef.current;

      try {
        // Type assertion: table may not be in ALLOWED_SORT_COLUMNS for custom queries
        // Type assertion: table may not be in ALLOWED_SORT_COLUMNS for custom queries
        // This is intentional to allow broader table usage beyond strict typing
        const { data: result, error: queryError } = await apiClient.query<T>(
          table as
            | 'instruments'
            | 'clients'
            | 'sales_history'
            | 'maintenance_tasks'
            | 'connections',
          options
        );

        if (myId !== reqIdRef.current) return; // stale

        if (queryError) {
          setError(queryError);
          handleError(queryError, `Fetch ${table}`);
          return;
        }

        setData(result || []);
      } catch (err) {
        if (myId !== reqIdRef.current) return;
        const appError = handleError(err, `Fetch ${table}`);
        setError(appError);
      } finally {
        if (myId !== reqIdRef.current) return;
        setLoading(false);
      }
    },
    [table, handleError]
  );

  const create = useCallback(
    async (newData: Record<string, unknown>) => {
      setLoading(true);
      setError(null);
      const myId = ++reqIdRef.current;

      try {
        const { data: result, error: createError } = await apiClient.create<T>(
          table,
          newData
        );

        if (myId !== reqIdRef.current) return null; // stale

        if (createError) {
          setError(createError);
          handleError(createError, `Create ${table}`);
          return null;
        }

        if (result) {
          setData(prev => [...prev, result]);
        }

        return result;
      } catch (err) {
        if (myId !== reqIdRef.current) return null;
        const appError = handleError(err, `Create ${table}`);
        setError(appError);
        return null;
      } finally {
        if (myId !== reqIdRef.current) return;
        setLoading(false);
      }
    },
    [table, handleError]
  );

  const update = useCallback(
    async (id: string, updateData: Record<string, unknown>) => {
      setLoading(true);
      setError(null);
      const myId = ++reqIdRef.current;

      try {
        const { data: result, error: updateError } = await apiClient.update<T>(
          table,
          id,
          updateData
        );

        if (myId !== reqIdRef.current) return null; // stale

        if (updateError) {
          setError(updateError);
          handleError(updateError, `Update ${table}`);
          return null;
        }

        if (result) {
          setData(prev =>
            prev.map(item =>
              (item as Record<string, unknown>).id === id ? result : item
            )
          );
        }

        return result;
      } catch (err) {
        if (myId !== reqIdRef.current) return null;
        const appError = handleError(err, `Update ${table}`);
        setError(appError);
        return null;
      } finally {
        if (myId !== reqIdRef.current) return;
        setLoading(false);
      }
    },
    [table, handleError]
  );

  const remove = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      const myId = ++reqIdRef.current;

      try {
        const { success, error: deleteError } = await apiClient.delete(
          table,
          id
        );

        if (myId !== reqIdRef.current) return false; // stale

        if (deleteError) {
          setError(deleteError);
          handleError(deleteError, `Delete ${table}`);
          return false;
        }

        if (success) {
          setData(prev =>
            prev.filter(item => (item as Record<string, unknown>).id !== id)
          );
        }

        return success;
      } catch (err) {
        if (myId !== reqIdRef.current) return false;
        const appError = handleError(err, `Delete ${table}`);
        setError(appError);
        return false;
      } finally {
        if (myId !== reqIdRef.current) return;
        setLoading(false);
      }
    },
    [table, handleError]
  );

  return {
    data,
    loading,
    error,
    fetch,
    create,
    update,
    remove,
    setData,
  };
}
