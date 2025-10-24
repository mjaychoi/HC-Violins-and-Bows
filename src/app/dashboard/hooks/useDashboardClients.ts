import { useState } from 'react'
import { Client } from '@/types'
import { useDataState } from '@/hooks/useDataState'
import { useDataFetching } from '@/hooks/useDataFetching'
import { supabase } from '@/lib/supabase'
import { logError } from '@/utils/logger'

export function useDashboardClients() {
  const [showClientSearch, setShowClientSearch] = useState(false)
  const [clientSearchTerm, setClientSearchTerm] = useState('')
  const [isSearchingClients, setIsSearchingClients] = useState(false)
  const [selectedClientsForNew, setSelectedClientsForNew] = useState<Client[]>([])
  
  // Ownership search states
  const [showOwnershipSearch, setShowOwnershipSearch] = useState(false)
  const [ownershipSearchTerm, setOwnershipSearchTerm] = useState('')
  const [isSearchingOwnership, setIsSearchingOwnership] = useState(false)
  const [selectedOwnershipClient, setSelectedOwnershipClient] = useState<Client | null>(null)

  const { data: searchResults, setItems: setSearchResults } = useDataState<Client>((item) => item.id, [])
  const { data: ownershipSearchResults, setItems: setOwnershipSearchResults } = useDataState<Client>((item) => item.id, [])

  // Use useDataFetching for client search
  const { fetchData: searchClients } = useDataFetching<Client>(
    async () => {
      if (clientSearchTerm.length < 2) return []
      
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .or(`first_name.ilike.%${clientSearchTerm}%,last_name.ilike.%${clientSearchTerm}%,email.ilike.%${clientSearchTerm}%`)
        .limit(10)
      
      if (error) throw error
      return data || []
    },
    'Search clients'
  )

  const { fetchData: searchOwnershipClients } = useDataFetching<Client>(
    async () => {
      if (ownershipSearchTerm.length < 2) return []
      
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .or(`first_name.ilike.%${ownershipSearchTerm}%,last_name.ilike.%${ownershipSearchTerm}%,email.ilike.%${ownershipSearchTerm}%`)
        .limit(10)
      
      if (error) throw error
      return data || []
    },
    'Search ownership clients'
  )

  const handleClientSearch = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setSearchResults([])
      return
    }

    setIsSearchingClients(true)
    try {
      const results = await searchClients()
      if (results) {
        setSearchResults(results)
      }
    } catch (error) {
      logError('Error searching clients', error, 'useDashboardClients')
      setSearchResults([])
    } finally {
      setIsSearchingClients(false)
    }
  }

  const handleOwnershipSearch = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setOwnershipSearchResults([])
      return
    }

    setIsSearchingOwnership(true)
    try {
      const results = await searchOwnershipClients()
      if (results) {
        setOwnershipSearchResults(results)
      }
    } catch (error) {
      logError('Error searching ownership clients', error, 'useDashboardClients')
      setOwnershipSearchResults([])
    } finally {
      setIsSearchingOwnership(false)
    }
  }

  const addClientForNew = (client: Client) => {
    if (!selectedClientsForNew.some(c => c.id === client.id)) {
      setSelectedClientsForNew(prev => [...prev, client])
    }
    setShowClientSearch(false)
    setClientSearchTerm('')
    setSearchResults([])
  }

  const removeClientForNew = (clientId: string) => {
    setSelectedClientsForNew(prev => prev.filter(c => c.id !== clientId))
  }

  const selectOwnershipClient = (client: Client) => {
    setSelectedOwnershipClient(client)
    setShowOwnershipSearch(false)
    setOwnershipSearchTerm('')
    setOwnershipSearchResults([])
  }

  const clearOwnershipClient = () => {
    setSelectedOwnershipClient(null)
  }

  return {
    // Client search states
    showClientSearch,
    setShowClientSearch,
    clientSearchTerm,
    setClientSearchTerm,
    isSearchingClients,
    searchResults,
    selectedClientsForNew,
    setSelectedClientsForNew,
    
    // Ownership search states
    showOwnershipSearch,
    setShowOwnershipSearch,
    ownershipSearchTerm,
    setOwnershipSearchTerm,
    isSearchingOwnership,
    ownershipSearchResults,
    selectedOwnershipClient,
    
    // Actions
    handleClientSearch,
    handleOwnershipSearch,
    addClientForNew,
    removeClientForNew,
    selectOwnershipClient,
    clearOwnershipClient
  }
}
