'use client';
import Link from 'next/link';
import { Client, ClientInstrument } from '@/types';
import dynamic from 'next/dynamic';
import { useUnifiedClients } from '@/hooks/useUnifiedData';
import {
  useClientInstruments,
  useFilters,
  useClientView,
  useInstrumentSearch,
  useOwnedItems,
} from './hooks';
import { ClientForm, ClientFilters } from './components';
const ClientList = dynamic(() => import('./components/ClientList'), {
  ssr: true,
  loading: () => (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <div className="text-gray-500 text-lg">Loading list...</div>
      </div>
    </div>
  ),
});
const ClientModal = dynamic(() => import('./components/ClientModal'), {
  ssr: false,
});
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { logError } from '@/utils/logger';
import { useModalState } from '@/hooks/useModalState';
import { AppLayout } from '@/components/layout';
import { ErrorBoundary } from '@/components/common';

export default function ClientsPage() {
  // Error handling
  const { ErrorToasts } = useErrorHandler();

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
  } = useClientInstruments();

  const {
    searchTerm,
    setSearchTerm,
    showFilters,
    setShowFilters,
    filters,
    filteredClients,
    filterOptions,
    handleFilterChange,
    clearAllFilters,
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
      const newClient = await createClient(clientData);

      if (newClient) {
        closeModal();
      }
    } catch (error) {
      logError('Error adding client', error, 'ClientsPage');
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
        // Close modal
        closeClientView();
        // TODO: Replace with toast notification
        //errorHandler.addSuccess('Client deleted successfully!')
      }
    } catch (error) {
      logError('Error deleting client:', error);
    }
  };

  const handleRowClick = (client: Client) => {
    openClientView(client);

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
      logError('Error adding instrument relationship:', error);
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
      logError('Error removing instrument relationship:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading clients...</p>
        </div>
      </div>
    );
  }

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
        <div className="p-4">
          <div className="flex items-center mb-6">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            </div>
            <span
              className={`ml-3 text-lg font-semibold text-gray-900 transition-opacity duration-300 ${'opacity-100'}`}
            >
              Inventory App
            </span>
          </div>

          <nav className="space-y-1">
            <Link
              href="/dashboard"
              className={`px-6 py-3 hover:bg-gray-50 cursor-pointer transition-all duration-300 ${'justify-start'} flex items-center`}
            >
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
              <span
                className={`ml-3 text-gray-700 transition-opacity duration-300 ${'opacity-100'}`}
              >
                Items
              </span>
            </Link>

            <Link
              href="/clients"
              className={`px-6 py-3 bg-blue-50 border-r-2 border-blue-500 transition-all duration-300 ${'justify-start'} flex items-center`}
            >
              <svg
                className="w-5 h-5 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <span
                className={`ml-3 text-blue-700 font-medium transition-opacity duration-300 ${'opacity-100'}`}
              >
                Clients
              </span>
            </Link>
            <Link
              href="/form"
              className={`px-6 py-3 hover:bg-gray-50 cursor-pointer transition-all duration-300 ${'justify-start'} flex items-center`}
            >
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span
                className={`ml-3 text-gray-700 transition-opacity duration-300 ${'opacity-100'}`}
              >
                Connected Clients
              </span>
            </Link>
          </nav>
        </div>

        <div className="p-6">
          {/* Search and Filters */}
          <div className="bg-white p-4 lg:p-4 rounded-lg shadow mb-6 border border-gray-200 relative">
            <div className="flex flex-col lg:flex-row lg:flex-wrap gap-4 items-stretch lg:items-center mb-4">
              <div className="flex-1 lg:min-w-64 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg
                    className="h-5 w-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search by name, email, or contact..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white text-gray-900 placeholder-gray-500 transition-all duration-200"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
              <button
                data-filter-button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-3 lg:py-2 border border-gray-300 rounded-md hover:bg-gray-50 hover:border-gray-400 text-gray-700 flex items-center gap-2 transition-all duration-200 flex-1 lg:flex-none justify-center focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z"
                  />
                </svg>
                Filters
                {getActiveFiltersCount() > 0 && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                    {getActiveFiltersCount()}
                  </span>
                )}
              </button>
            </div>

            {/* Filter Panel */}
            <ClientFilters
              isOpen={showFilters}
              onClose={() => setShowFilters(false)}
              filters={filters}
              filterOptions={filterOptions}
              onFilterChange={handleFilterChange}
              onClearAllFilters={clearAllFilters}
              getActiveFiltersCount={getActiveFiltersCount}
            />
          </div>

          {/* Clients Table */}
          {loading ? (
            <div className="bg-white rounded-lg shadow border border-gray-200">
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <div className="text-gray-500 text-lg">Loading clients...</div>
                <div className="text-gray-400 text-sm mt-2">
                  Please wait while we fetch your data
                </div>
              </div>
            </div>
          ) : (
            <ClientList
              clients={filteredClients}
              clientInstruments={instrumentRelationships}
              onClientClick={handleRowClick}
              onUpdateClient={async (clientId, updates) => {
                await updateClient(clientId, updates);
              }}
              onColumnSort={handleColumnSort}
              getSortArrow={getSortArrow}
            />
          )}
        </div>

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
