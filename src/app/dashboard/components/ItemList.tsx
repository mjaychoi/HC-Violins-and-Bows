'use client';

import React, { useState, memo, useMemo, useCallback } from 'react';
import { Instrument, ClientInstrument } from '@/types';
import {
  formatInstrumentPrice,
  formatInstrumentYear,
} from '../utils/dashboardUtils';

interface ItemListProps {
  items: Instrument[];
  loading: boolean;
  onItemClick: (item: Instrument) => void;
  onEditClick: (item: Instrument) => void;
  onDeleteClick: (item: Instrument) => void;
  clientRelationships: ClientInstrument[];
  getSortArrow: (field: string) => string;
  onSort: (field: string) => void;
}

const ItemList = memo(function ItemList({
  items,
  loading,
  onItemClick,
  onEditClick,
  onDeleteClick,
  clientRelationships,
  getSortArrow,
  onSort,
}: ItemListProps) {
  const getItemClients = useCallback(
    (itemId: string) => {
      return clientRelationships.filter(rel => rel.instrument_id === itemId);
    },
    [clientRelationships]
  );

  // 메모이제이션된 계산된 값들
  const itemsWithClients = useMemo(() => {
    return items.map(item => ({
      ...item,
      clients: getItemClients(item.id),
    }));
  }, [items, getItemClients]);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="p-6">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-center space-x-4">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
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
                onClick={() => onSort('maker')}
              >
                <span className="inline-flex items-center gap-1">
                  Maker
                  <span
                    className={`opacity-0 group-hover:opacity-100 ${getSortArrow('maker') && 'opacity-100 text-gray-900'}`}
                  >
                    {getSortArrow('maker') === '↑'
                      ? '▲'
                      : getSortArrow('maker') === '↓'
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
                    className={`opacity-0 group-hover:opacity-100 ${getSortArrow('type') && 'opacity-100 text-gray-900'}`}
                  >
                    {getSortArrow('type') === '↑'
                      ? '▲'
                      : getSortArrow('type') === '↓'
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
                    className={`opacity-0 group-hover:opacity-100 ${getSortArrow('year') && 'opacity-100 text-gray-900'}`}
                  >
                    {getSortArrow('year') === '↑'
                      ? '▲'
                      : getSortArrow('year') === '↓'
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
                    className={`opacity-0 group-hover:opacity-100 ${getSortArrow('price') && 'opacity-100 text-gray-900'}`}
                  >
                    {getSortArrow('price') === '↑'
                      ? '▲'
                      : getSortArrow('price') === '↓'
                        ? '▼'
                        : '↕'}
                  </span>
                </span>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-semibold text-gray-500 cursor-pointer group select-none"
                onClick={() => onSort('status')}
              >
                <span className="inline-flex items-center gap-1">
                  Status
                  <span
                    className={`opacity-0 group-hover:opacity-100 ${getSortArrow('status') && 'opacity-100 text-gray-900'}`}
                  >
                    {getSortArrow('status') === '↑'
                      ? '▲'
                      : getSortArrow('status') === '↓'
                        ? '▼'
                        : '↕'}
                  </span>
                </span>
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">
                Clients
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {itemsWithClients.map(item => {
              const itemClients = item.clients;

              return (
                <tr key={item.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {item.maker}
                    </div>
                    <div className="text-xs text-gray-500">{item.type}</div>
                  </td>

                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {formatInstrumentYear(item.year)}
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {formatInstrumentPrice(item.price)}
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <StatusBadge status={item.status} />
                  </td>

                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {itemClients.slice(0, 2).map((rel, index) => (
                        <ClientPill
                          key={index}
                          name={`${rel.client?.first_name} ${rel.client?.last_name}`}
                        />
                      ))}
                      {itemClients.length > 2 && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          +{itemClients.length - 2} more
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-6 py-4 text-right">
                    <RowActions
                      onView={() => onItemClick(item)}
                      onEdit={() => onEditClick(item)}
                      onDelete={() => onDeleteClick(item)}
                    />
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

// Client Pill Component
const ClientPill = ({ name }: { name: string }) => (
  <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 text-xs px-2 py-1">
    {name}
  </span>
);

// Row Actions Component
const RowActions = ({
  onView,
  onEdit,
  onDelete,
}: {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative flex justify-end">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-md hover:bg-gray-50"
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
          <div className="absolute right-0 z-20 mt-2 w-36 rounded-md border bg-white shadow-lg">
            <button
              onClick={() => {
                onView();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-50"
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
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              View
            </button>
            <button
              onClick={() => {
                onEdit();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-50"
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
              className="flex w-full items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50"
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
