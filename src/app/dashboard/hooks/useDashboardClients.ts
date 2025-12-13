import { useState, useCallback } from 'react';
import { Client } from '@/types';
import { useDataState } from '@/hooks/useDataState';
import { logError } from '@/utils/logger';
// Removed direct supabase import to reduce bundle size - using API routes instead

export function useDashboardClients() {
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [isSearchingClients, setIsSearchingClients] = useState(false);
  const [selectedClientsForNew, setSelectedClientsForNew] = useState<Client[]>(
    []
  );

  // Ownership search states
  const [showOwnershipSearch, setShowOwnershipSearch] = useState(false);
  const [ownershipSearchTerm, setOwnershipSearchTerm] = useState('');
  const [isSearchingOwnership, setIsSearchingOwnership] = useState(false);
  const [selectedOwnershipClient, setSelectedOwnershipClient] =
    useState<Client | null>(null);

  const { data: searchResults, setItems: setSearchResults } =
    useDataState<Client>(item => item.id, []);
  const { data: ownershipSearchResults, setItems: setOwnershipSearchResults } =
    useDataState<Client>(item => item.id, []);

  // FIXED: Make search functions accept term parameter to use passed searchTerm arg
  // Use API route instead of direct Supabase client to reduce bundle size
  const searchClientsFunction = useCallback(async (term: string) => {
    if (term.length < 2) return [];

    try {
      const params = new URLSearchParams({
        search: term,
        limit: '10',
      });
      const response = await fetch(`/api/clients?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to search clients: ${response.statusText}`);
      }
      const result = await response.json();
      return result.data || [];
    } catch (error) {
      logError('Error searching clients', error, 'useDashboardClients', {
        searchTerm: term,
        action: 'searchClientsFunction',
      });
      return [];
    }
  }, []);

  const searchOwnershipClientsFunction = useCallback(async (term: string) => {
    if (term.length < 2) return [];

    try {
      const params = new URLSearchParams({
        search: term,
        limit: '10',
      });
      const response = await fetch(`/api/clients?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to search clients: ${response.statusText}`);
      }
      const result = await response.json();
      return result.data || [];
    } catch (error) {
      logError('Error searching ownership clients', error, 'useDashboardClients', {
        searchTerm: term,
        action: 'searchOwnershipClientsFunction',
      });
      return [];
    }
  }, []);

  const handleClientSearch = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearchingClients(true);
    try {
      // FIXED: Pass searchTerm directly to function instead of relying on closure
      const results = await searchClientsFunction(searchTerm);
      setSearchResults(results);
    } catch (error) {
      logError('Error searching clients', error, 'useDashboardClients', {
        searchTerm,
        operation: 'searchClients',
      });
      setSearchResults([]);
    } finally {
      setIsSearchingClients(false);
    }
  };

  const handleOwnershipSearch = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setOwnershipSearchResults([]);
      return;
    }

    setIsSearchingOwnership(true);
    try {
      // FIXED: Pass searchTerm directly to function instead of relying on closure
      const results = await searchOwnershipClientsFunction(searchTerm);
      setOwnershipSearchResults(results);
    } catch (error) {
      logError(
        'Error searching ownership clients',
        error,
        'useDashboardClients',
        {
          searchTerm,
          operation: 'searchOwnershipClients',
        }
      );
      setOwnershipSearchResults([]);
    } finally {
      setIsSearchingOwnership(false);
    }
  };

  const addClientForNew = (client: Client) => {
    if (!selectedClientsForNew.some(c => c.id === client.id)) {
      setSelectedClientsForNew(prev => [...prev, client]);
    }
    setShowClientSearch(false);
    setClientSearchTerm('');
    setSearchResults([]);
  };

  const removeClientForNew = (clientId: string) => {
    setSelectedClientsForNew(prev => prev.filter(c => c.id !== clientId));
  };

  const selectOwnershipClient = (client: Client) => {
    setSelectedOwnershipClient(client);
    setShowOwnershipSearch(false);
    setOwnershipSearchTerm('');
    setOwnershipSearchResults([]);
  };

  const clearOwnershipClient = () => {
    setSelectedOwnershipClient(null);
  };

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
    clearOwnershipClient,
  };
}
