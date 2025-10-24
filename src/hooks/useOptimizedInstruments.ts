// src/hooks/useOptimizedInstruments.ts
import { useState } from 'react'
import { Instrument } from '@/types'
import { useAsyncOperation } from './useAsyncOperation'
import { useLoadingState } from './useLoadingState'
import { SupabaseHelpers } from '@/utils/supabaseHelpers'

export function useOptimizedInstruments() {
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [searchResults, setSearchResults] = useState<Instrument[]>([])
  const { loading, submitting, withLoading } = useLoadingState()
  const { run } = useAsyncOperation<Instrument[]>()

  const fetchInstruments = async () => {
    const result = await run(
      () => SupabaseHelpers.fetchAll<Instrument>('instruments', {
        orderBy: { column: 'created_at', ascending: false }
      }).then(res => res.data || []),
      { context: 'Fetch instruments', onSuccess: setInstruments }
    )
    
    return result
  }

  const searchInstruments = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setSearchResults([])
      return
    }

    const result = await run(
      () => SupabaseHelpers.search<Instrument>('instruments', searchTerm, ['maker', 'type'])
        .then(res => res.data || []),
      { context: 'Search instruments', onSuccess: setSearchResults }
    )
    
    return result
  }

  const createInstrument = async (instrumentData: Omit<Instrument, 'id' | 'created_at'>) => {
    return await withLoading(
      async () => {
        const { data, error } = await SupabaseHelpers.create<Instrument>('instruments', instrumentData)
        if (error) throw error
        if (data) {
          setInstruments(prev => [data, ...prev])
        }
        return data
      },
      true
    )
  }

  const updateInstrument = async (id: string, instrumentData: Partial<Instrument>) => {
    return await withLoading(
      async () => {
        const { data, error } = await SupabaseHelpers.update<Instrument>('instruments', id, instrumentData)
        if (error) throw error
        if (data) {
          setInstruments(prev => prev.map(instrument => instrument.id === id ? data : instrument))
        }
        return data
      },
      true
    )
  }

  const deleteInstrument = async (id: string) => {
    return await withLoading(
      async () => {
        const { error } = await SupabaseHelpers.delete('instruments', id)
        if (error) throw error
        setInstruments(prev => prev.filter(instrument => instrument.id !== id))
        return true
      },
      true
    )
  }

  return {
    instruments,
    searchResults,
    loading,
    submitting,
    fetchInstruments,
    searchInstruments,
    createInstrument,
    updateInstrument,
    deleteInstrument,
    setSearchResults
  }
}
