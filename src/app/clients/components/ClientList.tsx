'use client';
// src/app/clients/components/ClientList.tsx
import { Client, ClientInstrument } from '@/types';
import {
  getTagColor,
  sortTags,
  /* formatClientContact, getClientInitials */ getInterestColor,
} from '../utils';
import { useState, memo, useMemo, useCallback } from 'react';

const SortIcon = ({ cls }: { cls: string }) => (
  <span aria-hidden className={cls} />
);

interface ClientListProps {
  clients: Client[];
  clientsWithInstruments: Set<string>;
  clientInstruments: ClientInstrument[];
  onClientClick: (client: Client) => void;
  onEditClient: (client: Client) => void;
  onUpdateClient: (clientId: string, updates: Partial<Client>) => Promise<void>;
  onColumnSort: (column: keyof Client) => void;
  getSortArrow: (column: keyof Client) => string;
}

const ClientList = memo(function ClientList({
  clients,
  clientInstruments,
  onClientClick,
  onUpdateClient,
  onColumnSort,
  getSortArrow,
}: ClientListProps) {
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Client>>({});
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = useCallback((client: Client) => {
    setEditingClient(client.id);
    setEditData({
      first_name: client.first_name,
      last_name: client.last_name,
      email: client.email,
      contact_number: client.contact_number,
      interest: client.interest,
      note: client.note,
    });
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingClient(null);
    setEditData({});
  }, []);

  const saveEditing = useCallback(async () => {
    if (!editingClient) return;

    setIsSaving(true);
    try {
      await onUpdateClient(editingClient, editData);
      setEditingClient(null);
      setEditData({});
    } catch (error) {
      console.error('Error updating client:', error);
    } finally {
      setIsSaving(false);
    }
  }, [editingClient, editData, onUpdateClient]);

  const handleEditFieldChange = useCallback(
    (field: keyof Client, value: string) => {
      setEditData(prev => ({ ...prev, [field]: value }));
    },
    []
  );

  // memoized calculated values
  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => {
      // default sorting logic (optional)
      return (a.first_name || '').localeCompare(b.first_name || '');
    });
  }, [clients]);

  // Note: mapping by client id was unused; keep logic simple per-row filter for clarity

  if (clients.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg">No clients found</div>
          <div className="text-gray-400 text-sm mt-2">
            Try adjusting your search or filters
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onColumnSort('first_name')}
              >
                <div className="flex items-center">
                  Name
                  <SortIcon cls={getSortArrow('first_name')} />
                </div>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onColumnSort('contact_number')}
              >
                <div className="flex items-center">
                  Contact
                  <SortIcon cls={getSortArrow('contact_number')} />
                </div>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onColumnSort('tags')}
              >
                <div className="flex items-center">
                  Tags
                  <SortIcon cls={getSortArrow('tags')} />
                </div>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => onColumnSort('interest')}
              >
                <div className="flex items-center">
                  Interest
                  <SortIcon cls={getSortArrow('interest')} />
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Instruments
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedClients.map(client => (
              <tr
                key={client.id}
                onClick={() =>
                  editingClient !== client.id && onClientClick(client)
                }
                className={
                  editingClient === client.id
                    ? 'bg-blue-50'
                    : 'hover:bg-gray-50 cursor-pointer transition-colors duration-200'
                }
              >
                <td className="px-6 py-3 whitespace-nowrap">
                  {editingClient === client.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editData.first_name || ''}
                        onChange={e =>
                          handleEditFieldChange('first_name', e.target.value)
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={e => e.stopPropagation()}
                        placeholder="First name"
                      />
                      <input
                        type="text"
                        value={editData.last_name || ''}
                        onChange={e =>
                          handleEditFieldChange('last_name', e.target.value)
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={e => e.stopPropagation()}
                        placeholder="Last name"
                      />
                      <input
                        type="email"
                        value={editData.email || ''}
                        onChange={e =>
                          handleEditFieldChange('email', e.target.value)
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={e => e.stopPropagation()}
                        placeholder="Email"
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {`${client.first_name || ''} ${client.last_name || ''}`.trim() ||
                          'N/A'}
                      </div>
                      {client.email && (
                        <div className="text-xs text-gray-500 mt-1">
                          {client.email}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-3 whitespace-nowrap">
                  {editingClient === client.id ? (
                    <input
                      type="tel"
                      value={editData.contact_number || ''}
                      onChange={e =>
                        handleEditFieldChange('contact_number', e.target.value)
                      }
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onClick={e => e.stopPropagation()}
                      placeholder="Phone number"
                    />
                  ) : (
                    <div className="text-sm text-gray-900">
                      {client.contact_number ? (
                        <span>{client.contact_number}</span>
                      ) : (
                        <span className="text-gray-400">No contact</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-3 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1">
                    {sortTags([...client.tags]).map(tag => (
                      <span
                        key={tag}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTagColor(tag)}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-3 whitespace-nowrap">
                  {editingClient === client.id ? (
                    <input
                      type="text"
                      value={editData.interest || ''}
                      onChange={e =>
                        handleEditFieldChange('interest', e.target.value)
                      }
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onClick={e => e.stopPropagation()}
                      placeholder="Interest"
                    />
                  ) : (
                    <div className="text-sm">
                      {client.interest ? (
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getInterestColor(client.interest)}`}
                        >
                          {client.interest}
                        </span>
                      ) : (
                        <span className="text-gray-400">No interest</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-3 whitespace-nowrap">
                  <div className="flex flex-col gap-1">
                    {(() => {
                      const clientInstrumentData = clientInstruments.filter(
                        ci => ci.client_id === client.id
                      );
                      if (clientInstrumentData.length === 0) {
                        return (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            None
                          </span>
                        );
                      }
                      return clientInstrumentData.map(ci => {
                        const instrumentName = ci.instrument
                          ? `${ci.instrument.maker || 'Unknown'} ${ci.instrument.type || 'Instrument'}`.trim()
                          : 'Unknown Instrument';
                        return (
                          <span
                            key={ci.id}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                            title={`${instrumentName} - ${ci.relationship_type}`}
                          >
                            {instrumentName}
                          </span>
                        );
                      });
                    })()}
                  </div>
                </td>
                <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium">
                  {editingClient === client.id ? (
                    <div className="flex items-center space-x-1">
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
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onClientClick(client);
                        }}
                        className="text-gray-400 hover:text-blue-500 transition-all duration-200 hover:scale-110 p-2 rounded-md hover:bg-blue-50"
                        title="View client details"
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
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          startEditing(client);
                        }}
                        className="text-gray-400 hover:text-green-500 transition-all duration-200 hover:scale-110 p-2 rounded-md hover:bg-green-50"
                        title="Edit client"
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
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (client.email) {
                            window.open(`mailto:${client.email}`, '_self');
                          } else {
                            alert('No email address available');
                          }
                        }}
                        className="text-gray-400 hover:text-blue-500 transition-all duration-200 hover:scale-110 p-2 rounded-md hover:bg-blue-50"
                        title="Email client"
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
                            d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default ClientList;
