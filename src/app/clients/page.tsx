'use client';
import { Client, ClientInstrument, Instrument } from '@/types';
import dynamic from 'next/dynamic';
import {
  useUnifiedClients,
  useUnifiedConnections,
  useUnifiedInstruments,
} from '@/hooks/useUnifiedData';
import { apiFetch } from '@/utils/apiFetch';
import { generateClientNumber } from '@/utils/uniqueNumberGenerator';
import {
  useClientInstruments,
  useClientView,
  useInstrumentSearch,
  useOwnedItems,
} from './hooks';
import { ClientForm } from './components';
import ClientsListContent from './components/ClientsListContent';
import { TableSkeleton, CardSkeleton } from '@/components/common';
const ClientModal = dynamic(() => import('./components/ClientModal'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
        <CardSkeleton count={1} />
      </div>
    </div>
  ),
});
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useModalState } from '@/hooks/useModalState';
import { AppLayout } from '@/components/layout';
import { ErrorBoundary, ConfirmDialog } from '@/components/common';
import React, { useEffect, useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';

type PendingInstrumentLink = {
  instrument: Instrument;
  relationshipType: ClientInstrument['relationship_type'];
};

export default function ClientsPage() {
  // Error/Success handling
  const { handleError, showSuccess, showWarning } = useAppFeedback();
  const { canCreateClient, createClientDisabledReason } = usePermissions();
  const { tenantIdentityKey } = useTenantIdentity();
  const [confirmDelete, setConfirmDelete] = useState<Client | null>(null);

  // Track newly created client for scroll/highlight feedback
  const [newlyCreatedClientId, setNewlyCreatedClientId] = useState<
    string | null
  >(null);
  const [atomicSubmitting, setAtomicSubmitting] = useState(false);

  // FIXED: useUnifiedData is now called at root layout level
  // No need to call it here - data is already fetched

  // Custom hooks
  const {
    clients,
    loading,
    submitting,
    createClient,
    updateClient,
    deleteClient,
    upsertClient,
  } = useUnifiedClients();

  const { fetchConnections, upsertConnections } = useUnifiedConnections();

  const { instruments } = useUnifiedInstruments();

  // useClientInstruments uses DataContext connections directly
  // No separate fetching needed - DataContext handles all data fetching
  const {
    instrumentRelationships,
    clientsWithInstruments,
    addInstrumentRelationship: addInstrumentRelationshipHook,
    removeInstrumentRelationship: removeInstrumentRelationshipHook,
  } = useClientInstruments();

  // Note: Filters are now handled in ClientsListContent component
  // to support Suspense boundary for useSearchParams()

  // 디버깅: 데이터 로딩 상태 확인 (개발 환경에서만) - 무한 루프 방지를 위해 최소화
  // useEffect(() => {
  //   console.log('[ClientsPage] Data state:', {
  //     clientsCount: clients.length,
  //     loading: loading.any,
  //     loadingClients: loading.clients,
  //     filteredClientsCount: filteredClients.length,
  //   });
  // }, [clients.length, loading.any, loading.clients, filteredClients.length]);

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
    viewFormData,
    showInterestDropdown,
    updateViewFormData,
    handleViewInputChange,
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
    clientData: Omit<Client, 'id' | 'created_at'>,
    instruments?: PendingInstrumentLink[]
  ): Promise<{
    status: 'full_success' | 'partial_success' | 'full_failure';
    clientId?: string;
    failedLinks?: PendingInstrumentLink[];
  }> => {
    try {
      // client_number가 없으면 자동 생성
      // Create new object instead of mutating parameter (immutable pattern)
      const withClientNumber: Omit<Client, 'id' | 'created_at'> = {
        ...clientData,
        client_number:
          clientData.client_number ??
          generateClientNumber(
            clients
              .map(c => c.client_number)
              .filter((num): num is string => num !== null && num !== undefined)
          ),
      };

      if (instruments && instruments.length > 0) {
        setAtomicSubmitting(true);
        try {
          const res = await apiFetch('/api/clients/with-connections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...withClientNumber,
              instrumentLinks: instruments.map(p => ({
                instrument_id: p.instrument.id,
                relationship_type: p.relationshipType,
                notes: null,
              })),
            }),
          });

          const body = (await res.json().catch(() => null)) as {
            data?: {
              client?: Client;
              connections?: ClientInstrument[];
            };
            error?: string;
            message?: string;
          } | null;

          if (!res.ok) {
            const errMsg =
              (typeof body?.error === 'string' && body.error) ||
              (typeof body?.message === 'string' && body.message) ||
              'Failed to create client';
            handleError(new Error(errMsg), errMsg);
            return { status: 'full_failure' };
          }

          const createdClient = body?.data?.client;
          const clientId = createdClient?.id;
          const createdConnections = body?.data?.connections;

          if (!clientId || !createdClient) {
            handleError(
              new Error('Invalid response'),
              'Failed to create client'
            );
            return { status: 'full_failure' };
          }

          // API already materialized the new client and links; patch stores to avoid redundant list refetches.
          upsertClient(createdClient);
          if (
            Array.isArray(createdConnections) &&
            createdConnections.length > 0
          ) {
            upsertConnections(createdConnections);
          } else {
            // Should not happen on success, but if the payload is missing links, re-sync from the server.
            void fetchConnections({ all: true, force: true });
          }

          setNewlyCreatedClientId(clientId);

          showSuccess('Client and instrument links created successfully');
          return {
            status: 'full_success',
            clientId,
          };
        } catch (error) {
          handleError(error, 'Client creation failed');
          return { status: 'full_failure' };
        } finally {
          setAtomicSubmitting(false);
        }
      }

      const newClient = await createClient(withClientNumber);
      if (!newClient) {
        handleError(
          new Error('Client creation failed'),
          'Failed to create client'
        );
        return { status: 'full_failure' };
      }

      setNewlyCreatedClientId(newClient.id);

      showSuccess('Client created successfully');
      return {
        status: 'full_success',
        clientId: newClient.id,
      };
    } catch (error) {
      handleError(error, 'Client creation failed');
      return { status: 'full_failure' };
    }
  };

  const handleRetryInstrumentLinks = async (
    clientId: string,
    instruments: PendingInstrumentLink[]
  ): Promise<{
    status: 'full_success' | 'partial_success' | 'full_failure';
    failedLinks?: PendingInstrumentLink[];
  }> => {
    const linkFailures: PendingInstrumentLink[] = [];

    for (const pendingLink of instruments) {
      try {
        const link = await addInstrumentRelationshipHook(
          clientId,
          pendingLink.instrument.id,
          pendingLink.relationshipType
        );
        if (!link) {
          linkFailures.push(pendingLink);
        }
      } catch {
        linkFailures.push(pendingLink);
      }
    }

    if (linkFailures.length > 0) {
      showWarning(
        'Some instrument links could not be created. You can retry from the client profile.'
      );
      return {
        status: 'partial_success',
        failedLinks: linkFailures,
      };
    }

    showSuccess('Client and instrument links created successfully');
    return { status: 'full_success' };
  };

  const handleDeleteClient = () => {
    if (!selectedClient) return;
    setConfirmDelete(selectedClient);
  };

  useEffect(() => {
    setConfirmDelete(null);
    setNewlyCreatedClientId(null);
    clearOwnedItems();
  }, [clearOwnedItems, tenantIdentityKey]);

  const confirmDeleteClient = async () => {
    if (!confirmDelete) return;

    try {
      const success = await deleteClient(confirmDelete.id);

      if (success) {
        closeClientView();
        showSuccess('Client deleted successfully.');
      }
    } catch (error) {
      handleError(error, 'Failed to delete client');
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleRowClick = (client: Client) => {
    // 바로 편집 모드로 열기
    openClientView(client, true);

    // Instrument relationships are already available from DataContext
    // No need to fetch separately - they're managed by useUnifiedData

    // Fetch owned items if client has Owner tag with error handling
    if (client.tags?.includes('Owner')) {
      fetchOwnedItems(client).catch(error => {
        handleError(error, 'Failed to fetch owned items');
      });
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
      const connection = await addInstrumentRelationshipHook(
        selectedClient.id,
        instrumentId,
        relationshipType
      );

      if (!connection) {
        return;
      }

      // Relationships are automatically updated in DataContext
      closeInstrumentSearch();

      {
        const instrument = instruments.find(i => i.id === instrumentId);
        const instrumentName =
          instrument?.maker && instrument?.serial_number
            ? `${instrument.maker} (${instrument.serial_number})`
            : instrument?.maker || instrument?.serial_number || '악기';
        const clientName =
          selectedClient.first_name || selectedClient.last_name
            ? `${selectedClient.first_name || ''} ${selectedClient.last_name || ''}`.trim()
            : selectedClient.email || '클라이언트';

        const links: Array<{ label: string; href: string }> = [];
        if (instrumentId) {
          links.push({
            label: '악기 보기',
            href: `/dashboard?instrumentId=${instrumentId}`,
          });
        }
        if (selectedClient.id) {
          links.push({
            label: '클라이언트 보기',
            href: `/clients?clientId=${selectedClient.id}`,
          });
        }

        showSuccess(
          `연결이 추가되었습니다. ${instrumentName}과 ${clientName}이 연결되었습니다.`,
          links.length > 0 ? links : undefined
        );
      }
    } catch (error) {
      handleError(error, 'Failed to add instrument relationship');
    }
  };

  const removeInstrumentRelationship = async (relationshipId: string) => {
    try {
      const ok = await removeInstrumentRelationshipHook(relationshipId);
      if (!ok) {
        return;
      }

      // Relationships are automatically updated in DataContext
      // No need to manually refresh
      showSuccess('Instrument connection removed.');
    } catch (error) {
      handleError(error, 'Failed to remove instrument relationship');
    }
  };

  return (
    <ErrorBoundary>
      <AppLayout
        title="Clients"
        actionButton={
          canCreateClient || createClientDisabledReason
            ? {
                label: 'Add Client',
                onClick: canCreateClient
                  ? openModal
                  : () => {
                      /* disabled — see disabledReason */
                    },
                disabled:
                  !canCreateClient ||
                  submitting.hasAnySubmitting ||
                  atomicSubmitting,
                disabledReason: !canCreateClient
                  ? createClientDisabledReason
                  : submitting.hasAnySubmitting || atomicSubmitting
                    ? 'Please wait for the current submission to finish'
                    : undefined,
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
              }
            : undefined
        }
      >
        {loading.hasAnyLoading ? (
          <div className="p-6">
            <TableSkeleton rows={8} columns={7} />
          </div>
        ) : (
          <ClientsListContent
            clients={clients}
            clientsWithInstruments={clientsWithInstruments}
            instrumentRelationships={instrumentRelationships}
            loading={loading}
            onClientClick={handleRowClick}
            onUpdateClient={async (clientId, updates) => {
              try {
                const result = await updateClient(clientId, updates);
                if (!result) {
                  // updateClient returns null on error
                  throw new Error('Failed to update client');
                }
                showSuccess('Client information updated successfully.');
              } catch (error) {
                handleError(error, 'Failed to update client');
                throw error; // Re-throw to prevent saveEditing from closing editing mode
              }
            }}
            onDeleteClient={(client: Client) => {
              setConfirmDelete(client);
            }}
            newlyCreatedClientId={newlyCreatedClientId}
            onNewlyCreatedClientShown={() => setNewlyCreatedClientId(null)}
          />
        )}

        {/* Add Client Form */}
        <ClientForm
          isOpen={showModal}
          onClose={closeModal}
          onSubmit={handleSubmit}
          onRetryInstrumentLinks={handleRetryInstrumentLinks}
          submitting={submitting.hasAnySubmitting || atomicSubmitting}
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
              const updated = await updateClient(selectedClient.id, clientData);
              if (!updated) {
                return;
              }
              stopEditing();
              showSuccess('Client information updated successfully.');
            }
          }}
          onDelete={handleDeleteClient}
          onCancel={stopEditing}
          submitting={submitting.hasAnySubmitting}
          instrumentRelationships={instrumentRelationships}
          onAddInstrument={addInstrumentRelationship}
          onRemoveInstrument={removeInstrumentRelationship}
          searchResults={searchResults}
          isSearchingInstruments={isSearchingInstruments}
          showInstrumentSearch={showInstrumentSearch}
          onToggleInstrumentSearch={toggleInstrumentSearch}
          instrumentSearchTerm={instrumentSearchTerm}
          onInstrumentSearchTermChange={handleInstrumentSearch}
          viewFormData={viewFormData}
          showInterestDropdown={showInterestDropdown}
          onViewInputChange={handleViewInputChange}
          onUpdateViewFormData={updateViewFormData}
        />

        <ConfirmDialog
          isOpen={Boolean(confirmDelete)}
          title="Delete client?"
          message="Deleted clients cannot be recovered."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={confirmDeleteClient}
          onCancel={() => setConfirmDelete(null)}
        />
      </AppLayout>
    </ErrorBoundary>
  );
}
