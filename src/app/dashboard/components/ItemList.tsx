'use client';

import React, {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Instrument, Client, ClientInstrument } from '@/types';
import {
  formatInstrumentPrice,
  formatInstrumentYear,
  formatClientName,
  formatInstrumentPriceCompact,
  shortenUuidForDisplay,
} from '../utils/dashboardUtils';
import { validateUUID } from '@/utils/inputValidation';
import Link from 'next/link';
import { ListSkeleton, Pagination, EmptyState } from '@/components/common';
import { GuideModal } from '@/components/common/empty-state/GuideModal';
import { InstrumentExpandedRow } from './InstrumentExpandedRow';
import StatusBadge from './StatusBadge';
import CertificateBadge from './CertificateBadge';
import RowActions from './RowActions';
import { classNames, cn } from '@/utils/classNames';
import { useInlineEdit } from '@/hooks/useInlineEdit';
import { useSuccessToastContext } from '@/contexts/SuccessToastContext';
import { useErrorContext } from '@/contexts/ErrorContext';
import { downloadCertificatePdf } from '../utils/certificateDownload';

const DASHBOARD_EMPTY_GUIDE_STEPS = [
  '악기 정보를 입력하세요 (Maker, Type, Serial Number 등)',
  '가격과 상태를 설정하세요',
  '클라이언트와 연결하려면 Connections 페이지를 사용하세요',
];

// FIXED: Use EnrichedInstrument type to avoid duplicate computation
// Import from DashboardContent or define here - using explicit definition for clarity
type EnrichedInstrument = Instrument & {
  clients: ClientInstrument[];
};

interface ItemListProps {
  // FIXED: Accept EnrichedInstrument[] to avoid duplicate itemsWithClients computation
  items: EnrichedInstrument[];
  loading: boolean;
  onDeleteClick: (item: Instrument) => void;
  onUpdateItem?: (
    itemId: string,
    updates: Partial<Instrument>
  ) => Promise<void>;
  clientRelationships: ClientInstrument[];
  getSortArrow: (field: string) => string;
  onSort: (field: string) => void;
  onAddClick?: () => void;
  allClients?: Array<{
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  }>;
  clientsLoading?: boolean; // UX: Track if clients are still loading
  // UX: Empty state customization
  emptyState?: {
    message?: string;
    actionLabel?: string;
    hasActiveFilters?: boolean;
    onResetFilters?: () => void;
  };
  // Pagination
  currentPage?: number;
  totalPages?: number;
  totalCount?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  // UX: Newly created item feedback
  newlyCreatedItemId?: string | null;
  onNewlyCreatedItemShown?: () => void;
  // UX: Load sample data
  onLoadSampleData?: () => void;
}

