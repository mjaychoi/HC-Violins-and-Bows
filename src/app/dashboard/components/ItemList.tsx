'use client';

import React, { useState, memo, useMemo, useCallback } from 'react';
import { Instrument, ClientInstrument } from '@/types';
import {
  formatInstrumentPrice,
  formatInstrumentYear,
  formatClientName,
  formatInstrumentPriceCompact,
} from '../utils/dashboardUtils';
import { validateUUID } from '@/utils/inputValidation';
import Link from 'next/link';
import { arrowToClass } from '@/utils/filterHelpers';
import { ListSkeleton, Pagination } from '@/components/common';
import Button from '@/components/common/Button';
import StatusBadge from './StatusBadge';
import CertificateBadge from './CertificateBadge';
import RowActions from './RowActions';
import { classNames, cn } from '@/utils/classNames';

interface ItemListProps {
  items: Instrument[];
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
  // UX: Empty state customization
  emptyState?: {
    message?: string;
    actionLabel?: string;
    hasActiveFilters?: boolean;
  };
  // Pagination
  currentPage?: number;
  totalPages?: number;
  totalCount?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
}

const ItemList = memo(function ItemList({
  items,
  loading,
  onDeleteClick,
  onUpdateItem,
  clientRelationships,
  getSortArrow,
  onSort,
  onAddClick,
  onSellClick,
  allClients = [],
  clientsLoading = false,
  emptyState = {},
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
}: ItemListProps) {
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    maker?: string;
    type?: string;
    subtype?: string;
    year?: string;
    price?: string;
    status?: Instrument['status'];
    serial_number?: string;
    certificate?: boolean;
    ownership?: string;
  }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savedItemId, setSavedItemId] = useState<string | null>(null);

  // Optimized: Create a Map for O(1) lookups instead of filtering for each item
  const itemsWithClients = useMemo(() => {
    // Group relationships by instrument_id for O(1) lookup
    const relationshipsByInstrument = new Map<string, ClientInstrument[]>();

    clientRelationships.forEach(rel => {
      if (rel.instrument_id) {
        const existing = relationshipsByInstrument.get(rel.instrument_id) || [];
        existing.push(rel);
        relationshipsByInstrument.set(rel.instrument_id, existing);
      }
    });

    // Map items with their clients
    const result = items.map(item => ({
      ...item,
      clients: relationshipsByInstrument.get(item.id) || [],
    }));

    // Debug logging in development
    if (
      typeof window !== 'undefined' &&
      process.env.NODE_ENV === 'development'
    ) {
      const itemsWithConnections = result.filter(
        item => item.clients.length > 0
      );
      if (itemsWithConnections.length > 0) {
        console.log('[ItemList] Items with connected clients:', {
          totalItems: items.length,
          itemsWithConnections: itemsWithConnections.length,
          sampleItem: {
            id: itemsWithConnections[0].id,
            serialNumber: itemsWithConnections[0].serial_number,
            connectedClientsCount: itemsWithConnections[0].clients.length,
            clientIds: itemsWithConnections[0].clients.map(c => c.client_id),
          },
          totalRelationships: clientRelationships.length,
        });
      }
    }

    return result;
  }, [items, clientRelationships]);

  // Create a Map of all clients for O(1) lookup by ID (for ownership UUID resolution)
  const clientsMap = useMemo(
    () => new Map(allClients.map(client => [client.id, client])),
    [allClients]
  );

  // FIXED: Extract ownership cell rendering logic into useCallback to avoid re-running expensive operations on every render
  const renderOwnership = useCallback(
    (item: (typeof itemsWithClients)[number]) => {
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
                totalClients: allClients.length,
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
              title={`클라이언트를 찾을 수 없습니다 (총 ${allClients.length}개 클라이언트 로드됨) | UUID: ${item.ownership}`}
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
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                {clientCount}
              </span>
              <span className="text-gray-600">
                {clientCount === 1 ? 'Client' : 'Clients'}
              </span>
            </div>
            {/* UX: Hover tooltip showing client details */}
            <div className="absolute left-0 top-full mt-1 z-10 hidden group-hover:block w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
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

      return <span className="text-gray-400">—</span>;
    },
    [clientsMap, allClients.length, clientsLoading]
  );

  const startEditing = useCallback((item: Instrument) => {
    setEditingItem(item.id);
    setEditData({
      maker: item.maker || '',
      type: item.type || '',
      subtype: item.subtype || '',
      year: item.year?.toString() || '',
      price: item.price?.toString() || '',
      status: item.status || 'Available',
      serial_number: item.serial_number || '',
      certificate: item.certificate ?? false,
      ownership: item.ownership || '',
    });
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingItem(null);
    setEditData({});
  }, []);

  const saveEditing = useCallback(async () => {
    if (!editingItem || !onUpdateItem) return;

    setIsSaving(true);
    try {
      // Convert form data to proper types
      const updates: Partial<Instrument> = {
        maker: editData.maker?.trim() || null,
        type: editData.type?.trim() || null,
        subtype: editData.subtype?.trim() || null,
        year: (() => {
          const yearStr = editData.year?.toString().trim();
          if (!yearStr) return null;
          const yearNum = parseInt(yearStr, 10);
          return isNaN(yearNum) ? null : yearNum;
        })(),
        price: (() => {
          const priceStr = editData.price?.toString().trim();
          if (!priceStr) return null;
          const priceNum = parseFloat(priceStr);
          return isNaN(priceNum) ? null : priceNum;
        })(),
        status: (editData.status as Instrument['status']) || 'Available',
        serial_number: editData.serial_number?.trim() || null,
        certificate: editData.certificate ?? false,
        ownership: editData.ownership?.trim() || null,
      };

      await onUpdateItem(editingItem, updates);
      setEditingItem(null);
      setEditData({});

      // UX: Show success feedback - highlight saved row
      setSavedItemId(editingItem);
      setTimeout(() => setSavedItemId(null), 2000); // Remove highlight after 2s
    } catch {
      // Error is handled by parent component's error handler
      // Don't close editing mode on error - let user see the error and retry
    } finally {
      setIsSaving(false);
    }
  }, [editingItem, editData, onUpdateItem]);

  const handleEditFieldChange = useCallback(
    (
      field:
        | 'maker'
        | 'type'
        | 'subtype'
        | 'year'
        | 'price'
        | 'status'
        | 'serial_number'
        | 'certificate'
        | 'ownership',
      value: string | boolean
    ) => {
      setEditData(prev => ({ ...prev, [field]: value }));
    },
    []
  );

  if (loading) {
    return <ListSkeleton rows={5} columns={9} />;
  }

  // UX: Improved empty state - distinguish between "no items" and "no results after filtering"
  if (items.length === 0) {
    const hasFilters = emptyState?.hasActiveFilters ?? false;
    const message =
      emptyState?.message ||
      (hasFilters ? 'No items found matching your filters' : 'No items yet');
    const subMessage = hasFilters
      ? 'Try adjusting your filters or clearing them to see all items.'
      : 'Add your first instrument to get started.';
    const actionLabel = emptyState?.actionLabel || 'Add Item';

    return (
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div
          className="text-center py-16 px-4"
          role="status"
          aria-live="polite"
        >
          <svg
            className="mx-auto h-16 w-16 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
          </svg>
          <h3 className="mt-4 text-base font-semibold text-gray-900">
            {message}
          </h3>
          <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
            {subMessage}
          </p>
          {!hasFilters && onAddClick && (
            <div className="mt-8">
              <Button
                onClick={onAddClick}
                variant="primary"
                size="md"
                className="inline-flex items-center"
              >
                <svg
                  className="w-5 h-5 mr-2"
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
                {actionLabel}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={classNames.tableWrapper}>
      <div className={classNames.tableContainer}>
        <table className={classNames.table}>
          <thead className={classNames.tableHeader}>
            <tr>
              <th className={`${classNames.tableHeaderCell} text-right`}></th>
              <th
                className={classNames.tableHeaderCellSortable}
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
                className={classNames.tableHeaderCellSortable}
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
                    {arrowToClass(getSortArrow('serial_number')) === 'sort-asc'
                      ? '▲'
                      : arrowToClass(getSortArrow('serial_number')) ===
                          'sort-desc'
                        ? '▼'
                        : '↕'}
                  </span>
                </span>
              </th>
              <th
                className={classNames.tableHeaderCellSortable}
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
                className={classNames.tableHeaderCellSortable}
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
                className={classNames.tableHeaderCellSortable}
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
                className={classNames.tableHeaderCellSortable}
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
                className={classNames.tableHeaderCellSortable}
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
              <th className={classNames.tableHeaderCell}>Ownership</th>
            </tr>
          </thead>
          <tbody className={classNames.tableBody}>
            {itemsWithClients.map(item => {
              const isEditing = editingItem === item.id;

              const isSaved = savedItemId === item.id;

              return (
                <tr
                  key={item.id}
                  className={cn(
                    classNames.tableRow,
                    isEditing
                      ? 'bg-blue-50 ring-2 ring-blue-200'
                      : isSaved
                        ? 'bg-green-50 ring-2 ring-green-200'
                        : ''
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
                          onBook={async () => {
                            if (onUpdateItem) {
                              await onUpdateItem(item.id, { status: 'Booked' });
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
                          hasCertificate={Boolean(item.certificate)}
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
                              a.download = `certificate-${item.serial_number || item.id}.pdf`;
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
                          handleEditFieldChange('status', e.target.value)
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
                          handleEditFieldChange('serial_number', e.target.value)
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
                      <div className="text-sm text-gray-900">
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
                      <div className="text-sm text-gray-900">
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
  );
});

// Status Badge, Certificate Badge, and RowActions are imported from separate component files
// to maintain consistency across the dashboard module

export default ItemList;
