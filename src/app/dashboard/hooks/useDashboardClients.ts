import { useState, useCallback, useRef } from 'react';
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

  // FIXED: Use requestIdRef to prevent race conditions from out-of-order responses
  const requestIdRef = useRef(0);
  const clientSearchRequestIdRef = useRef(0);
  const ownershipSearchRequestIdRef = useRef(0);

  // FIXED: Single shared search function to avoid duplication
  // Use API route instead of direct Supabase client to reduce bundle size
  const searchClients = useCallback(async (term: string) => {
    if (term.length < 2) return [];

    const reqId = ++requestIdRef.current;

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

      // Ignore stale responses
      if (reqId !== requestIdRef.current) return [];

      return result.data || [];
    } catch (error) {
      // Only log error if this is still the latest request
      if (reqId === requestIdRef.current) {
        logError('Error searching clients', error, 'useDashboardClients', {
          searchTerm: term,
          action: 'searchClients',
        });
      }
      return [];
    }
  }, []);

  const handleClientSearch = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setSearchResults([]);
      setIsSearchingClients(false);
      return;
    }

    const reqId = ++clientSearchRequestIdRef.current;
    setIsSearchingClients(true);

    try {
      const results = await searchClients(searchTerm);
      // Only update if this is still the latest request
      if (reqId === clientSearchRequestIdRef.current) {
        setSearchResults(results);
        setIsSearchingClients(false);
      }
    } catch (error) {
      // Only update if this is still the latest request
      if (reqId === clientSearchRequestIdRef.current) {
        logError('Error searching clients', error, 'useDashboardClients', {
          searchTerm,
          operation: 'searchClients',
        });
        setSearchResults([]);
        setIsSearchingClients(false);
      }
    }
  };

  const handleOwnershipSearch = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setOwnershipSearchResults([]);
      setIsSearchingOwnership(false);
      return;
    }

    const reqId = ++ownershipSearchRequestIdRef.current;
    setIsSearchingOwnership(true);

    try {
      const results = await searchClients(searchTerm);
      // Only update if this is still the latest request
      if (reqId === ownershipSearchRequestIdRef.current) {
        setOwnershipSearchResults(results);
        setIsSearchingOwnership(false);
      }
    } catch (error) {
      // Only update if this is still the latest request
      if (reqId === ownershipSearchRequestIdRef.current) {
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
        setIsSearchingOwnership(false);
      }
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
