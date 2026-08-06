'use client';

import { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import type { RelationshipType, ClientInstrument } from '@/types';
import { useConnectedClientsData } from '@/hooks/useUnifiedData';
import { useConnectionFilters, useConnectionEdit } from './hooks';
import { useURLState } from '@/hooks/useURLState';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';
import { ConnectionModal, ConnectionSearch } from './components';
import { RELATIONSHIP_TYPES } from './utils/connectionGrouping';
import EmptyState from '@/components/common/empty-state/EmptyState';
import { GuideModal } from '@/components/common/empty-state/GuideModal';
import { useErrorHandler } from '@/contexts/ToastContext';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useLoadingState } from '@/hooks/useLoadingState';
import { useFilterSort } from '@/hooks/useFilterSort';
import { usePermissions } from '@/hooks/usePermissions';
import { AppLayout } from '@/components/layout';
import { ErrorBoundary, TableSkeleton } from '@/components/common';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

// Dynamic imports for large dnd-kit related components
// This reduces initial bundle size by ~50KB+ (dnd-kit + sortable)
const FilterBar = dynamic(
  () =>
    import('./components/FilterBar').then(mod => ({ default: mod.FilterBar })),
  {
    ssr: false,
  }
);

const ConnectionsList = dynamic(
  () =>
    import('./components/ConnectionsList').then(mod => ({
      default: mod.ConnectionsList,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="p-6">
        <TableSkeleton rows={5} columns={1} />
      </div>
    ),
  }
);

const EditConnectionModal = dynamic(
  () =>
    import('./components/EditConnectionModal').then(mod => ({
      default: mod.EditConnectionModal,
    })),
  {
    ssr: false,
  }
);

// ConnectionCard is only used in DragOverlay, can be lazy loaded
const ConnectionCard = dynamic(
  () =>
    import('./components/ConnectionCard').then(mod => ({
      default: mod.ConnectionCard,
    })),
  {
    ssr: false,
  }
);

const CONNECTION_GUIDE_STEPS = [
  '클라이언트와 악기를 선택하세요',
  '관계 타입을 선택하세요 (Owned, Interested, Booked 등)',
  '연결을 저장하면 양쪽에서 확인할 수 있습니다',
];

// Component that uses useURLState (which uses useSearchParams) - must be wrapped in Suspense
function ConnectedClientsPageContent() {
  // Error handling
  const { handleError } = useErrorHandler();
  const { showSuccess } = useAppFeedback();
  const { canCreateConnection, canManageConnections } = usePermissions();

  // Custom hooks
  const {
    clients,
    instruments,
    connections,
    // Defaults keep this resilient to callers/mocks built against the
    // pre-F2/F5 shape of useConnectedClientsData that don't set these keys.
    loading: dataLoading = {
      clients: false,
      instruments: false,
      connections: false,
    },
    error: dataError = { connections: null },
    truncated = false,
    createConnection,
    updateConnection,
    deleteConnection,
    fetchConnections,
  } = useConnectedClientsData();

  // F5: the collection's own loading/error state, not a local
  // mutation-oriented flag - see `submitting` below for mutation state.
  const connectionsLoading = dataLoading.connections ?? false;
  const connectionsError = dataError?.connections ?? null;

  // Mutation (create/update/delete) submission state - intentionally
  // separate from collection loading so submitting a form never swaps the
  // whole page for a loading screen.
  const { submitting, withSubmitting } = useLoadingState();

  const { tenantIdentityKey } = useTenantIdentity();

  const { urlState, updateURLState } = useURLState({
    enabled: true,
    keys: ['search', 'filter', 'page'],
    paramMapping: {
      search: 'search',
      filter: 'filter',
      page: 'page',
    },
  });

  const isValidRelationshipFilter = useCallback(
    (value: string | null): value is RelationshipType =>
      value !== null && (RELATIONSHIP_TYPES as string[]).includes(value),
    []
  );

  // Initialize state from URL (urlState is hydrated synchronously on first
  // render - see useURLState - so this reflects the real URL immediately).
  const initialSearch = urlState.search ? String(urlState.search) : '';
  const rawInitialFilter = urlState.filter ? String(urlState.filter) : null;
  const initialFilter = isValidRelationshipFilter(rawInitialFilter)
    ? rawInitialFilter
    : null;
  const rawInitialPage = urlState.page
    ? parseInt(String(urlState.page), 10)
    : 1;
  const initialPage =
    isNaN(rawInitialPage) || rawInitialPage < 1 ? 1 : rawInitialPage;

  // Connection form state
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showConnectionsGuideModal, setShowConnectionsGuideModal] =
    useState(false);
  // FIXED: Store only IDs to avoid stale objects and reduce state duplication
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedInstrumentId, setSelectedInstrumentId] = useState('');
  const [relationshipType, setRelationshipType] =
    useState<RelationshipType>('Interested');
  const [connectionNotes, setConnectionNotes] = useState('');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [instrumentSearchTerm, setInstrumentSearchTerm] = useState('');
  const [connectionSearchTerm, setConnectionSearchTerm] =
    useState(initialSearch);
  const [currentPage, setCurrentPage] = useState(initialPage);
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
    selectedFilter: internalSelectedFilter,
    setSelectedFilter: setInternalSelectedFilter,
    groupedConnections,
    relationshipTypeCounts,
  } = useConnectionFilters(filteredConnections);

  // Initialize filter from URL
  const [selectedFilter, setSelectedFilter] = useState<RelationshipType | null>(
    initialFilter as RelationshipType | null
  );

  // Sync internal filter with URL filter
  useEffect(() => {
    if (selectedFilter !== internalSelectedFilter) {
      setInternalSelectedFilter(selectedFilter);
    }
  }, [selectedFilter, internalSelectedFilter, setInternalSelectedFilter]);

  // F6: react to *external* URL changes (browser back/forward, a bookmark
  // opened while already mounted, editing the address bar) after mount.
  // Self-triggered updateURLState calls do not flow back into `urlState`
  // (see useURLState's isUpdatingRef guard), so these effects only fire for
  // external navigation and never fight the user's own typing/clicking -
  // and since the value already matches on first render (urlState hydrates
  // synchronously), they are a no-op on mount.
  useEffect(() => {
    const urlSearch = urlState.search ? String(urlState.search) : '';
    setConnectionSearchTerm(prev => (prev === urlSearch ? prev : urlSearch));
  }, [urlState.search]);

  useEffect(() => {
    const rawFilter = urlState.filter ? String(urlState.filter) : null;
    const urlFilter = isValidRelationshipFilter(rawFilter) ? rawFilter : null;
    setSelectedFilter(prev => (prev === urlFilter ? prev : urlFilter));
  }, [urlState.filter, isValidRelationshipFilter]);

  useEffect(() => {
    const rawPage = urlState.page ? parseInt(String(urlState.page), 10) : 1;
    const urlPage = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
    setCurrentPage(prev => (prev === urlPage ? prev : urlPage));
  }, [urlState.page]);

  // F6: an invalid filter value (stale bookmark, manual URL edit) resets to
  // "no filter" above; also strip it from the URL instead of leaving
  // garbage in the address bar that would keep re-triggering this reset.
  useEffect(() => {
    const rawFilter = urlState.filter ? String(urlState.filter) : null;
    if (rawFilter !== null && !isValidRelationshipFilter(rawFilter)) {
      updateURLState({ filter: null });
    }
  }, [urlState.filter, isValidRelationshipFilter, updateURLState]);

  // F11: switching organizations must not leave a create-connection draft
  // referencing the previous org's clients/instruments alive. Close the
  // modal and clear every field/search/error tied to the create flow.
  useEffect(() => {
    setShowConnectionModal(false);
    setSelectedClientId('');
    setSelectedInstrumentId('');
    setRelationshipType('Interested');
    setConnectionNotes('');
    setClientSearchTerm('');
    setInstrumentSearchTerm('');
  }, [tenantIdentityKey]);

  // 페이지 변경 시 URL 업데이트
  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      updateURLState({
        page: page > 1 ? String(page) : null,
      });
    },
    [updateURLState]
  );

  // 필터 변경 시 페이지를 1로 리셋 및 URL 업데이트
  // FIXED: Use RelationshipType instead of string
  const handleFilterChange = useCallback(
    (filter: RelationshipType | null) => {
      setSelectedFilter(filter);
      setCurrentPage(1);
      updateURLState({
        filter: filter || null,
        page: null, // Reset page when filter changes
      });
    },
    [updateURLState]
  );

  // 검색어 변경 시 페이지를 1로 리셋 및 URL 업데이트
  const handleSearchChange = useCallback(
    (term: string) => {
      setConnectionSearchTerm(term);
      setCurrentPage(1);
      updateURLState({
        search: term || null,
        page: null, // Reset page when search changes
      });
    },
    [updateURLState]
  );

  // Clear filters handler
  const handleClearFilters = useCallback(() => {
    handleFilterChange(null);
    setConnectionSearchTerm('');
    setCurrentPage(1);
    updateURLState({
      filter: null,
      search: null,
      page: null,
    });
  }, [handleFilterChange, updateURLState]);

  // Calculate total pages for pagination clamp
  const totalPages = useMemo(() => {
    const totalCount = filteredConnections.length;
    return Math.ceil(totalCount / pageSize);
  }, [filteredConnections.length, pageSize]);

  // Clamp currentPage when filter/search changes
  useEffect(() => {
    const clampedPage = Math.max(1, Math.min(currentPage, totalPages || 1));
    if (clampedPage !== currentPage) {
      handlePageChange(clampedPage);
    }
  }, [totalPages, currentPage, handlePageChange]);

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
        const connection = await createConnection(
          clientId,
          itemId,
          relationshipType,
          notes
        );
        if (!connection) {
          return;
        }

        setShowConnectionModal(false);
        resetConnectionForm();

        const instrument = instruments.find(i => i.id === itemId);
        const client = clients.find(c => c.id === clientId);
        const instrumentName =
          instrument?.maker && instrument?.serial_number
            ? `${instrument.maker} (${instrument.serial_number})`
            : instrument?.maker || instrument?.serial_number || '악기';
        const clientName =
          client?.first_name || client?.last_name
            ? `${client.first_name || ''} ${client.last_name || ''}`.trim()
            : client?.email || '클라이언트';

        const links: Array<{ label: string; href: string }> = [];
        if (itemId) {
          links.push({
            label: '악기 보기',
            href: `/dashboard?instrumentId=${itemId}`,
          });
        }
        if (clientId) {
          links.push({
            label: '클라이언트 보기',
            href: `/clients?clientId=${clientId}`,
          });
        }

        showSuccess(
          `연결이 추가되었습니다. ${instrumentName}과 ${clientName}이 연결되었습니다.`,
          links.length > 0 ? links : undefined
        );
      });
    } catch (error) {
      handleError(error, 'Failed to create connection');
    }
  };

  // Handle connection update
  const handleUpdateConnection = async (
    connectionId: string,
    updates: Partial<{ relationshipType: RelationshipType; notes: string }>
  ) => {
    try {
      await withSubmitting(async () => {
        const updated = await updateConnection(connectionId, updates);
        if (updated) {
          closeEditModal();
        }
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

  // Handle connection type change: update relationship_type when dragged to different section or tab
  const handleConnectionTypeChange = useCallback(
    async (connectionId: string, newType: RelationshipType | 'all') => {
      // F10: defense in depth - the drag handle is not even rendered for
      // non-admins (see `canDrag` passed to ConnectionsList below), but a
      // permission change mid-session or a stray drop event must not be
      // able to trigger a reorder/type-change mutation either.
      if (!canManageConnections) {
        return;
      }

      try {
        await withSubmitting(async () => {
          // Find the connection to preserve existing notes
          const connection = connections.find(c => c.id === connectionId);
          if (!connection) {
            throw new Error('Connection not found');
          }

          // If dropped on "All" tab, don't change type (just filter view)
          if (newType === 'all') {
            return;
          }

          // Only relationshipType is sent - omitting notes lets the update
          // leave whatever notes currently exist on the row untouched,
          // instead of overwriting them with this possibly-stale local copy.
          await updateConnection(connectionId, {
            relationshipType: newType,
          });
          await fetchConnections({ all: true, force: true });
        });
      } catch (error) {
        handleError(error, 'Failed to update connection type');
      }
    },
    [
      withSubmitting,
      handleError,
      updateConnection,
      fetchConnections,
      connections,
      canManageConnections,
    ]
  );

  // Drag and drop state
  const [overTabType, setOverTabType] = useState<
    RelationshipType | 'all' | null
  >(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  // Handle drag over for visual feedback
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (!over) {
      setOverTabType(null);
      return;
    }

    // Check if over a tab button
    if (typeof over.id === 'string' && over.id.startsWith('tab-')) {
      const tabType = over.id.replace('tab-', '') as RelationshipType | 'all';
      setOverTabType(tabType);
    } else {
      setOverTabType(null);
    }
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setOverTabType(null);
      setActiveId(null);

      if (!over) {
        return;
      }

      // If dropped on a tab button, change relationship type
      if (typeof over.id === 'string' && over.id.startsWith('tab-')) {
        const newType = over.id.replace('tab-', '') as RelationshipType | 'all';
        const connectionId = active.id as string;

        if (newType !== 'all') {
          handleConnectionTypeChange(connectionId, newType);
        }
      }
    },
    [handleConnectionTypeChange]
  );

  // Find active connection for DragOverlay
  const activeConnection = useMemo(() => {
    if (!activeId) return null;
    return connections.find(c => c.id === activeId) || null;
  }, [activeId, connections]);

  return (
    <ErrorBoundary>
      <AppLayout
        title="Connected Clients"
        actionButton={
          canManageConnections
            ? {
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
              }
            : undefined
        }
      >
        <div className="p-6">
          {/* Search Bar */}
          <div className="mb-4">
            <ConnectionSearch
              searchTerm={connectionSearchTerm}
              onSearchChange={handleSearchChange}
            />
          </div>

          {/* Drag and Drop Context - wraps FilterBar and ConnectionsList */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragCancel={() => {
              setOverTabType(null);
              setActiveId(null);
            }}
          >
            {/* Filter Bar */}
            <FilterBar
              selectedFilter={selectedFilter}
              onFilterChange={handleFilterChange}
              relationshipTypeCounts={relationshipTypeCounts}
              totalConnections={filteredConnections.length}
              overTabType={overTabType}
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

            {/* F2: incomplete-results warning - shown whenever the org-wide
                fetch was truncated, independent of the current filter/search
                so it can never be hidden by narrowing the visible subset. */}
            {truncated && (
              <div
                role="status"
                className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
              >
                Showing a partial list of connections. This organization has
                more relationships than can be displayed at once, so search and
                counts may not reflect the complete collection.
              </div>
            )}

            {/* Main Content */}
            {(() => {
              const hasAnyConnections = connections.length > 0;
              const hasResults = filteredConnections.length > 0;
              // F5: only the *initial* load (no rows yet, no error) should
              // block rendering with a full loading screen. A background
              // refresh with existing rows keeps showing those rows.
              const isInitialLoading =
                connectionsLoading && !hasAnyConnections && !connectionsError;
              const handleRetryFetch = () => {
                void fetchConnections({ all: true, force: true });
              };

              if (isInitialLoading) {
                return (
                  <div className="flex justify-center items-center py-12">
                    <div className="text-gray-500">Loading connections...</div>
                  </div>
                );
              }

              if (connectionsError && !hasAnyConnections) {
                return (
                  <div className="py-10 text-center" role="alert">
                    <div className="text-gray-400 text-5xl mb-3">⚠️</div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Couldn&apos;t load connections
                    </h3>
                    <p className="text-gray-500 mt-1">
                      Something went wrong while loading your connections.
                    </p>
                    <div className="mt-5 flex justify-center gap-2">
                      <button
                        type="button"
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        onClick={handleRetryFetch}
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                );
              }

              if (!hasAnyConnections) {
                return (
                  <>
                    <EmptyState
                      title="No connections"
                      description="Get started by creating your first client-item connection."
                      actionButton={
                        canCreateConnection
                          ? {
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
                            }
                          : undefined
                      }
                      guideSteps={CONNECTION_GUIDE_STEPS}
                      helpLink={{
                        label: '연결 관리 방법 알아보기',
                        href: '#',
                        onClick: () => setShowConnectionsGuideModal(true),
                      }}
                    />
                    <GuideModal
                      isOpen={showConnectionsGuideModal}
                      onClose={() => setShowConnectionsGuideModal(false)}
                      title="연결 관리 가이드"
                      steps={CONNECTION_GUIDE_STEPS}
                    />
                  </>
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
                      {/* F10: creating a connection is a mutation - gate it
                          the same way the header/empty-state create actions
                          already are, instead of leaving it exposed here. */}
                      {canCreateConnection && (
                        <button
                          type="button"
                          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                          onClick={() => setShowConnectionModal(true)}
                        >
                          Add connection
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <>
                  {/* F5: a background refetch failure keeps showing the last
                      known-good rows alongside a retry affordance, instead
                      of replacing them with an error screen. */}
                  {connectionsError && (
                    <div
                      role="alert"
                      className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
                    >
                      <span>
                        Couldn&apos;t refresh connections. Showing the last
                        loaded data.
                      </span>
                      <button
                        type="button"
                        className="shrink-0 rounded-md border border-red-300 px-3 py-1 font-medium hover:bg-red-100 transition-colors"
                        onClick={handleRetryFetch}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  <ConnectionsList
                    groupedConnections={groupedConnections}
                    selectedFilter={selectedFilter}
                    onEditConnection={openEditModal}
                    onDeleteConnection={handleDeleteConnection}
                    currentPage={currentPage}
                    pageSize={pageSize}
                    onPageChange={handlePageChange}
                    loading={connectionsLoading}
                    canDrag={canManageConnections}
                  />
                </>
              );
            })()}

            {/* Drag Overlay - shows dragged element following cursor */}
            <DragOverlay>
              {activeConnection ? (
                <div
                  className="rotate-3 opacity-90 shadow-2xl"
                  style={{ width: '100%', maxWidth: '500px' }}
                >
                  <ConnectionCard
                    connection={activeConnection}
                    onDelete={() => {}}
                    onEdit={() => {}}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </AppLayout>
    </ErrorBoundary>
  );
}

export default function ConnectedClientsPage() {
  return (
    <Suspense
      fallback={
        <AppLayout title="Connected Clients">
          <div className="p-6">
            <div className="flex justify-center items-center py-12">
              <div className="text-gray-500">Loading connections...</div>
            </div>
          </div>
        </AppLayout>
      }
    >
      <ConnectedClientsPageContent />
    </Suspense>
  );
}
