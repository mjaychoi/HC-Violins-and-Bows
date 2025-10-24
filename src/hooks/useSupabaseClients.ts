// src/hooks/useSupabaseClients.ts
import { useSupabaseQuery } from './useSupabaseQuery'
import { Client } from '@/types'

export function useSupabaseClients() {
  const { data: clients, loading, error, fetch, create, update, remove: deleteClient } = useSupabaseQuery<Client>('clients')

  return {
    clients,
    loading,
    error,
    fetchClients: fetch,
    createClient: create,
    updateClient: update,
    deleteClient
  }
}
