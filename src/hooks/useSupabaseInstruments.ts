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
