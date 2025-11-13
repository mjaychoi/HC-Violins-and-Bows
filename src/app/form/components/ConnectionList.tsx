'use client';

import React from 'react';
import { format } from 'date-fns';
import { ClientInstrument } from '@/types';
import {
  formatConnectionName,
  getRelationshipColor,
  getRelationshipIcon,
} from '../utils';

interface ConnectionListProps {
  connections: ClientInstrument[];
  onDeleteConnection: (connectionId: string) => void;
  submitting: boolean;
}

const ConnectionList = React.memo(function ConnectionList({
  connections,
  onDeleteConnection,
  submitting,
}: ConnectionListProps) {
  const handleDelete = async (connectionId: string) => {
    if (!confirm('Are you sure you want to delete this connection?')) return;
    await onDeleteConnection(connectionId);
  };

  if (connections.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 text-6xl mb-4">🔗</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No Connections Found
        </h3>
        <p className="text-gray-500">
          Create your first connection between a client and an instrument.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {connections.map(connection => (
        <div
          key={connection.id}
          className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <span className="text-2xl">
                  {getRelationshipIcon(connection.relationship_type)}
                </span>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    {formatConnectionName(connection)}
                  </h3>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRelationshipColor(connection.relationship_type)}`}
                    >
                      {connection.relationship_type}
                    </span>
                    <span className="text-sm text-gray-500">
                      {(() => {
                        const created = new Date(connection.created_at);
                        return Number.isNaN(created.valueOf())
                          ? '—'
                          : format(created, 'yyyy-MM-dd');
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {connection.notes && (
                <div className="mt-2 p-3 bg-gray-50 rounded-md">
                  <p className="text-sm text-gray-700">{connection.notes}</p>
                </div>
              )}
            </div>

            <button
              onClick={() => handleDelete(connection.id)}
              disabled={submitting}
              aria-disabled={submitting}
              className="ml-4 text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className="w-5 h-5"
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
            </button>
          </div>
        </div>
      ))}
    </div>
  );
});

export default ConnectionList;
