import { memo, useMemo } from 'react';
import { ClientInstrument } from '@/types';

interface ConnectionCardProps {
  connection: ClientInstrument;
  onDelete: (connectionId: string) => void;
  onEdit: (connection: ClientInstrument) => void;
}

export const ConnectionCard = memo(function ConnectionCard({
  connection,
  onDelete,
  onEdit,
}: ConnectionCardProps) {
  const formatTags = useMemo(() => {
    if (!connection.client?.tags || connection.client.tags.length === 0)
      return 'No tags';
    return connection.client.tags
      .sort((a, b) => {
        if (a === 'Owner') return -1;
        if (b === 'Owner') return 1;
        return a.localeCompare(b);
      })
      .join(', ');
  }, [connection.client?.tags]);

  return (
    <div className="group rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md hover:scale-[1.01] hover:-translate-y-[1px] transition-all duration-200 hover:bg-gray-50">
      <div className="px-4 lg:px-5 py-3 flex justify-between items-start lg:items-center">
        <div className="flex flex-col space-y-2 leading-relaxed">
          {/* Client Info - Primary */}
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span className="font-semibold text-gray-900 text-[15px]">
              {connection.client?.first_name} {connection.client?.last_name}
            </span>
          </div>

          {/* Client Details - Secondary */}
          <div className="text-sm text-gray-500 ml-6">
            {connection.client?.email} • {formatTags}
          </div>

          {/* Instrument Info - Primary */}
          <div className="text-gray-800 font-medium text-[14px] mt-1">
            ↳ {connection.instrument?.maker} {connection.instrument?.type}
          </div>

          {/* Instrument Details - Secondary */}
          <p className="text-sm text-gray-500 ml-6">
            {connection.instrument?.year || 'Unknown Year'} • $
            {connection.instrument?.price?.toLocaleString() || 'Price TBD'}
          </p>

          {/* Notes - Tertiary */}
          {connection.notes && (
            <p className="text-xs text-gray-600 mt-2 italic ml-6 bg-gray-50 px-2 py-1 rounded">
              &quot;{connection.notes}&quot;
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 lg:gap-2 flex-shrink-0">
          {/* Edit Button - Always visible on mobile, hover on desktop */}
          <button
            type="button"
            onClick={() => onEdit(connection)}
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

          {/* Delete Button - Always visible on mobile, hover on desktop */}
          <button
            type="button"
            onClick={() => onDelete(connection.id)}
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
