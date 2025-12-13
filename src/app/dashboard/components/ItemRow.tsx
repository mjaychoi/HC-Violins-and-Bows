'use client';

/**
 * ItemRow Component
 *
 * Note: Currently this component is exported but not actively used in ItemList.
 * ItemList renders table rows directly (<tr>) instead of using this component.
 *
 * This component is kept for potential future refactoring or alternative use cases.
 * If ItemList is refactored to use ItemRow, ensure the parent provides the key prop.
 */
import React, { memo } from 'react';
import Link from 'next/link';
import { Instrument, ClientInstrument } from '@/types';
import {
  formatInstrumentPrice,
  formatInstrumentYear,
} from '../utils/dashboardUtils';
import StatusBadge from './StatusBadge';
import CertificateBadge from './CertificateBadge';
import RowActions from './RowActions';

interface ItemRowProps {
  item: Instrument & { clients: ClientInstrument[] };
  isEditing: boolean;
  editData: {
    maker?: string;
    type?: string;
    subtype?: string;
    year?: string;
    price?: string;
    status?: Instrument['status'];
    serial_number?: string;
    certificate?: boolean;
    ownership?: string;
  };
  isSaving: boolean;
  onStartEditing: () => void;
  onSaveEditing: () => void;
  onCancelEditing: () => void;
  onDeleteClick: () => void;
  onEditFieldChange: (
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
  ) => void;
}

export const ItemRow = memo(function ItemRow({
  item,
  isEditing,
  editData,
  isSaving,
  onStartEditing,
  onSaveEditing,
  onCancelEditing,
  onDeleteClick,
  onEditFieldChange,
}: ItemRowProps) {
  // FIXED: Use fetch → blob → object URL for more reliable PDF download
  const handleDownloadCertificate = async () => {
    try {
      const res = await fetch(`/api/certificates/${item.id}`);
      if (!res.ok) {
        // Could surface toast error if desired
        return;
      }
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
      console.error('Failed to download certificate:', error);
      // Could surface toast error if desired
    }
  };
  // Note: key prop is provided by parent component when ItemRow is used
  return (
    <tr
      className={`transition ${isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
    >
      <td className="px-6 py-4 text-left relative">
        {isEditing ? (
          <div className="flex items-center justify-end space-x-1">
            <button
              onClick={e => {
                e.stopPropagation();
                onSaveEditing();
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
                onCancelEditing();
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
            onEdit={onStartEditing}
            onDelete={onDeleteClick}
            onDownloadCertificate={handleDownloadCertificate}
            hasCertificate={Boolean(item.certificate)}
          />
        )}
      </td>
      <td className="px-6 py-4">
        {isEditing ? (
          <select
            value={editData.status || 'Available'}
            onChange={e => onEditFieldChange('status', e.target.value)}
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
            onChange={e => onEditFieldChange('serial_number', e.target.value)}
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
            onChange={e => onEditFieldChange('maker', e.target.value)}
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
            onChange={e => onEditFieldChange('type', e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={e => e.stopPropagation()}
            placeholder="Type"
          />
        ) : (
          <div className="text-sm text-gray-900">{item.type || '—'}</div>
        )}
      </td>

      <td className="px-6 py-4">
        {isEditing ? (
          <input
            type="text"
            value={editData.subtype || ''}
            onChange={e => onEditFieldChange('subtype', e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={e => e.stopPropagation()}
            placeholder="Subtype"
          />
        ) : (
          <div className="text-sm text-gray-900">{item.subtype || '—'}</div>
        )}
      </td>

      <td className="px-6 py-4">
        {isEditing ? (
          <input
            type="number"
            value={editData.year || ''}
            onChange={e => onEditFieldChange('year', e.target.value)}
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
            onChange={e => onEditFieldChange('price', e.target.value)}
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
          // FIXED: Use boolean option values instead of Yes/No strings
          <select
            value={String(!!editData.certificate)}
            onChange={e =>
              onEditFieldChange('certificate', e.target.value === 'true')
            }
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={e => e.stopPropagation()}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
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
            onChange={e => onEditFieldChange('ownership', e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={e => e.stopPropagation()}
            placeholder="Ownership"
          />
        ) : (
          <div className="text-sm text-gray-900">
            {item.ownership ? (
              // FIXED: Improve ownership matching heuristic - guard empty strings
              (() => {
                const matchingClient = item.clients.find(rel => {
                  // Guard against empty string matches (includes('') is always true)
                  const fn = rel.client?.first_name?.trim();
                  const ln = rel.client?.last_name?.trim();
                  if (!fn && !ln) return false;

                  // Try to match ownership with client name
                  // Note: This is a heuristic - substring matching can give false positives
                  // If ownership is meant to link to a client, store client_id UUID instead
                  return (
                    item.ownership &&
                    ((fn && item.ownership.includes(fn)) ||
                      (ln && item.ownership.includes(ln)) ||
                      item.ownership === `${fn || ''} ${ln || ''}`.trim())
                  );
                });

                if (matchingClient?.client_id) {
                  return (
                    <Link
                      href={`/clients?clientId=${matchingClient.client_id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                      title="View client details"
                    >
                      {item.ownership}
                    </Link>
                  );
                }

                // If no match, just show as text
                return <span>{item.ownership}</span>;
              })()
            ) : // Show connected clients if no ownership
            item.clients.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {item.clients.slice(0, 2).map(rel => {
                  if (!rel.client_id) return null;
                  const clientName = rel.client
                    ? `${rel.client.first_name || ''} ${rel.client.last_name || ''}`.trim() ||
                      rel.client.email ||
                      'Client'
                    : 'Client';
                  return (
                    <Link
                      key={rel.id}
                      href={`/clients?clientId=${rel.client_id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                      title="View client details"
                    >
                      {clientName}
                    </Link>
                  );
                })}
                {item.clients.length > 2 && (
                  <span className="text-xs text-gray-500">
                    +{item.clients.length - 2}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
});
