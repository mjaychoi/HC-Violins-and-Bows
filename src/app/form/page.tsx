'use client';

import { useState } from 'react';
import { RelationshipType, Client, Instrument } from '@/types';
import { useUnifiedConnectionForm } from '@/hooks/useUnifiedData';
import { useConnectionFilters, useConnectionEdit } from './hooks';
import {
  ConnectionModal,
  FilterBar,
  ConnectionsList,
  EmptyState,
  LoadingState,
  EditConnectionModal,
} from './components';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { useLoadingState } from '@/hooks/useLoadingState';
import { useFilterSort } from '@/hooks/useFilterSort';
import { AppLayout } from '@/components/layout';
import { ErrorBoundary } from '@/components/common';

export default function ConnectedClientsPage() {
  // Error handling
  const { ErrorToasts } = useErrorHandler();

  // Custom hooks
  const {
    clients,
    instruments,
    connections,
    createConnection,
    updateConnection,
    deleteConnection,
  } = useUnifiedConnectionForm();

  // Loading states
  const { loading, submitting, withSubmitting } = useLoadingState();

  // Connection form state
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedInstrument, setSelectedInstrument] =
    useState<Instrument | null>(null);
  const [relationshipType, setRelationshipType] =
    useState<RelationshipType>('Interested');
  const [connectionNotes, setConnectionNotes] = useState('');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [instrumentSearchTerm, setInstrumentSearchTerm] = useState('');
  const [connectionSearchTerm] = useState('');

  // Search and filter hooks (unified)
  const { items: filteredConnections } = useFilterSort(connections, {
    searchFields: ['notes'],
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

  // Use connection edit hook
  const { showEditModal, editingConnection, openEditModal, closeEditModal } =
    useConnectionEdit();

  // Handle connection creation
  const handleCreateConnection = async (
    clientId: string,
    itemId: string,
    relationshipType: RelationshipType,
    notes: string
  ) => {
    await withSubmitting(async () => {
      await createConnection(clientId, itemId, relationshipType, notes);
      setShowConnectionModal(false);
    });
  };

  // Handle connection update
  const handleUpdateConnection = async (
    connectionId: string,
    updates: { relationshipType: RelationshipType; notes: string }
  ) => {
    await withSubmitting(async () => {
      await updateConnection(connectionId, updates);
      closeEditModal();
    });
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
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          ),
        }}
      >
        <div className="p-6">
          {/* Search and Filter Bar */}
          <FilterBar
            selectedFilter={selectedFilter}
            onFilterChange={setSelectedFilter}
            relationshipTypeCounts={relationshipTypeCounts}
            totalConnections={connections.length}
          />

          {/* Connection Modal */}
          <ConnectionModal
            isOpen={showConnectionModal}
            onClose={() => setShowConnectionModal(false)}
            onSubmit={handleCreateConnection}
            submitting={submitting}
            clients={filteredClients}
            items={filteredItems}
            clientSearchTerm={clientSearchTerm}
            instrumentSearchTerm={instrumentSearchTerm}
            onClientSearchChange={setClientSearchTerm}
            onInstrumentSearchChange={setInstrumentSearchTerm}
            selectedClient={selectedClient?.id || ''}
            selectedInstrument={selectedInstrument?.id || ''}
            relationshipType={relationshipType}
            connectionNotes={connectionNotes}
            onClientChange={(clientId: string) => {
              const client = clients.find(c => c.id === clientId);
              setSelectedClient(client || null);
            }}
            onInstrumentChange={(itemId: string) => {
              const instrument = instruments.find(i => i.id === itemId);
              setSelectedInstrument(instrument || null);
            }}
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
          {loading ? (
            <LoadingState />
          ) : connections.length === 0 ? (
            <EmptyState
              onCreateConnection={() => setShowConnectionModal(true)}
            />
          ) : (
            <ConnectionsList
              groupedConnections={groupedConnections}
              selectedFilter={selectedFilter}
              onEditConnection={openEditModal}
              onDeleteConnection={deleteConnection}
            />
          )}
        </div>

        {/* Error Toasts */}
        <ErrorToasts />
      </AppLayout>
    </ErrorBoundary>
  );
}
