'use client';

import { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import type { RelationshipType, ClientInstrument } from '@/types';
import { useConnectedClientsData } from '@/hooks/useUnifiedData';
import { useConnectionFilters, useConnectionEdit } from './hooks';
import { useURLState } from '@/hooks/useURLState';
import { ConnectionModal, ConnectionSearch } from './components';
import EmptyState from '@/components/common/empty-state/EmptyState';
import { useErrorHandler } from '@/contexts/ToastContext';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useLoadingState } from '@/hooks/useLoadingState';
import { useFilterSort } from '@/hooks/useFilterSort';
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

// Component that uses useURLState (which uses useSearchParams) - must be wrapped in Suspense
function ConnectedClientsPageContent() {
  // Error handling
  const { handleError } = useErrorHandler();
  const { showSuccess } = useAppFeedback();

  // Custom hooks
  const {
    clients,
    instruments,
    connections,
    createConnection,
    updateConnection,
    deleteConnection,
    fetchConnections,
  } = useConnectedClientsData();

  // Loading states
  const { loading, submitting, withSubmitting } = useLoadingState();
  // FIXED: useLoadingState returns boolean, so use it directly
  const isLoading = loading;

  const { urlState, updateURLState } = useURLState({
    enabled: true,
    keys: ['search', 'filter', 'page'],
    paramMapping: {
      search: 'search',
      filter: 'filter',
      page: 'page',
    },
  });

  // Initialize state from URL
  const initialSearch = urlState.search ? String(urlState.search) : '';
  const initialFilter = urlState.filter ? String(urlState.filter) : null;
  const initialPage = urlState.page ? parseInt(String(urlState.page), 10) : 1;

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
  const [connectionSearchTerm, setConnectionSearchTerm] =
    useState(initialSearch);
  const [currentPage, setCurrentPage] = useState(
    isNaN(initialPage) || initialPage < 1 ? 1 : initialPage
  );
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
        setShowConnectionModal(false);
        resetConnectionForm();

        // 작업 완료 요약 메시지 생성
        if (connection) {
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
        }
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

  // Handle connection type change: update relationship_type when dragged to different section or tab
  const handleConnectionTypeChange = useCallback(
    async (connectionId: string, newType: RelationshipType | 'all') => {
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

          // Use updateConnection with relationshipType (it will convert to relationship_type internally)
          await updateConnection(connectionId, {
            relationshipType: newType,
            notes: connection.notes || '', // Preserve existing notes
          });
          await fetchConnections();
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

            {/* Main Content */}
            {(() => {
              const hasAnyConnections = connections.length > 0;
              const hasResults = filteredConnections.length > 0;

              if (isLoading) {
                return (
                  <div className="flex justify-center items-center py-12">
                    <div className="text-gray-500">Loading connections...</div>
                  </div>
                );
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
                    guideSteps={[
                      '클라이언트와 악기를 선택하세요',
                      '관계 타입을 선택하세요 (Owned, Interested, Booked 등)',
                      '연결을 저장하면 양쪽에서 확인할 수 있습니다',
                    ]}
                    helpLink={{
                      label: '연결 관리 방법 알아보기',
                      onClick: () => {
                        // TODO: 도움말 모달 또는 페이지로 이동
                        console.log('Show help guide');
                      },
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
                  onPageChange={handlePageChange}
                  loading={isLoading}
                />
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
