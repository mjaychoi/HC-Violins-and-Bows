/**
 * @deprecated This hook is deprecated. Use `useUnifiedData` or `useUnifiedDashboard` instead.
 *
 * This hook is kept for backward compatibility with tests only.
 * All production code should use `useUnifiedData` → `useUnifiedDashboard` for consistent data fetching.
 */
// src/hooks/useSupabaseInstruments.ts
import { useSupabaseQuery } from './useSupabaseQuery';
import { Instrument } from '@/types';

export function useSupabaseInstruments() {
  const {
    data: instruments,
    loading,
    error,
    fetch,
    create,
    update,
    remove: deleteInstrument,
  } = useSupabaseQuery<Instrument>('instruments');

  return {
    instruments,
    loading,
    error,
    fetchInstruments: fetch,
    createInstrument: create,
    updateInstrument: update,
    deleteInstrument,
  };
}
