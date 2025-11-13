'use client';

import React, { useState, memo, useMemo, useCallback } from 'react';
import { Instrument, ClientInstrument } from '@/types';
import {
  formatInstrumentPrice,
  formatInstrumentYear,
} from '../utils/dashboardUtils';
import { arrowToClass } from '@/utils/filterHelpers';
import { ListSkeleton } from '@/components/common';

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
}

const ItemList = memo(function ItemList({
  items,
  loading,
  onDeleteClick,
  onUpdateItem,
  clientRelationships,
  getSortArrow,
  onSort,
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

  // Optimized: Create a Map for O(1) lookups instead of filtering for each item
  const itemsWithClients = useMemo(() => {
    // Group relationships by instrument_id for O(1) lookup
    const relationshipsByInstrument = new Map<string, ClientInstrument[]>();

    clientRelationships.forEach(rel => {
      const existing = relationshipsByInstrument.get(rel.instrument_id) || [];
      existing.push(rel);
      relationshipsByInstrument.set(rel.instrument_id, existing);
    });

    // Map items with their clients
    return items.map(item => ({
      ...item,
      clients: relationshipsByInstrument.get(item.id) || [],
    }));
  }, [items, clientRelationships]);

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

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
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
          <h3 className="mt-2 text-sm font-medium text-gray-900">No items</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating your first item.
          </p>
          <div className="mt-6">
            <button className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              <svg
                className="w-4 h-4 mr-2"
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
              Add Item
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-white/80 backdrop-blur border-b">
            <tr>
              <th
                className="px-6 py-3 text-left text-xs font-semibold text-gray-500 cursor-pointer group select-none"
                onClick={() => onSort('status')}
              >
                <span className="inline-flex items-center gap-1">
                  Status
                  <span
                    className={`opacity-0 group-hover:opacity-100 ${arrowToClass(getSortArrow('status')) !== 'sort-neutral' ? 'opacity-100 text-gray-900' : ''}`}
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
                className="px-6 py-3 text-left text-xs font-semibold text-gray-500 cursor-pointer group select-none"
                onClick={() => onSort('serial_number')}
              >
                <span className="inline-flex items-center gap-1">
                  Serial #
                  <span
                    className={`opacity-0 group-hover:opacity-100 ${arrowToClass(getSortArrow('serial_number')) !== 'sort-neutral' ? 'opacity-100 text-gray-900' : ''}`}
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
                className="px-6 py-3 text-left text-xs font-semibold text-gray-500 cursor-pointer group select-none"
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
                className="px-6 py-3 text-left text-xs font-semibold text-gray-500 cursor-pointer group select-none"
                onClick={() => onSort('type')}
              >
                <span className="inline-flex items-center gap-1">
                  Type
                  <span
                    className={`opacity-0 group-hover:opacity-100 ${arrowToClass(getSortArrow('type')) !== 'sort-neutral' ? 'opacity-100 text-gray-900' : ''}`}
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
                className="px-6 py-3 text-left text-xs font-semibold text-gray-500 cursor-pointer group select-none"
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
                className="px-6 py-3 text-left text-xs font-semibold text-gray-500 cursor-pointer group select-none"
                onClick={() => onSort('year')}
              >
                <span className="inline-flex items-center gap-1">
                  Year
                  <span
                    className={`opacity-0 group-hover:opacity-100 ${arrowToClass(getSortArrow('year')) !== 'sort-neutral' ? 'opacity-100 text-gray-900' : ''}`}
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
                className="px-6 py-3 text-left text-xs font-semibold text-gray-500 cursor-pointer group select-none"
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
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">
                Certificate
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">
                Ownership
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {itemsWithClients.map(item => {
              const itemClients = item.clients;
              const isEditing = editingItem === item.id;

              return (
                <tr
                  key={item.id}
                  className={`transition ${
                    isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-6 py-4">
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

                  <td className="px-6 py-4">
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

                  <td className="px-6 py-4">
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

                  <td className="px-6 py-4">
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

                  <td className="px-6 py-4">
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

                  <td className="px-6 py-4">
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

                  <td className="px-6 py-4">
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
                      <div className="text-sm text-gray-900">
                        {formatInstrumentPrice(item.price)}
                      </div>
                    )}
                  </td>

                  <td className="px-6 py-4">
                    {isEditing ? (
                      <select
                        value={editData.certificate ? 'Yes' : 'No'}
                        onChange={e =>
                          handleEditFieldChange(
                            'certificate',
                            e.target.value === 'Yes'
                          )
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={e => e.stopPropagation()}
                      >
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    ) : (
                      <CertificateBadge certificate={item.certificate} />
                    )}
                  </td>

                  <td className="px-6 py-4">
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
                      <div className="text-sm text-gray-900">
                        {item.ownership || '—'}
                      </div>
                    )}
                  </td>

                  <td className="px-6 py-4 text-right">
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
                      <RowActions
                        onEdit={() => startEditing(item)}
                        onDelete={() => onDeleteClick(item)}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

// Status Badge Component
const StatusBadge = ({ status }: { status: string }) => {
  const statusMap = {
    Available: 'bg-green-50 text-green-700 ring-1 ring-green-100',
    Sold: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
    Reserved: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
    Maintenance: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
  } as const;

  const iconMap = {
    Available: '✅',
    Sold: '💰',
    Reserved: '🔒',
    Maintenance: '🔧',
  } as const;

  const icon = iconMap[status as keyof typeof iconMap] ?? '❓';
  const className =
    statusMap[status as keyof typeof statusMap] ||
    'bg-gray-50 text-gray-700 ring-1 ring-gray-100';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${className}`}
    >
      <span>{icon}</span>
      {status}
    </span>
  );
};

// Certificate Badge Component
const CertificateBadge = ({ certificate }: { certificate: boolean }) => {
  const className = certificate
    ? 'bg-green-50 text-green-700 ring-1 ring-green-100'
    : 'bg-red-50 text-red-700 ring-1 ring-red-100';

  const icon = certificate ? '✓' : '✗';
  const text = certificate ? 'Yes' : 'No';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${className}`}
    >
      <span>{icon}</span>
      {text}
    </span>
  );
};

// Client Pill Component
const ClientPill = ({ name }: { name: string }) => (
  <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 text-xs px-2 py-1">
    {name}
  </span>
);

// Row Actions Component
const RowActions = ({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative flex justify-end">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-md hover:bg-gray-50 transition-colors duration-200"
        aria-label="More actions"
      >
        <svg
          className="w-4 h-4 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
          />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-2 w-32 rounded-md border border-gray-200 bg-white shadow-lg">
            <button
              onClick={() => {
                onEdit();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-200"
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
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Edit
            </button>
            <button
              onClick={() => {
                onDelete();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors duration-200"
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
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ItemList;
