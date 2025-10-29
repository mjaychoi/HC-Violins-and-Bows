// src/hooks/useSupabaseQuery.ts
import { useState, useCallback } from 'react';
import { apiClient } from '@/utils/apiClient';
import { useErrorHandler } from './useErrorHandler';

export function useSupabaseQuery<T>(table: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const { handleError } = useErrorHandler();

  const fetch = useCallback(
    async (options?: {
      select?: string;
      eq?: { column: string; value: unknown };
      order?: { column: string; ascending?: boolean };
      limit?: number;
    }) => {
      setLoading(true);
      setError(null);

      try {
        const { data: result, error: queryError } = await apiClient.query<T>(
          table,
          options
        );

        if (queryError) {
          setError(queryError);
          handleError(queryError, `Fetch ${table}`);
          return;
        }

        setData(result || []);
      } catch (err) {
        const appError = handleError(err, `Fetch ${table}`);
        setError(appError);
      } finally {
        setLoading(false);
      }
    },
    [table, handleError]
  );

  const create = useCallback(
    async (newData: Record<string, unknown>) => {
      setLoading(true);
      setError(null);

      try {
        const { data: result, error: createError } = await apiClient.create<T>(
          table,
          newData
        );

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
        const appError = handleError(err, `Create ${table}`);
        setError(appError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [table, handleError]
  );

  const update = useCallback(
    async (id: string, updateData: Record<string, unknown>) => {
      setLoading(true);
      setError(null);

      try {
        const { data: result, error: updateError } = await apiClient.update<T>(
          table,
          id,
          updateData
        );

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
        const appError = handleError(err, `Update ${table}`);
        setError(appError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [table, handleError]
  );

  const remove = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);

      try {
        const { success, error: deleteError } = await apiClient.delete(
          table,
          id
        );

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
        const appError = handleError(err, `Delete ${table}`);
        setError(appError);
        return false;
      } finally {
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
