'use client';

import React, { memo, useMemo, useCallback, useEffect, useRef } from 'react';
import { Instrument, ClientInstrument } from '@/types';
import {
  formatInstrumentPrice,
  formatInstrumentYear,
  formatClientName,
  formatInstrumentPriceCompact,
} from '../utils/dashboardUtils';
import { validateUUID } from '@/utils/inputValidation';
import {
  normalizeInstrumentSerial,
  validateInstrumentSerial,
} from '@/utils/uniqueNumberGenerator';
import Link from 'next/link';
import { arrowToClass } from '@/utils/filterHelpers';
import { ListSkeleton, Pagination, EmptyState } from '@/components/common';
import StatusBadge from './StatusBadge';
import CertificateBadge from './CertificateBadge';
import RowActions from './RowActions';
import { classNames, cn } from '@/utils/classNames';
import MobileCardView, {
  MobileCard,
  MobileCardRow,
} from '@/components/common/layout/MobileCardView';
import { useInlineEdit } from '@/hooks/useInlineEdit';

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
  onSellClick?: (item: Instrument) => void; // 원클릭 판매
  allClients?: Array<{
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  }>;
  clientsLoading?: boolean; // UX: Track if clients are still loading
  // FIXED: Add existingSerialNumbers for inline editing serial validation
  existingSerialNumbers?: string[]; // Serial numbers from existing instruments for validation
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
  onSellClick,
  allClients = [],
  clientsLoading = false,
  existingSerialNumbers = [],
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
  // 인라인 편집 훅 사용
  type EditData = {
    id: string;
    maker?: string | null;
    type?: string | null;
    subtype?: string | null;
    year?: string | number | null;
    price?: string | number | null;
    status?: Instrument['status'];
    serial_number?: string | null;
    certificate?: boolean | null;
    ownership?: string | null;
  };
  type EditField = keyof EditData;

  const inlineEdit = useInlineEdit<EditData>({
    onSave: async (id, data) => {
      if (!onUpdateItem) return;

      // Serial number validation
      const serialNumber = data.serial_number?.trim() || null;
      if (serialNumber) {
        const currentItem = items.find(item => item.id === id);
        const currentSerialNumber = currentItem?.serial_number || null;

        const normalizedSerial = normalizeInstrumentSerial(serialNumber);
        const serialValidation = validateInstrumentSerial(
          normalizedSerial,
          existingSerialNumbers,
          currentSerialNumber
        );
        if (!serialValidation.valid) {
          console.error(
            'Serial number validation failed:',
            serialValidation.error
          );
          throw new Error(serialValidation.error || 'Invalid serial number');
        }
      }

      // Convert form data to proper types
      const updates: Partial<Instrument> = {
        maker: data.maker?.trim() || null,
        type: data.type?.trim() || null,
        subtype: data.subtype?.trim() || null,
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
        serial_number: serialNumber
          ? normalizeInstrumentSerial(serialNumber)
          : null,
        certificate: data.certificate ?? false,
        ownership: data.ownership?.trim() || null,
      };

      await onUpdateItem(id, updates);
    },
    highlightDuration: 2000,
  });

  // 편의를 위한 별칭
  const editingItem = inlineEdit.editingId;
  const editData = inlineEdit.editData;
  const isSaving = inlineEdit.isSaving;
  const savedItemId = inlineEdit.savedId;

  // Track newly created item for scroll/highlight
  const newlyCreatedItemRef = useRef<string | null>(null);

  // FIXED: Remove duplicate itemsWithClients computation - items already come as EnrichedInstrument[]
  // Items are already enriched with clients array from DashboardPage

  // Create a Map of all clients for O(1) lookup by ID (for ownership UUID resolution)
  const clientsMap = useMemo(
    () => new Map(allClients.map(client => [client.id, client])),
    [allClients]
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

          // FIXED: Never print all IDs - only a small sample to avoid console explosion
          if (
            typeof window !== 'undefined' &&
            process.env.NODE_ENV === 'development'
          ) {
            const warningKey = `client-not-found-${item.ownership}`;
            if (!sessionStorage.getItem(warningKey)) {
              sessionStorage.setItem(warningKey, 'true');
              console.warn('[ItemList] Client not found for ownership UUID:', {
                ownership: item.ownership,
                totalClients: clientsMap.size,
                clientsMapSize: clientsMap.size,
                clientsLoading,
                instrumentId: item.id,
                serialNumber: item.serial_number,
                hasClientsMap: !!clientsMap,
                // FIXED: Only log sample, not all IDs
                sampleClientIds: Array.from(clientsMap.keys()).slice(0, 10),
              });
              console.info(
                '💡 이 UUID가 실제로 클라이언트 테이블에 있는지 확인하세요:'
              );
              console.info(
                `fetch('/api/clients').then(r => r.json()).then(d => console.log('Client:', d.data.find(c => c.id === '${item.ownership}')));`
              );
            }
          }

          // This can happen if:
          // 1. Client data hasn't loaded yet
          // 2. Client doesn't exist in database
          // 3. Ownership UUID doesn't match any client ID
          return (
            <span
              className="text-gray-400 text-xs font-mono"
              title={`클라이언트를 찾을 수 없습니다 (총 ${clientsMap.size}개 클라이언트 로드됨) | UUID: ${item.ownership}`}
            >
              {item.ownership}
            </span>
          );
        }

        // Not a UUID - display as is (might be a name or other text)
        return <span>{item.ownership}</span>;
      }

      // UX: No ownership - show connected clients count with hover detail
      if (item.clients && item.clients.length > 0) {
        const clientCount = item.clients.length;

        return (
          <div className="group relative">
            <div className="inline-flex items-center gap-1.5 text-sm text-gray-700">
              <span className="text-gray-600">
                {clientCount === 1
                  ? '1 Active Client'
                  : `${clientCount} Active Clients`}
              </span>
            </div>
            {/* UX: Hover tooltip showing client details */}
            {/* ✅ FIXED: popover를 왼쪽으로 표시 (right-0으로 부모 요소의 오른쪽에 정렬하여 왼쪽으로 확장) */}
            <div className="absolute right-0 top-full mt-1 z-10 hidden group-hover:block w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
              <div className="text-xs font-semibold text-gray-900 mb-2">
                Connected Clients ({clientCount})
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {item.clients.map(rel => {
                  if (!rel.client_id) return null;
                  const clientName = rel.client
                    ? formatClientName(rel.client)
                    : clientsMap.get(rel.client_id)
                      ? `${clientsMap.get(rel.client_id)!.first_name || ''} ${clientsMap.get(rel.client_id)!.last_name || ''}`.trim() ||
                        clientsMap.get(rel.client_id)!.email ||
                        'Client'
                      : 'Client';
                  return (
                    <Link
                      key={rel.id}
                      href={`/clients?clientId=${rel.client_id}`}
                      onClick={e => e.stopPropagation()}
                      className="block text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors py-0.5"
                      title={`View client details (${rel.relationship_type})`}
                    >
                      <span className="font-medium">{clientName}</span>
                      <span className="text-gray-500 ml-1">
                        ({rel.relationship_type})
                      </span>
                    </Link>
                  );
                })}
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
        serial_number: item.serial_number || '',
        certificate: item.certificate ?? false,
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

  // Scroll to and highlight newly created item
  useEffect(() => {
    if (!newlyCreatedItemId || loading) return;

    let highlightTimeout: NodeJS.Timeout | null = null;

    // Check if the item is in the current page
    const itemIndex = items.findIndex(item => item.id === newlyCreatedItemId);
    if (itemIndex === -1) {
      // Item not in current page - might be filtered out or on different page
      // Wait a bit for data to update, then try again
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
        // Scroll to element with smooth behavior
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });

        // Remove highlight after animation completes
        highlightTimeout = setTimeout(() => {
          if (onNewlyCreatedItemShown) {
            onNewlyCreatedItemShown();
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
      <EmptyState
        title={
          emptyState?.message ||
          (hasFilters ? 'No items found matching your filters' : 'No items yet')
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
        guideSteps={
          !hasFilters
            ? [
                '악기 정보를 입력하세요 (Maker, Type, Serial Number 등)',
                '가격과 상태를 설정하세요',
                '클라이언트와 연결하려면 Connections 페이지를 사용하세요',
              ]
            : undefined
        }
        helpLink={
          !hasFilters
            ? {
                label: '악기 추가 방법 알아보기',
                onClick: () => {
                  // TODO: 도움말 모달 또는 페이지로 이동
                  console.log('Show help guide');
                },
              }
            : undefined
        }
        onLoadSampleData={!hasFilters ? onLoadSampleData : undefined}
      />
    );
  }

  return (
    <>
      {/* 모바일 카드 뷰 */}
      <MobileCardView>
        <div className="space-y-3">
          {items.map(item => {
            const isEditing = editingItem === item.id;
            const isSaved = savedItemId === item.id;

            const isNewlyCreated = newlyCreatedItemId === item.id;

            return (
              <MobileCard
                key={item.id}
                data-item-id={item.id}
                className={cn(
                  isEditing && 'ring-2 ring-blue-200 bg-blue-50',
                  isSaved && 'ring-2 ring-green-200 bg-green-50',
                  isNewlyCreated && 'ring-2 ring-green-400 bg-green-50'
                )}
              >
                {/* 헤더: Status + Serial # */}
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={item.status} size="sm" />
                    <span className="text-xs text-gray-500 font-mono">
                      {item.serial_number || '—'}
                    </span>
                  </div>
                  <RowActions
                    onEdit={() => startEditing(item)}
                    onDelete={() => onDeleteClick(item)}
                    onSell={onSellClick ? () => onSellClick(item) : undefined}
                    instrumentId={item.id}
                  />
                </div>

                {/* 주요 정보 */}
                <MobileCardRow
                  label="Maker"
                  value={
                    isEditing ? (
                      <input
                        type="text"
                        value={editData.maker || ''}
                        onChange={e =>
                          handleEditFieldChange('maker', e.target.value)
                        }
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className="font-medium">{item.maker || '—'}</span>
                    )
                  }
                />
                <MobileCardRow
                  label="Type"
                  value={
                    isEditing ? (
                      <input
                        type="text"
                        value={editData.type || ''}
                        onChange={e =>
                          handleEditFieldChange('type', e.target.value)
                        }
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span>{item.type || '—'}</span>
                    )
                  }
                />
                {item.subtype && (
                  <MobileCardRow
                    label="Subtype"
                    value={
                      isEditing ? (
                        <input
                          type="text"
                          value={editData.subtype || ''}
                          onChange={e =>
                            handleEditFieldChange('subtype', e.target.value)
                          }
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span>{item.subtype}</span>
                      )
                    }
                  />
                )}
                <MobileCardRow
                  label="Year"
                  value={
                    isEditing ? (
                      <input
                        type="number"
                        value={editData.year || ''}
                        onChange={e =>
                          handleEditFieldChange('year', e.target.value)
                        }
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span>{formatInstrumentYear(item.year)}</span>
                    )
                  }
                />
                <MobileCardRow
                  label="Price"
                  value={
                    isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editData.price || ''}
                        onChange={e =>
                          handleEditFieldChange('price', e.target.value)
                        }
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className="font-semibold">
                        {formatInstrumentPriceCompact(item.price)}
                      </span>
                    )
                  }
                />
                <MobileCardRow
                  label="Certificate"
                  value={
                    isEditing ? (
                      <select
                        value={String(!!editData.certificate)}
                        onChange={e =>
                          handleEditFieldChange(
                            'certificate',
                            e.target.value === 'true'
                          )
                        }
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                        onClick={e => e.stopPropagation()}
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <CertificateBadge certificate={item.certificate} />
                    )
                  }
                />
                {item.clients && item.clients.length > 0 && (
                  <MobileCardRow
                    label="Clients"
                    value={
                      <span className="text-xs text-blue-600">
                        {item.clients.length}{' '}
                        {item.clients.length === 1 ? 'client' : 'clients'}
                      </span>
                    }
                  />
                )}

                {/* 편집 모드일 때 저장/취소 버튼 */}
                {isEditing && (
                  <div className="mt-3 pt-3 border-t border-gray-200 flex gap-2">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        saveEditing();
                      }}
                      disabled={isSaving}
                      className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        cancelEditing();
                      }}
                      className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </MobileCard>
            );
          })}
        </div>
      </MobileCardView>

      {/* 데스크톱 테이블 뷰 */}
      <div className={cn('hidden md:block', classNames.tableWrapper)}>
        <div className={classNames.tableContainer}>
          <table className={classNames.table}>
            <thead className={classNames.tableHeader}>
              <tr>
                <th className={`${classNames.tableHeaderCell} text-right`}></th>
                <th
                  className={cn(classNames.tableHeaderCellSortable, 'group')}
                  onClick={() => onSort('status')}
                >
                  <span className="inline-flex items-center gap-1">
                    Status
                    <span
                      className={`opacity-0 group-hover:opacity-100 transition-opacity ${
                        arrowToClass(getSortArrow('status')) !== 'sort-neutral'
                          ? `opacity-100 text-blue-600`
                          : 'text-gray-400'
                      }`}
                    >
                      {arrowToClass(getSortArrow('status')) === 'sort-asc'
                        ? '▲'
                        : arrowToClass(getSortArrow('status')) === 'sort-desc'
                          ? '▼'
                          : '↕'}
                    </span>
                  </span>
                </th>
                <th
                  className={cn(classNames.tableHeaderCellSortable, 'group')}
                  onClick={() => onSort('serial_number')}
                >
                  <span className="inline-flex items-center gap-1">
                    Serial #
                    <span
                      className={`opacity-0 group-hover:opacity-100 transition-opacity ${
                        arrowToClass(getSortArrow('serial_number')) !==
                        'sort-neutral'
                          ? 'opacity-100 text-blue-600'
                          : 'text-gray-400'
                      }`}
                    >
                      {arrowToClass(getSortArrow('serial_number')) ===
                      'sort-asc'
                        ? '▲'
                        : arrowToClass(getSortArrow('serial_number')) ===
                            'sort-desc'
                          ? '▼'
                          : '↕'}
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
                      className={`opacity-0 group-hover:opacity-100 ${arrowToClass(getSortArrow('maker')) !== 'sort-neutral' ? 'opacity-100 text-gray-900' : ''}`}
                    >
                      {arrowToClass(getSortArrow('maker')) === 'sort-asc'
                        ? '▲'
                        : arrowToClass(getSortArrow('maker')) === 'sort-desc'
                          ? '▼'
                          : '↕'}
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
                      className={`opacity-0 group-hover:opacity-100 transition-opacity ${
                        arrowToClass(getSortArrow('type')) !== 'sort-neutral'
                          ? 'opacity-100 text-blue-600'
                          : 'text-gray-400'
                      }`}
                    >
                      {arrowToClass(getSortArrow('type')) === 'sort-asc'
                        ? '▲'
                        : arrowToClass(getSortArrow('type')) === 'sort-desc'
                          ? '▼'
                          : '↕'}
                    </span>
                  </span>
                </th>
                <th
                  className={cn(classNames.tableHeaderCellSortable, 'group')}
                  onClick={() => onSort('subtype')}
                >
                  <span className="inline-flex items-center gap-1">
                    Subtype
                    <span
                      className={`opacity-0 group-hover:opacity-100 ${arrowToClass(getSortArrow('subtype')) !== 'sort-neutral' ? 'opacity-100 text-gray-900' : ''}`}
                    >
                      {arrowToClass(getSortArrow('subtype')) === 'sort-asc'
                        ? '▲'
                        : arrowToClass(getSortArrow('subtype')) === 'sort-desc'
                          ? '▼'
                          : '↕'}
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
                      className={`opacity-0 group-hover:opacity-100 transition-opacity ${
                        arrowToClass(getSortArrow('year')) !== 'sort-neutral'
                          ? 'opacity-100 text-blue-600'
                          : 'text-gray-400'
                      }`}
                    >
                      {arrowToClass(getSortArrow('year')) === 'sort-asc'
                        ? '▲'
                        : arrowToClass(getSortArrow('year')) === 'sort-desc'
                          ? '▼'
                          : '↕'}
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
                      className={`opacity-0 group-hover:opacity-100 ${arrowToClass(getSortArrow('price')) !== 'sort-neutral' ? 'opacity-100 text-gray-900' : ''}`}
                    >
                      {arrowToClass(getSortArrow('price')) === 'sort-asc'
                        ? '▲'
                        : arrowToClass(getSortArrow('price')) === 'sort-desc'
                          ? '▼'
                          : '↕'}
                    </span>
                  </span>
                </th>
                <th className={classNames.tableHeaderCell}>Certificate</th>
                <th className={classNames.tableHeaderCell}>
                  Client Relationship
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

                return (
                  <tr
                    key={item.id}
                    data-item-id={item.id}
                    className={cn(
                      classNames.tableRow,
                      getRowStyles(item.status),
                      isNewlyCreated && 'ring-2 ring-green-400 bg-green-50'
                    )}
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
                              <span className="text-xs font-medium">Saved</span>
                            </div>
                          )}
                          <RowActions
                            onEdit={() => startEditing(item)}
                            onDelete={() => onDeleteClick(item)}
                            currentStatus={item.status}
                            hasCertificateField={true}
                            itemId={item.id}
                            instrumentId={item.id}
                            onBook={async () => {
                              if (onUpdateItem) {
                                await onUpdateItem(item.id, {
                                  status: 'Booked',
                                });
                              }
                            }}
                            onSendToMaintenance={async () => {
                              if (onUpdateItem) {
                                await onUpdateItem(item.id, {
                                  status: 'Maintenance',
                                });
                              }
                            }}
                            onAttachCertificate={async () => {
                              if (onUpdateItem) {
                                await onUpdateItem(item.id, {
                                  certificate: true,
                                });
                              }
                            }}
                            onSell={
                              onSellClick ? () => onSellClick(item) : undefined
                            }
                            hasCertificate={item.certificate ?? null}
                            onDownloadCertificate={async () => {
                              try {
                                const res = await fetch(
                                  `/api/certificates/${item.id}`
                                );
                                if (!res.ok) return;
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                // FIXED: Sanitize filename to prevent issues with special characters
                                // Reuse server sanitization logic (matches route.tsx)
                                const rawFilename =
                                  item.serial_number || item.id;
                                const safe = String(rawFilename)
                                  .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
                                  .replace(/\s+/g, '_')
                                  .trim()
                                  .substring(0, 200);
                                // FIXED: Let browser use Content-Disposition header if available
                                // Only set download if we have a safe filename
                                if (safe) {
                                  a.download = `certificate-${safe}.pdf`;
                                }
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                                URL.revokeObjectURL(url);
                              } catch (error) {
                                // Error is handled silently - user can retry if needed
                                if (process.env.NODE_ENV === 'development') {
                                  console.error(
                                    'Failed to download certificate:',
                                    error
                                  );
                                }
                              }
                            }}
                          />
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
                        <StatusBadge status={item.status} />
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
                          placeholder="Serial #"
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
                          type="text"
                          value={editData.subtype || ''}
                          onChange={e =>
                            handleEditFieldChange('subtype', e.target.value)
                          }
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          onClick={e => e.stopPropagation()}
                          placeholder="Subtype"
                        />
                      ) : (
                        <div className="text-sm text-gray-900 text-center">
                          {item.subtype || '—'}
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
                      {isEditing ? (
                        // FIXED: Use boolean option values instead of Yes/No strings
                        <select
                          value={String(!!editData.certificate)}
                          onChange={e =>
                            handleEditFieldChange(
                              'certificate',
                              e.target.value === 'true'
                            )
                          }
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          onClick={e => e.stopPropagation()}
                        >
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      ) : (
                        // FIXED: CertificateBadge now accepts nullable certificate
                        <CertificateBadge certificate={item.certificate} />
                      )}
                    </td>

                    <td className={classNames.tableCell}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editData.ownership || ''}
                          onChange={e =>
                            handleEditFieldChange('ownership', e.target.value)
                          }
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          onClick={e => e.stopPropagation()}
                          placeholder="Ownership"
                        />
                      ) : (
                        // FIXED: Use memoized renderOwnership callback instead of inline IIFE
                        <div className="text-sm text-gray-900 text-center">
                          {renderOwnership(item)}
                        </div>
                      )}
                    </td>
                  </tr>
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