const ItemList = memo(function ItemList({
  items,
  loading,
  onDeleteClick,
  onUpdateItem,
  getSortArrow,
  onSort,
  onAddClick,
  allClients = [],
  clientsLoading = false,
  emptyState = {},
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  newlyCreatedItemId,
  onNewlyCreatedItemShown,
  onLoadSampleData,
}: ItemListProps) {
  const { showSuccess } = useSuccessToastContext();
  const { handleError } = useErrorContext();
  // 인라인 편집 훅 사용
  type EditData = {
    id: string;
    serial_number?: string | null;
    maker?: string | null;
    type?: string | null;
    year?: string | number | null;
    price?: string | number | null;
    note?: string | null;
    status?: Instrument['status'];
  };
  type EditField = keyof EditData;

  const inlineEdit = useInlineEdit<EditData>({
    onSave: async (id, data) => {
      if (!onUpdateItem) return;

      const updates: Partial<Instrument> = {
        maker: data.maker?.trim() || null,
        type: data.type?.trim() || null,
        serial_number: data.serial_number?.trim() || null,
        year: (() => {
          const yearValue = data.year;
          if (!yearValue) return null;
          let yearStr: string;
          if (typeof yearValue === 'string') {
            yearStr = yearValue.trim();
          } else if (typeof yearValue === 'number') {
            yearStr = String(yearValue).trim();
          } else {
            return null;
          }
          if (!yearStr) return null;
          const yearNum = parseInt(yearStr, 10);
          return isNaN(yearNum) ? null : yearNum;
        })(),
        price: (() => {
          const priceValue = data.price;
          if (!priceValue) return null;
          let priceStr: string;
          if (typeof priceValue === 'string') {
            priceStr = priceValue.trim();
          } else if (typeof priceValue === 'number') {
            priceStr = String(priceValue).trim();
          } else {
            return null;
          }
          if (!priceStr) return null;
          const priceNum = parseFloat(priceStr);
          return isNaN(priceNum) ? null : priceNum;
        })(),
        status: (data.status as Instrument['status']) || 'Available',
        note: data.note?.trim() || null,
      };

      await onUpdateItem(id, updates);
    },
    highlightDuration: 2000,
  });

  const [expandedInstrumentId, setExpandedInstrumentId] = useState<
    string | null
  >(null);
  const [showInstrumentGuideModal, setShowInstrumentGuideModal] =
    useState(false);

  // 편의를 위한 별칭
  const editingItem = inlineEdit.editingId;
  const editData = inlineEdit.editData;
  const isSaving = inlineEdit.isSaving;
  const savedItemId = inlineEdit.savedId;

  useEffect(() => {
    if (
      expandedInstrumentId &&
      !items.some(item => item.id === expandedInstrumentId)
    ) {
      setExpandedInstrumentId(null);
    }
  }, [expandedInstrumentId, items]);

  useEffect(() => {
    if (editingItem && expandedInstrumentId === editingItem) {
      setExpandedInstrumentId(null);
    }
  }, [editingItem, expandedInstrumentId]);

  // Track newly created item for scroll/highlight
  const newlyCreatedItemRef = useRef<string | null>(null);

  // FIXED: Remove duplicate itemsWithClients computation - items already come as EnrichedInstrument[]
  // Items are already enriched with clients array from DashboardPage

  // Create a Map of all clients for O(1) lookup by ID (for ownership UUID resolution)
  const clientsMap = useMemo(
    () => new Map(allClients.map(client => [client.id, client])),
    [allClients]
  );

  const resolveOwnerMeta = useCallback(
    (item: EnrichedInstrument) => {
      const ownership = item.ownership;
      if (!ownership) {
        return null;
      }

      if (!validateUUID(ownership)) {
        return {
          label: ownership,
          client: null,
        };
      }

      const matchingRelationship = item.clients.find(
        rel => rel.client_id === ownership
      );

      if (matchingRelationship?.client) {
        return {
          label: formatClientName(matchingRelationship.client),
          client: matchingRelationship.client,
        };
      }

      const mappedClient = clientsMap.get(ownership);
      if (mappedClient) {
        const fallbackName =
          `${mappedClient.first_name || ''} ${mappedClient.last_name || ''}`.trim() ||
          mappedClient.email ||
          'Client';
        return {
          label: fallbackName,
          client: null,
        };
      }

      return {
        label: ownership,
        client: null,
      };
    },
    [clientsMap]
  );

  // FIXED: Extract ownership cell rendering logic into useCallback to avoid re-running expensive operations on every render
  const renderOwnership = useCallback(
    (item: EnrichedInstrument) => {
      // If ownership exists, display it
      if (item.ownership) {
        // Check if ownership is a UUID - if so, try to find the client
        if (validateUUID(item.ownership)) {
          // First try to find in item's relationships (for connected clients)
          const matchingRelationship = item.clients.find(
            rel => rel.client_id === item.ownership
          );

          if (matchingRelationship?.client) {
            return (
              <Link
                href={`/clients?clientId=${matchingRelationship.client_id}`}
                onClick={e => e.stopPropagation()}
                className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                title="View client details"
              >
                {formatClientName(matchingRelationship.client)}
              </Link>
            );
          }

          // If not found in relationships, check all clients (for ownership that's not a connection)
          const client = clientsMap.get(item.ownership);

          if (client) {
            // Format client name from minimal client object
            const clientName =
              `${client.first_name || ''} ${client.last_name || ''}`.trim() ||
              client.email ||
              'Unknown Client';
            return (
              <Link
                href={`/clients?clientId=${item.ownership}`}
                onClick={e => e.stopPropagation()}
                className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                title="View client details"
              >
                {clientName}
              </Link>
            );
          }

          // UUID but no matching client found
          // UX: Show loading state if clients are still loading
          if (clientsLoading) {
            return (
              <span
                className="text-gray-400 text-sm italic"
                title="클라이언트 정보 로딩 중..."
              >
                Loading...
              </span>
            );
          }

          // This can happen if:
          // 1. Client data hasn't loaded yet
          // 2. Client doesn't exist in database
          // 3. Ownership UUID doesn't match any client ID
          return (
            <span
              className="text-gray-400 text-xs font-mono"
              title={`클라이언트를 찾을 수 없습니다 (로드된 클라이언트 ${clientsMap.size}명)`}
            >
              {shortenUuidForDisplay(item.ownership)}
            </span>
          );
        }

        // Not a UUID - display as is (might be a name or other text)
        return <span>{item.ownership}</span>;
      }

      // UX: No ownership - show connected clients count with hover detail
      if (item.clients && item.clients.length > 0) {
        const clientEntries = item.clients
          .filter(rel => Boolean(rel.client_id))
          .map(rel => {
            const client = rel.client || clientsMap.get(rel.client_id) || null;
            const clientName = client
              ? formatClientName(client as Client)
              : 'Client';
            return {
              id: rel.client_id,
              name: clientName,
              relationship: rel.relationship_type || 'Client',
              relId: rel.id,
            };
          });
        const visibleClients = clientEntries.slice(0, 2);
        const hiddenCount = clientEntries.length - visibleClients.length;
        return (
          <div className="group relative">
            <div className="text-sm text-gray-700">
              <span className="font-medium">
                {visibleClients.map((entry, index) => (
                  <React.Fragment key={entry.relId}>
                    <Link
                      href={`/clients?clientId=${entry.id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                      title={`View client details (${entry.relationship})`}
                    >
                      {entry.name}
                    </Link>
                    {index < visibleClients.length - 1 && ', '}
                  </React.Fragment>
                ))}
                {hiddenCount > 0 && (
                  <span className="text-xs text-gray-500 ml-1">
                    +{hiddenCount} more
                  </span>
                )}
              </span>
              <span className="ml-1 text-xs text-gray-500">Connected</span>
            </div>
            <div className="absolute right-0 top-full mt-1 z-10 hidden group-hover:block w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
              <div className="text-xs font-semibold text-gray-900 mb-2">
                Connected Clients ({clientEntries.length})
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {clientEntries.map(entry => (
                  <Link
                    key={`${entry.id}-${entry.relationship}`}
                    href={`/clients?clientId=${entry.id}`}
                    onClick={e => e.stopPropagation()}
                    className="block text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors py-0.5"
                    title={`View client details (${entry.relationship})`}
                  >
                    <span className="font-medium">{entry.name}</span>
                    <span className="text-gray-500 ml-1">
                      ({entry.relationship})
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        );
      }

      return <span className="text-gray-400 text-center">—</span>;
    },
    // FIXED: clientsMap already includes all clients data, so allClients dependency is unnecessary
    [clientsMap, clientsLoading]
  );

  const startEditing = useCallback(
    (item: Instrument) => {
      inlineEdit.startEditing(item.id, {
        maker: item.maker || '',
        type: item.type || '',
        subtype: item.subtype || '',
        year: item.year ? String(item.year) : '',
        price: item.price ? String(item.price) : '',
        status: item.status || 'Available',
        ownership: item.ownership || '',
      } as Partial<EditData>);
    },
    [inlineEdit]
  );

  const cancelEditing = inlineEdit.cancelEditing;
  const saveEditing = inlineEdit.saveEditing;

  const handleEditFieldChange = useCallback(
    <K extends EditField>(field: K, value: EditData[K]) => {
      inlineEdit.updateField(field, value);
    },
    [inlineEdit]
  );

  // Scroll to and highlight newly created item (only if not visible)
  const hasScrolledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!newlyCreatedItemId || loading) return;

    // Skip if we've already scrolled to this item
    if (hasScrolledRef.current === newlyCreatedItemId) return;

    let highlightTimeout: NodeJS.Timeout | null = null;

    // Check if the item is in the current page
    const itemIndex = items.findIndex(item => item.id === newlyCreatedItemId);
    if (itemIndex === -1) {
      // Item not in current page - might be filtered out or on different page
      // Wait a bit for data to update, then try again (only once)
      const retryTimeout = setTimeout(() => {
        const retryElement = document.querySelector(
          `[data-item-id="${newlyCreatedItemId}"]`
        );
        if (!retryElement && onNewlyCreatedItemShown) {
          // Item still not found - clear the ID to stop retrying
          onNewlyCreatedItemShown();
        }
      }, 500);
      return () => clearTimeout(retryTimeout);
    }

    // Wait for DOM to update
    const timeoutId = setTimeout(() => {
      const element = document.querySelector(
        `[data-item-id="${newlyCreatedItemId}"]`
      );
      if (element) {
        // Only scroll if element is not already visible in viewport
        const rect = element.getBoundingClientRect();
        const viewportHeight =
          window.innerHeight || document.documentElement.clientHeight;
        const viewportWidth =
          window.innerWidth || document.documentElement.clientWidth;
        const isVisible =
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= viewportHeight &&
          rect.right <= viewportWidth;

        if (!isVisible) {
          // Scroll to element with smooth behavior, using 'start' to align to top
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
          // Mark as scrolled to prevent repeated scrolling
          hasScrolledRef.current = newlyCreatedItemId;
        } else {
          // Element is already visible, mark as handled
          hasScrolledRef.current = newlyCreatedItemId;
        }

        // Remove highlight after animation completes
        highlightTimeout = setTimeout(() => {
          if (onNewlyCreatedItemShown) {
            onNewlyCreatedItemShown();
          }
          // Clear the ref when highlight is removed
          if (hasScrolledRef.current === newlyCreatedItemId) {
            hasScrolledRef.current = null;
          }
        }, 3000); // Keep highlight for 3 seconds
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (highlightTimeout) {
        clearTimeout(highlightTimeout);
      }
    };
  }, [newlyCreatedItemId, items, loading, onNewlyCreatedItemShown]);

  // Update ref when newlyCreatedItemId changes
  useEffect(() => {
    if (newlyCreatedItemId) {
      newlyCreatedItemRef.current = newlyCreatedItemId;
    }
  }, [newlyCreatedItemId]);

  if (loading) {
    return <ListSkeleton rows={5} columns={9} />;
  }

  // UX: Improved empty state - use consistent EmptyState component
  if (items.length === 0) {
    const hasFilters = emptyState?.hasActiveFilters ?? false;
    return (
      <>
        <EmptyState
          title={
            emptyState?.message ||
            (hasFilters
              ? 'No items found matching your filters'
              : 'No items yet')
          }
          description={
            hasFilters
              ? 'Try adjusting your filters or clearing them to see all items.'
              : 'Add your first instrument to get started.'
          }
          hasActiveFilters={hasFilters}
          onResetFilters={emptyState?.onResetFilters}
          actionButton={
            !hasFilters && onAddClick
              ? {
                  label: emptyState?.actionLabel || 'Add Item',
                  onClick: onAddClick,
                }
              : undefined
          }
          guideSteps={!hasFilters ? DASHBOARD_EMPTY_GUIDE_STEPS : undefined}
          helpLink={
            !hasFilters
              ? {
                  label: '악기 추가 방법 알아보기',
                  href: '#',
                  onClick: () => setShowInstrumentGuideModal(true),
                }
              : undefined
          }
          onLoadSampleData={!hasFilters ? onLoadSampleData : undefined}
        />
        <GuideModal
          isOpen={showInstrumentGuideModal}
          onClose={() => setShowInstrumentGuideModal(false)}
          title="악기 추가 가이드"
          steps={DASHBOARD_EMPTY_GUIDE_STEPS}
        />
      </>
    );
  }

  return (
    <>
      {/* 데스크톱 테이블 뷰 */}
      <div className={cn('w-full', classNames.tableWrapper)}>
        <div className={classNames.tableContainer}>
          <table className={classNames.table}>
            <thead className={classNames.tableHeader}>
              <tr>
                <th className={`${classNames.tableHeaderCell} text-right`}></th>
                <th
                  className={cn(classNames.tableHeaderCellSortable, 'group')}
                  onClick={() => onSort('serial_number')}
                >
                  <span className="inline-flex items-center gap-1">
                    Item Number
                    <span
                      className={`opacity-0 group-hover:opacity-100 ${
                        getSortArrow('serial_number') !== ''
                          ? 'opacity-100 text-gray-900'
                          : ''
                      }`}
                    >
                      {getSortArrow('serial_number') || ''}
                    </span>
                  </span>
                </th>
                <th
                  className={cn(classNames.tableHeaderCellSortable, 'group')}
                  onClick={() => onSort('maker')}
                >
                  <span className="inline-flex items-center gap-1">
                    Maker
                    <span
                      className={`opacity-0 group-hover:opacity-100 ${
                        getSortArrow('maker') !== ''
                          ? 'opacity-100 text-gray-900'
                          : ''
                      }`}
                    >
                      {getSortArrow('maker') || ''}
                    </span>
                  </span>
                </th>
                <th
                  className={cn(classNames.tableHeaderCellSortable, 'group')}
                  onClick={() => onSort('type')}
                >
                  <span className="inline-flex items-center gap-1">
                    Type
                    <span
                      className={`opacity-0 group-hover:opacity-100 ${
                        getSortArrow('type') !== ''
                          ? 'opacity-100 text-gray-900'
                          : ''
                      }`}
                    >
                      {getSortArrow('type') || ''}
                    </span>
                  </span>
                </th>
                <th
                  className={cn(classNames.tableHeaderCellSortable, 'group')}
                  onClick={() => onSort('year')}
                >
                  <span className="inline-flex items-center gap-1">
                    Year
                    <span
                      className={`opacity-0 group-hover:opacity-100 ${
                        getSortArrow('year') !== ''
                          ? 'opacity-100 text-gray-900'
                          : ''
                      }`}
                    >
                      {getSortArrow('year') || ''}
                    </span>
                  </span>
                </th>
                <th
                  className={cn(classNames.tableHeaderCellSortable, 'group')}
                  onClick={() => onSort('price')}
                >
                  <span className="inline-flex items-center gap-1">
                    Price
                    <span
                      className={`opacity-0 group-hover:opacity-100 ${
                        getSortArrow('price') !== ''
                          ? 'opacity-100 text-gray-900'
                          : ''
                      }`}
                    >
                      {getSortArrow('price') || ''}
                    </span>
                  </span>
                </th>
                <th className={classNames.tableHeaderCell}>Certificate</th>
                <th className={classNames.tableHeaderCell}>Note</th>
                <th
                  className={cn(classNames.tableHeaderCellSortable, 'group')}
                  onClick={() => onSort('status')}
                >
                  <span className="inline-flex items-center gap-1">
                    Status
                    <span
                      className={`opacity-0 group-hover:opacity-100 ${
                        getSortArrow('status') !== ''
                          ? 'opacity-100 text-gray-900'
                          : ''
                      }`}
                    >
                      {getSortArrow('status') || ''}
                    </span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className={classNames.tableBody}>
              {items.map(item => {
                const isEditing = editingItem === item.id;

                const isSaved = savedItemId === item.id;

                // ✅ FIXED: Use row styles without left accent border
                const getRowStyles = (status: Instrument['status']) => {
                  if (isEditing) return 'bg-blue-50 ring-2 ring-blue-200';
                  if (isSaved) return 'bg-green-50 ring-2 ring-green-200';

                  switch (status) {
                    case 'Sold':
                      return 'bg-gray-50/50'; // Subtle tinted background (#F9FAFB)
                    case 'Maintenance':
                      return 'bg-gray-50/50';
                    case 'Booked':
                    case 'Reserved':
                      return '';
                    case 'Available':
                    default:
                      return ''; // Default white
                  }
                };

                const isNewlyCreated = newlyCreatedItemId === item.id;
                const isExpanded = expandedInstrumentId === item.id;
                const ownerMeta = resolveOwnerMeta(item);

                const toggleRowExpanded = () => {
                  if (editingItem === item.id) return;
                  setExpandedInstrumentId(prev =>
                    prev === item.id ? null : item.id
                  );
                };

                const rowLabel = item.serial_number
                  ? `Toggle details for ${item.serial_number}`
                  : `Toggle details for instrument ${item.id}`;

                return (
                  <Fragment key={item.id}>
                    <tr
                      data-item-id={item.id}
                      className={cn(
                        classNames.tableRow,
                        getRowStyles(item.status),
                        isNewlyCreated && 'ring-2 ring-green-400 bg-green-50',
                        'cursor-pointer'
                      )}
                      onClick={toggleRowExpanded}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleRowExpanded();
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={rowLabel}
                      aria-expanded={isExpanded}
                    >
                      <td className={cn(classNames.tableCell, 'text-right')}>
                        {isEditing ? (
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                saveEditing();
                              }}
                              disabled={isSaving}
                              className="text-green-600 hover:text-green-700 disabled:opacity-50 transition-all duration-200 hover:scale-110 p-2 rounded-md hover:bg-green-50"
                              title="Save changes"
                              aria-label="Save changes"
                            >
                              {isSaving ? (
                                <svg
                                  className="w-4 h-4 animate-spin"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </button>

                            <button
                              onClick={e => {
                                e.stopPropagation();
                                cancelEditing();
                              }}
                              disabled={isSaving}
                              className="text-red-600 hover:text-red-700 disabled:opacity-50 transition-all duration-200 hover:scale-110 p-2 rounded-md hover:bg-red-50"
                              title="Cancel editing"
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
                                  strokeWidth="2"
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {isSaved && (
                              <div className="flex items-center gap-1 text-green-600">
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
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                                <span className="text-xs font-medium">
                                  Saved
                                </span>
                              </div>
                            )}

                            <div onClick={e => e.stopPropagation()}>
                              <RowActions
                                onEdit={() => startEditing(item)}
                                onDelete={() => onDeleteClick(item)}
                                currentStatus={item.status}
                                itemId={item.id}
                                hasCertificate={Boolean(item.has_certificate)}
                                onDownloadCertificate={async () => {
                                  const rawFilename =
                                    item.serial_number || item.id;
                                  const safe = String(rawFilename)
                                    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
                                    .replace(/\s+/g, '_')
                                    .trim()
                                    .substring(0, 200);

                                  await downloadCertificatePdf({
                                    url: `/api/certificates/${item.id}`,
                                    downloadFileName: safe
                                      ? `certificate-${safe}.pdf`
                                      : 'certificate.pdf',
                                    errorContext: 'CertificateDownload',
                                    showSuccess,
                                    handleError,
                                  });
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      <td className={classNames.tableCell}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.serial_number || ''}
                            onChange={e =>
                              handleEditFieldChange(
                                'serial_number',
                                e.target.value
                              )
                            }
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onClick={e => e.stopPropagation()}
                            placeholder="Item number"
                          />
                        ) : (
                          <div className="text-sm text-gray-900 font-mono">
                            {item.serial_number || '—'}
                          </div>
                        )}
                      </td>

                      <td className={classNames.tableCell}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.maker || ''}
                            onChange={e =>
                              handleEditFieldChange('maker', e.target.value)
                            }
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onClick={e => e.stopPropagation()}
                            placeholder="Maker"
                          />
                        ) : (
                          <div className="text-sm font-medium text-gray-900">
                            {item.maker || '—'}
                          </div>
                        )}
                      </td>

                      <td className={classNames.tableCell}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.type || ''}
                            onChange={e =>
                              handleEditFieldChange('type', e.target.value)
                            }
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onClick={e => e.stopPropagation()}
                            placeholder="Type"
                          />
                        ) : (
                          <div className="text-sm text-gray-900">
                            {item.type || '—'}
                          </div>
                        )}
                      </td>

                      <td className={classNames.tableCell}>
                        {isEditing ? (
                          <input
                            type="number"
                            value={editData.year || ''}
                            onChange={e =>
                              handleEditFieldChange('year', e.target.value)
                            }
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onClick={e => e.stopPropagation()}
                            placeholder="Year"
                          />
                        ) : (
                          <div className="text-sm text-gray-900">
                            {formatInstrumentYear(item.year)}
                          </div>
                        )}
                      </td>

                      <td className={classNames.tableCell}>
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editData.price || ''}
                            onChange={e =>
                              handleEditFieldChange('price', e.target.value)
                            }
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onClick={e => e.stopPropagation()}
                            placeholder="Price"
                          />
                        ) : (
                          <div
                            className="text-sm text-gray-900"
                            title={
                              item.price
                                ? formatInstrumentPrice(item.price)
                                : undefined
                            }
                          >
                            {formatInstrumentPriceCompact(item.price)}
                          </div>
                        )}
                      </td>

                      <td className={classNames.tableCell}>
                        <CertificateBadge
                          hasCertificate={Boolean(item.has_certificate)}
                          certificateName={item.certificate_name}
                        />
                      </td>

                      <td className={classNames.tableCell}>
                        {isEditing ? (
                          <textarea
                            value={editData.note || ''}
                            onChange={e =>
                              handleEditFieldChange('note', e.target.value)
                            }
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onClick={e => e.stopPropagation()}
                            placeholder="Note"
                            rows={2}
                          />
                        ) : (
                          <div
                            className="max-w-xs truncate text-sm text-gray-700"
                            title={item.note || undefined}
                          >
                            {item.note?.trim() || '—'}
                          </div>
                        )}
                      </td>

                      <td className={classNames.tableCell}>
                        {isEditing ? (
                          <select
                            value={editData.status || 'Available'}
                            onChange={e =>
                              handleEditFieldChange(
                                'status',
                                e.target.value as Instrument['status']
                              )
                            }
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onClick={e => e.stopPropagation()}
                          >
                            <option value="Available">Available</option>
                            <option value="Booked">Booked</option>
                            <option value="Sold">Sold</option>
                            <option value="Reserved">Reserved</option>
                            <option value="Maintenance">Maintenance</option>
                          </select>
                        ) : (
                          <div className="min-w-[8rem]">
                            <StatusBadge status={item.status} />
                          </div>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <InstrumentExpandedRow
                        instrument={item}
                        clients={item.clients}
                        ownerLabel={ownerMeta?.label}
                        ownerClient={ownerMeta?.client || null}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages !== undefined && totalPages > 1 && (
          <div className="border-t border-gray-200 px-6">
            <Pagination
              currentPage={currentPage || 1}
              totalPages={totalPages}
              onPageChange={onPageChange || (() => {})}
              loading={loading}
              totalCount={totalCount}
              pageSize={pageSize}
            />
          </div>
        )}
      </div>

      {/* 모바일/데스크톱 공통 Pagination */}
      {totalPages !== undefined && totalPages > 1 && (
        <div className="md:hidden border-t border-gray-200 px-4 pt-4">
          <Pagination
            currentPage={currentPage || 1}
            totalPages={totalPages}
            onPageChange={onPageChange || (() => {})}
            loading={loading}
            totalCount={totalCount}
            pageSize={pageSize}
          />
        </div>
      )}
    </>
  );
});

// Status Badge, Certificate Badge, and RowActions are imported from separate component files
// to maintain consistency across the dashboard module

export default ItemList;
