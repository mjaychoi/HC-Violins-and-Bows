/**
 * @deprecated This hook is deprecated. Use `useUnifiedData` or `useUnifiedDashboard` instead.
 *
 * This hook is kept for backward compatibility with tests only.
 * All production code should use `useUnifiedData` → `useUnifiedDashboard` for consistent data fetching.
 */
// src/hooks/useSupabaseClients.ts
import { useSupabaseQuery } from './useSupabaseQuery';
import { Client } from '@/types';

export function useSupabaseClients() {
  const {
    data: clients,
    loading,
    error,
    fetch,
    create,
    update,
    remove: deleteClient,
  } = useSupabaseQuery<Client>('clients');

  return {
    clients,
    loading,
    error,
    fetchClients: fetch,
    createClient: create,
    updateClient: update,
    deleteClient,
  };
}
