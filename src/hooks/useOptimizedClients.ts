import { useState, useEffect, useCallback } from 'react'
import { Client } from '@/types'
import { useAsyncOperation } from './useAsyncOperation'
import { useLoadingState } from './useLoadingState'
import { SupabaseHelpers } from '@/utils/supabaseHelpers'

export function useOptimizedClients() {
  const [clients, setClients] = useState<Client[]>([])
  const { loading, submitting, withLoading } = useLoadingState()
  const { run } = useAsyncOperation<Client[]>()

  const fetchClients = useCallback(async () => {
    const result = await run(
      () => SupabaseHelpers.fetchAll<Client>('clients', {
        orderBy: { column: 'created_at', ascending: false }
      }).then(res => res.data || []),
      { context: 'Fetch clients', onSuccess: setClients }
    )
    
    return result
  }, [run])

  const createClient = async (clientData: Omit<Client, 'id' | 'created_at'>) => {
    return await withLoading(
      async () => {
        const { data, error } = await SupabaseHelpers.create<Client>('clients', clientData)
        if (error) throw error
        if (data) {
          setClients(prev => [data, ...prev])
        }
        return data
      },
      true // use submitting
    )
  }

  const updateClient = async (id: string, clientData: Partial<Client>) => {
    return await withLoading(
      async () => {
        const { data, error } = await SupabaseHelpers.update<Client>('clients', id, clientData)
        if (error) throw error
        if (data) {
          setClients(prev => prev.map(client => client.id === id ? data : client))
        }
        return data
      },
      true
    )
  }

  const removeClient = async (id: string) => {
    return await withLoading(
      async () => {
        const { error } = await SupabaseHelpers.delete('clients', id)
        if (error) throw error
        setClients(prev => prev.filter(client => client.id !== id))
        return true
      },
      true
    )
  }

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  return {
    clients,
    loading,
    submitting,
    createClient,
    updateClient,
    removeClient,
    fetchClients
  }
}