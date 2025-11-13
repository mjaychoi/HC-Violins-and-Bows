'use client';
import { Client, ClientInstrument } from '@/types';
import dynamic from 'next/dynamic';
import { useUnifiedClients } from '@/hooks/useUnifiedData';
import { generateClientNumber } from '@/utils/uniqueNumberGenerator';
import {
  useClientInstruments,
  useFilters,
  useClientView,
  useInstrumentSearch,
  useOwnedItems,
} from './hooks';
import { ClientForm, ClientFilters } from './components';
import { TableSkeleton } from '@/components/common';
const ClientList = dynamic(() => import('./components/ClientList'), {
  ssr: false,
  loading: () => <TableSkeleton rows={8} columns={7} />,
});
const ClientModal = dynamic(() => import('./components/ClientModal'), {
  ssr: false,
});
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { useModalState } from '@/hooks/useModalState';
import { AppLayout } from '@/components/layout';
import { ErrorBoundary, SpinnerLoading } from '@/components/common';
import { useEffect } from 'react';

export default function ClientsPage() {
  // Error handling
  const { ErrorToasts, handleError } = useErrorHandler();

  // Custom hooks
  const {
    clients,
    loading,
    submitting,
    createClient,
    updateClient,
    deleteClient,
  } = useUnifiedClients();

  const {
    instrumentRelationships,
    clientsWithInstruments,
    addInstrumentRelationship: addInstrumentRelationshipHook,
    removeInstrumentRelationship: removeInstrumentRelationshipHook,
    fetchInstrumentRelationships,
    fetchAllInstrumentRelationships,
  } = useClientInstruments();

  // 초기 로드 시 모든 클라이언트의 instrument 관계 가져오기
  useEffect(() => {
    if (
      fetchAllInstrumentRelationships &&
      typeof fetchAllInstrumentRelationships === 'function'
    ) {
      fetchAllInstrumentRelationships();
    }
  }, [fetchAllInstrumentRelationships]);

  const {
    searchTerm,
    setSearchTerm,
    showFilters,
    setShowFilters,
    filters,
    filteredClients,
    filterOptions,
    handleFilterChange,
    handleColumnSort,
    getSortArrow,
    getActiveFiltersCount,
  } = useFilters(clients, clientsWithInstruments);

  // UI states using common hooks
  const { isOpen: showModal, openModal, closeModal } = useModalState();

  // Custom hooks for specific functionality
  const {
    showViewModal,
    selectedClient,
    isEditing,
    openClientView,
    closeClientView,
    startEditing,
    stopEditing,
  } = useClientView();

  const {
    showInstrumentSearch,
    instrumentSearchTerm,
    searchResults,
    isSearchingInstruments,
    openInstrumentSearch,
    closeInstrumentSearch,
    handleInstrumentSearch,
  } = useInstrumentSearch();

  const {
    // ownedItems,
    // loadingOwnedItems,
    fetchOwnedItems,
    clearOwnedItems,
  } = useOwnedItems();

  // Toggle instrument search
  const toggleInstrumentSearch = () => {
    if (showInstrumentSearch) closeInstrumentSearch();
    else openInstrumentSearch();
  };

  const handleSubmit = async (
    clientData: Omit<Client, 'id' | 'created_at'>
  ) => {
    try {
      // client_number가 없으면 자동 생성
      if (!clientData.client_number) {
        const existingNumbers = clients
          .map(c => c.client_number)
          .filter((num): num is string => num !== null && num !== undefined);
        clientData.client_number = generateClientNumber(existingNumbers);
      }

      const newClient = await createClient(clientData);

      if (newClient) {
        closeModal();
      }
    } catch (error) {
      handleError(error, 'Failed to create client');
    }
  };

  const handleDeleteClient = async () => {
    if (!selectedClient) return;

    const confirmed = window.confirm(
      'Are you sure you want to delete this client? This action cannot be undone.'
    );
    if (!confirmed) return;

    try {
      const success = await deleteClient(selectedClient.id);

      if (success) {
        closeClientView();
      }
    } catch (error) {
      handleError(error, 'Failed to delete client');
    }
  };

  const handleRowClick = (client: Client) => {
    // 바로 편집 모드로 열기
    openClientView(client, true);

    // Fetch instrument relationships for this client
    fetchInstrumentRelationships(client.id);

    // Fetch owned items if client has Owner tag
    if (client.tags && client.tags.includes('Owner')) {
      fetchOwnedItems(client);
    } else {
      clearOwnedItems();
    }
  };

  const addInstrumentRelationship = async (
    instrumentId: string,
    relationshipType: ClientInstrument['relationship_type'] = 'Interested'
  ) => {
    if (!selectedClient) return;

    try {
      await addInstrumentRelationshipHook(
        selectedClient.id,
        instrumentId,
        relationshipType
      );

      // Refresh relationships
      await fetchInstrumentRelationships(selectedClient.id);
      closeInstrumentSearch();
    } catch (error) {
      handleError(error, 'Failed to add instrument relationship');
    }
  };

  const removeInstrumentRelationship = async (relationshipId: string) => {
    try {
      await removeInstrumentRelationshipHook(relationshipId);

      // Refresh relationships
      if (selectedClient) {
        await fetchInstrumentRelationships(selectedClient.id);
      }
    } catch (error) {
      handleError(error, 'Failed to remove instrument relationship');
    }
  };

  return (
    <ErrorBoundary>
      <AppLayout
        title="Clients"
        actionButton={{
          label: 'Add Client',
          onClick: openModal,
          icon: (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          ),
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <SpinnerLoading message="Loading clients..." />
          </div>
        ) : (
          <div className="p-6">
            {/* Search and Filters */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <input
                  placeholder="Search clients..."
                  className="w-full max-w-lg h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                <div className="ml-4">
                  <button
                    data-filter-button
                    onClick={() => setShowFilters(!showFilters)}
                    className="h-10 px-3 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    Filters{' '}
                    {getActiveFiltersCount() > 0 &&
                      `(${getActiveFiltersCount()})`}
                  </button>
                </div>
              </div>

              {/* Filter Panel */}
              {showFilters && (
                <ClientFilters
                  isOpen={showFilters}
                  onClose={() => setShowFilters(false)}
                  filters={filters}
                  filterOptions={filterOptions}
                  onFilterChange={handleFilterChange}
                />
              )}
            </div>

            {/* Clients Table */}
            {loading ? (
              <SpinnerLoading message="Loading clients..." />
            ) : (
              <ClientList
                clients={filteredClients}
                clientInstruments={instrumentRelationships}
                onClientClick={handleRowClick}
                onUpdateClient={async (clientId, updates) => {
                  try {
                    const result = await updateClient(clientId, updates);
                    if (!result) {
                      // updateClient returns null on error
                      throw new Error('Failed to update client');
                    }
                    // Don't return result, just ensure it's not null
                  } catch (error) {
                    handleError(error, 'Failed to update client');
                    throw error; // Re-throw to prevent saveEditing from closing editing mode
                  }
                }}
                onDeleteClient={async (clientId: string) => {
                  try {
                    const success = await deleteClient(clientId);
                    if (!success) {
                      throw new Error('Failed to delete client');
                    }
                  } catch (error) {
                    handleError(error, 'Failed to delete client');
                  }
                }}
                onColumnSort={handleColumnSort}
                getSortArrow={getSortArrow}
                onAddInstrument={async (
                  clientId,
                  instrumentId,
                  relationshipType = 'Interested'
                ) => {
                  await addInstrumentRelationshipHook(
                    clientId,
                    instrumentId,
                    relationshipType
                  );
                  await fetchInstrumentRelationships(clientId);
                }}
                onRemoveInstrument={async (relationshipId: string) => {
                  await removeInstrumentRelationshipHook(relationshipId);
                  // Refresh all relationships to update the list
                  // Find the client ID from the relationship
                  const relationship = instrumentRelationships.find(
                    r => r.id === relationshipId
                  );
                  if (relationship) {
                    await fetchInstrumentRelationships(relationship.client_id);
                  }
                }}
              />
            )}
          </div>
        )}

        {/* Add Client Form */}
        <ClientForm
          isOpen={showModal}
          onClose={closeModal}
          onSubmit={handleSubmit}
          submitting={submitting}
        />

        {/* View/Edit Client Modal */}
        <ClientModal
          isOpen={showViewModal}
          onClose={closeClientView}
          client={selectedClient}
          isEditing={isEditing}
          onEdit={startEditing}
          onSave={async (clientData: Partial<Client>) => {
            if (selectedClient) {
              await updateClient(selectedClient.id, clientData);
              stopEditing();
              // Update local view data
              // updateViewFormData(clientData)
            }
          }}
          onDelete={handleDeleteClient}
          onCancel={stopEditing}
          submitting={submitting}
          instrumentRelationships={instrumentRelationships}
          onAddInstrument={addInstrumentRelationship}
          onRemoveInstrument={removeInstrumentRelationship}
          onSearchInstruments={handleInstrumentSearch}
          searchResults={searchResults}
          isSearchingInstruments={isSearchingInstruments}
          showInstrumentSearch={showInstrumentSearch}
          onToggleInstrumentSearch={toggleInstrumentSearch}
          instrumentSearchTerm={instrumentSearchTerm}
          onInstrumentSearchTermChange={handleInstrumentSearch}
        />

        {/* Error Toasts */}
        <ErrorToasts />
      </AppLayout>
    </ErrorBoundary>
  );
}
