import { memo, useMemo } from 'react';
import { ClientInstrument } from '@/types';
import { getRelationshipTypeStyle } from '../utils/relationshipStyles';
import { getRelationshipAccentColor } from '@/utils/colorTokens';

interface ConnectionCardProps {
  connection: ClientInstrument;
  onDelete: (connection: ClientInstrument) => void;
  onEdit: (connection: ClientInstrument) => void;
  showCreatedAt?: boolean;
}

/**
 * Format tags for display
 * Owner tag is prioritized, then alphabetical order
 */
function formatTags(tags?: string[]): string {
  if (!tags?.length) return '';
  return [...tags]
    .sort((a, b) => {
      if (a === 'Owner') return -1;
      if (b === 'Owner') return 1;
      return a.localeCompare(b);
    })
    .join(', ');
}

export const ConnectionCard = memo(function ConnectionCard({
  connection,
  onDelete,
  onEdit,
  showCreatedAt = false,
}: ConnectionCardProps) {
  const relationshipStyle = useMemo(
    () => getRelationshipTypeStyle(connection.relationship_type),
    [connection.relationship_type]
  );

  const accentColor = useMemo(
    () => getRelationshipAccentColor(connection.relationship_type),
    [connection.relationship_type]
  );

  const clientName =
    `${connection.client?.first_name || ''} ${connection.client?.last_name || ''}`.trim();
  const roleTags = formatTags(connection.client?.tags);
  const email = connection.client?.email || '';
  const instrumentName =
    `${connection.instrument?.maker || ''} ${connection.instrument?.type || ''}`.trim();
  const year = connection.instrument?.year || 'Unknown Year';
  const price =
    connection.instrument?.price === null ||
    connection.instrument?.price === undefined
      ? 'Price TBD'
      : new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: 'USD',
        }).format(connection.instrument.price);

  return (
    <div
      className={`group relative rounded-lg border border-gray-200 bg-white shadow-sm transition-all duration-150 cursor-pointer hover:shadow-md hover:border-neutral-300 ${accentColor}`}
      title={`${connection.relationship_type}: ${clientName}`}
    >
      <div className="p-4 flex justify-between items-start">
        <div className="flex-1 min-w-0">
          {/* Status Badge - 모바일에서는 상단에 표시, 데스크톱에서는 hover 시에만 표시 */}
          <div className="mb-2 lg:absolute lg:top-3 lg:right-3 lg:mb-0 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-10">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${relationshipStyle.bgColor} ${relationshipStyle.textColor} border ${relationshipStyle.borderColor} shadow-sm`}
            >
              <span>{relationshipStyle.icon}</span>
              <span>{connection.relationship_type}</span>
            </span>
          </div>
          {/* 3단 정보 구조 */}
          {/* 1. Client Name (Primary) */}
          <div className="mb-1">
            <h3 className="font-semibold text-base text-gray-900 truncate">
              {clientName || 'Unknown Client'}
            </h3>
          </div>

          {/* 2. Role · Email (Secondary, muted) */}
          <div className="mb-3 text-xs text-gray-500">
            {roleTags && email ? (
              <>
                {roleTags} · {email}
              </>
            ) : roleTags ? (
              roleTags
            ) : email ? (
              email
            ) : (
              'No details'
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100 mb-3"></div>

          {/* 3. Instrument Info (Body) */}
          <div className="space-y-1">
            {/* Instrument Name with icon */}
            <div className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-gray-400 mt-0.5 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
              <span className="text-sm text-gray-800 font-medium">
                {instrumentName || 'Unknown Instrument'}
              </span>
            </div>

            {/* Year · Price (Caption) */}
            <p className="text-xs text-gray-500 ml-6">
              {year} · {price}
            </p>
          </div>

          {/* Notes - Tertiary */}
          {connection.notes && (
            <div className="mt-3 pt-3 border-t border-gray-50">
              <p className="text-xs text-gray-600 italic bg-gray-50 border border-gray-100 px-2 py-1 rounded">
                &quot;{connection.notes}&quot;
              </p>
            </div>
          )}

          {/* Created At - Optional */}
          {showCreatedAt && connection.created_at && (
            <div className="text-xs text-gray-400 mt-2">
              Created: {new Date(connection.created_at).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Action Buttons - 모바일에서 상단에 배치하여 배지와 겹치지 않도록 */}
        <div className="flex items-start gap-1 lg:gap-2 shrink-0 ml-3 lg:mt-0">
          {/* Edit Button */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onEdit(connection);
            }}
            className="text-gray-400 hover:text-blue-500 transition-all duration-200 lg:opacity-0 lg:group-hover:opacity-100 hover:scale-110 p-2 lg:p-0"
            title="Edit connection"
            aria-label="Edit connection"
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>

          {/* Delete Button */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onDelete(connection);
            }}
            className="text-gray-400 hover:text-red-500 transition-all duration-200 lg:opacity-0 lg:group-hover:opacity-100 hover:scale-110 p-2 lg:p-0"
            title="Delete connection"
            aria-label="Delete connection"
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});
