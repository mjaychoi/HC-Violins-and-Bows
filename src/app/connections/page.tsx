'use client';

import { useState, useMemo, useEffect } from 'react';
import type { RelationshipType, ClientInstrument } from '@/types';
import { useConnectedClientsData } from '@/hooks/useUnifiedData';
import { useConnectionFilters, useConnectionEdit } from './hooks';
import {
  ConnectionModal,
  FilterBar,
  ConnectionsList,
  LoadingState,
  EditConnectionModal,
  ConnectionSearch,
} from './components';
import EmptyState from '@/components/common/EmptyState';
import { useErrorHandler } from '@/contexts/ToastContext';
import { useLoadingState } from '@/hooks/useLoadingState';
import { useFilterSort } from '@/hooks/useFilterSort';
import { AppLayout } from '@/components/layout';
import { ErrorBoundary } from '@/components/common';

export default function ConnectedClientsPage() {
  // Error handling
  const { handleError } = useErrorHandler();

  // Custom hooks
  const {
    clients,
    instruments,
    connections,
    createConnection,
    updateConnection,
    deleteConnection,
  } = useConnectedClientsData();

  // Loading states
  const { loading, submitting, withSubmitting } = useLoadingState();
  // FIXED: useLoadingState returns boolean, so use it directly
  const isLoading = loading;

  // Connection form state
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  // FIXED: Store only IDs to avoid stale objects and reduce state duplication
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedInstrumentId, setSelectedInstrumentId] = useState('');
  const [relationshipType, setRelationshipType] =
    useState<RelationshipType>('Interested');
  const [connectionNotes, setConnectionNotes] = useState('');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [instrumentSearchTerm, setInstrumentSearchTerm] = useState('');
  const [connectionSearchTerm, setConnectionSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // FIXED: Create searchable connections with nested field support
  // Includes all searchable fields: relationship_type, notes, client info, instrument info, tags, price
  const connectionsWithSearch = useMemo(() => {
    return connections.map(c => ({
      ...c,
      _searchText: [
        c.relationship_type,
        c.notes,
        c.client?.first_name,
        c.client?.last_name,
        c.client?.email,
        ...(c.client?.tags ?? []),
        c.instrument?.maker,
        c.instrument?.type,
        c.instrument?.year?.toString(),
        c.instrument?.price?.toString(),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    }));
  }, [connections]);

  // Search and filter hooks (unified)
  const { items: filteredConnections } = useFilterSort(connectionsWithSearch, {
    searchFields: ['_searchText'],
    externalSearchTerm: connectionSearchTerm,
    debounceMs: 200,
  });

  const { items: filteredClients } = useFilterSort(clients, {
    searchFields: ['first_name', 'last_name', 'email'],
    externalSearchTerm: clientSearchTerm,
    debounceMs: 200,
  });

  const { items: filteredItems } = useFilterSort(instruments, {
    searchFields: ['maker', 'type'],
    externalSearchTerm: instrumentSearchTerm,
    debounceMs: 200,
  });

  // Use connection filters hook
  const {
    selectedFilter,
    setSelectedFilter,
    groupedConnections,
    relationshipTypeCounts,
  } = useConnectionFilters(filteredConnections);

  // Calculate total pages for pagination clamp
  const totalPages = useMemo(() => {
    const totalCount = filteredConnections.length;
    return Math.ceil(totalCount / pageSize);
  }, [filteredConnections.length, pageSize]);

  // Clamp currentPage when filter/search changes
  useEffect(() => {
    setCurrentPage(p => Math.max(1, Math.min(p, totalPages || 1)));
  }, [totalPages]);

  // 필터 변경 시 페이지를 1로 리셋
  // FIXED: Use RelationshipType instead of string
  const handleFilterChange = (filter: RelationshipType | null) => {
    setSelectedFilter(filter);
    setCurrentPage(1);
  };

  // 검색어 변경 시 페이지를 1로 리셋
  const handleSearchChange = (term: string) => {
    setConnectionSearchTerm(term);
    setCurrentPage(1);
  };

  // Clear filters handler
  const handleClearFilters = () => {
    handleFilterChange(null);
    setConnectionSearchTerm('');
    setCurrentPage(1);
  };

  // Use connection edit hook
  const { showEditModal, editingConnection, openEditModal, closeEditModal } =
    useConnectionEdit();

  // FIXED: Reset form when closing modal
  const resetConnectionForm = () => {
    setSelectedClientId('');
    setSelectedInstrumentId('');
    setRelationshipType('Interested');
    setConnectionNotes('');
    setClientSearchTerm('');
    setInstrumentSearchTerm('');
    // Note: connectionSearchTerm is not reset here - user may want to keep search
  };

  // Handle connection creation
  const handleCreateConnection = async (
    clientId: string,
    itemId: string,
    relationshipType: RelationshipType,
    notes: string
  ) => {
    try {
      await withSubmitting(async () => {
        await createConnection(clientId, itemId, relationshipType, notes);
        setShowConnectionModal(false);
        resetConnectionForm();
      });
    } catch (error) {
      handleError(error, 'Failed to create connection');
    }
  };

  // Handle connection update
  const handleUpdateConnection = async (
    connectionId: string,
    updates: { relationshipType: RelationshipType; notes: string }
  ) => {
    try {
      await withSubmitting(async () => {
        await updateConnection(connectionId, updates);
        closeEditModal();
      });
    } catch (error) {
      handleError(error, 'Failed to update connection');
    }
  };

  // Handle connection delete - wrapper to convert connection object to ID
  const handleDeleteConnection = async (connection: ClientInstrument) => {
    try {
      await withSubmitting(async () => {
        await deleteConnection(connection.id);
      });
    } catch (error) {
      handleError(error, 'Failed to delete connection');
    }
  };

  return (
    <ErrorBoundary>
      <AppLayout
        title="Connected Clients"
        actionButton={{
          label: 'Add Connection',
          onClick: () => setShowConnectionModal(true),
          icon: (
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          ),
        }}
      >
        <div className="p-6">
          {/* Search Bar */}
          <div className="mb-4">
            <ConnectionSearch
              searchTerm={connectionSearchTerm}
              onSearchChange={handleSearchChange}
            />
          </div>

          {/* Filter Bar */}
          <FilterBar
            selectedFilter={selectedFilter}
            onFilterChange={handleFilterChange}
            relationshipTypeCounts={relationshipTypeCounts}
            totalConnections={filteredConnections.length}
          />

          {/* Connection Modal */}
          <ConnectionModal
            isOpen={showConnectionModal}
            onClose={() => {
              setShowConnectionModal(false);
              resetConnectionForm();
            }}
            onSubmit={handleCreateConnection}
            submitting={submitting}
            clients={filteredClients}
            items={filteredItems}
            clientSearchTerm={clientSearchTerm}
            instrumentSearchTerm={instrumentSearchTerm}
            onClientSearchChange={setClientSearchTerm}
            onInstrumentSearchChange={setInstrumentSearchTerm}
            selectedClient={selectedClientId}
            selectedInstrument={selectedInstrumentId}
            relationshipType={relationshipType}
            connectionNotes={connectionNotes}
            onClientChange={setSelectedClientId}
            onInstrumentChange={setSelectedInstrumentId}
            onRelationshipTypeChange={setRelationshipType}
            onNotesChange={setConnectionNotes}
          />

          {/* Edit Connection Modal */}
          <EditConnectionModal
            isOpen={showEditModal}
            onClose={closeEditModal}
            onSave={handleUpdateConnection}
            connection={editingConnection}
            clients={filteredClients}
            items={filteredItems}
          />

          {/* Main Content */}
          {(() => {
            const hasAnyConnections = connections.length > 0;
            const hasResults = filteredConnections.length > 0;

            if (isLoading) {
              return <LoadingState />;
            }

            if (!hasAnyConnections) {
              return (
                <EmptyState
                  title="No connections"
                  description="Get started by creating your first client-item connection."
                  actionButton={{
                    label: 'Create Connection',
                    onClick: () => setShowConnectionModal(true),
                    icon: (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
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
                />
              );
            }

            if (!hasResults) {
              return (
                <div className="py-10 text-center">
                  <div className="text-gray-400 text-5xl mb-3">🔎</div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    No results
                  </h3>
                  <p className="text-gray-500 mt-1">
                    Try clearing filters or searching with different keywords.
                  </p>
                  <div className="mt-5 flex justify-center gap-2">
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={handleClearFilters}
                    >
                      Clear filters
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                      onClick={() => setShowConnectionModal(true)}
                    >
                      Add connection
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <ConnectionsList
                groupedConnections={groupedConnections}
                selectedFilter={selectedFilter}
                onEditConnection={openEditModal}
                onDeleteConnection={handleDeleteConnection}
                currentPage={currentPage}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                loading={isLoading}
              />
            );
          })()}
        </div>
      </AppLayout>
    </ErrorBoundary>
  );
}
