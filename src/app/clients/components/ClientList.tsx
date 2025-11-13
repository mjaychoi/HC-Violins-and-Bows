'use client';
// src/app/clients/components/ClientList.tsx
import { Client, ClientInstrument } from '@/types';
import {
  getTagColor,
  getTagTextColor,
  sortTags,
  /* formatClientContact, getClientInitials */ getInterestColor,
} from '../utils';
import { useState, memo, useCallback, useEffect, useRef } from 'react';
import { useOptimizedInstruments } from '@/hooks/useOptimizedInstruments';

const SortIcon = ({ arrow }: { arrow: string }) => (
  <span aria-hidden className="inline-block w-3">
    {arrow}
  </span>
);

interface ClientListProps {
  clients: Client[];
  clientInstruments: ClientInstrument[];
  onClientClick: (client: Client) => void;
  onUpdateClient: (clientId: string, updates: Partial<Client>) => Promise<void>;
  onDeleteClient?: (clientId: string) => Promise<void>;
  onColumnSort: (column: keyof Client) => void;
  getSortArrow: (column: keyof Client) => string;
  onAddInstrument?: (
    clientId: string,
    instrumentId: string,
    relationshipType?: ClientInstrument['relationship_type']
  ) => Promise<void>;
  onRemoveInstrument?: (relationshipId: string) => Promise<void>;
}

const ClientList = memo(function ClientList({
  clients,
  clientInstruments: _clientInstruments, // eslint-disable-line @typescript-eslint/no-unused-vars
  onClientClick,
  onUpdateClient,
  onDeleteClient,
  onColumnSort,
  getSortArrow,
  onAddInstrument,
  onRemoveInstrument,
}: ClientListProps) {
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Client>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showInstrumentDropdown, setShowInstrumentDropdown] = useState<
    string | null
  >(null);
  const [instrumentSearchTerm, setInstrumentSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { searchInstruments } = useOptimizedInstruments();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowInstrumentDropdown(null);
        setInstrumentSearchTerm('');
      }
    };

    if (showInstrumentDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showInstrumentDropdown]);

  // Search instruments when term changes
  useEffect(() => {
    if (instrumentSearchTerm.length >= 2) {
      searchInstruments(instrumentSearchTerm);
    }
  }, [instrumentSearchTerm, searchInstruments]);

  // These functions are kept for future use when instrument management is added to inline editing
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleAddInstrument = async (
    clientId: string,
    instrumentId: string
  ) => {
    if (onAddInstrument) {
      await onAddInstrument(clientId, instrumentId, 'Interested');
      setShowInstrumentDropdown(null);
      setInstrumentSearchTerm('');
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRemoveInstrument = async (relationshipId: string) => {
    if (onRemoveInstrument) {
      await onRemoveInstrument(relationshipId);
      // Refresh relationships for the client being edited
      // Note: This will be handled by the parent component
    }
  };

  const startEditing = useCallback((client: Client) => {
    setEditingClient(client.id);
    setEditData({
      first_name: client.first_name || '',
      last_name: client.last_name || '',
      email: client.email || '',
      contact_number: client.contact_number || '',
      interest: client.interest || '',
      note: client.note || '',
      tags: client.tags || [],
      client_number: client.client_number || '',
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
      // Only close editing mode if update was successful
      // If updateClient returns null or throws an error, editing mode will remain open
      setEditingClient(null);
      setEditData({});
    } catch {
      // Error is handled by parent component's error handler
      // Don't close editing mode on error - let user see the error and retry
      // Editing mode remains open so user can fix the issue and try again
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

  // Handle full name change - split into first_name and last_name
  const handleFullNameChange = useCallback((fullName: string) => {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setEditData(prev => ({ ...prev, first_name: '', last_name: '' }));
      return;
    }

    const parts = trimmedName.split(/\s+/);
    if (parts.length === 1) {
      // Only one word - treat as first name
      setEditData(prev => ({ ...prev, first_name: parts[0], last_name: '' }));
    } else {
      // Multiple words - last word is last name, rest is first name
      const lastName = parts[parts.length - 1];
      const firstName = parts.slice(0, -1).join(' ');
      setEditData(prev => ({
        ...prev,
        first_name: firstName,
        last_name: lastName,
      }));
    }
  }, []);

  // Handle tag toggle
  const handleTagToggle = useCallback((tag: string) => {
    setEditData(prev => {
      const currentTags = prev.tags || [];
      const tagIndex = currentTags.indexOf(tag);
      if (tagIndex > -1) {
        // Remove tag
        return { ...prev, tags: currentTags.filter(t => t !== tag) };
      } else {
        // Add tag
        return { ...prev, tags: [...currentTags, tag] };
      }
    });
  }, []);

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
        <table className="min-w-full divide-y divide-gray-200 table-fixed">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[12%]" />
            <col className="w-[18%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button
                  type="button"
                  className="flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-sm hover:bg-gray-100"
                  onClick={() => onColumnSort('first_name')}
                  aria-label={`Sort by name ${getSortArrow('first_name') === '↑' ? 'ascending' : getSortArrow('first_name') === '↓' ? 'descending' : ''}`}
                >
                  Name <SortIcon arrow={getSortArrow('first_name')} />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button
                  type="button"
                  className="flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-sm hover:bg-gray-100"
                  onClick={() => onColumnSort('contact_number')}
                  aria-label={`Sort by contact ${getSortArrow('contact_number') === '↑' ? 'ascending' : getSortArrow('contact_number') === '↓' ? 'descending' : ''}`}
                >
                  Contact <SortIcon arrow={getSortArrow('contact_number')} />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button
                  type="button"
                  className="flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-sm hover:bg-gray-100"
                  onClick={() => onColumnSort('tags')}
                  aria-label={`Sort by tags ${getSortArrow('tags') === '↑' ? 'ascending' : getSortArrow('tags') === '↓' ? 'descending' : ''}`}
                >
                  Tags
                  <SortIcon arrow={getSortArrow('tags')} />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button
                  type="button"
                  className="flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-sm hover:bg-gray-100"
                  onClick={() => onColumnSort('interest')}
                  aria-label={`Sort by interest ${getSortArrow('interest') === '↑' ? 'ascending' : getSortArrow('interest') === '↓' ? 'descending' : ''}`}
                >
                  Interest <SortIcon arrow={getSortArrow('interest')} />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button
                  type="button"
                  className="flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-sm hover:bg-gray-100"
                  onClick={() => onColumnSort('client_number')}
                  aria-label={`Sort by client number ${getSortArrow('client_number') === '↑' ? 'ascending' : getSortArrow('client_number') === '↓' ? 'descending' : ''}`}
                >
                  Client # <SortIcon arrow={getSortArrow('client_number')} />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {clients.map(client => (
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
                <td className="px-6 py-3">
                  {editingClient === client.id ? (
                    <div className="min-w-[200px] space-y-2">
                      <input
                        type="text"
                        value={`${editData.first_name || ''} ${editData.last_name || ''}`.trim()}
                        onChange={e => handleFullNameChange(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={e => e.stopPropagation()}
                        placeholder="Full name"
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
                    <div className="min-w-[150px]">
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
                <td className="px-6 py-3">
                  {editingClient === client.id ? (
                    <div className="min-w-[150px]">
                      <input
                        type="tel"
                        value={editData.contact_number || ''}
                        onChange={e =>
                          handleEditFieldChange(
                            'contact_number',
                            e.target.value
                          )
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={e => e.stopPropagation()}
                        placeholder="Phone number"
                      />
                    </div>
                  ) : (
                    <div className="text-sm text-gray-900 min-w-[120px]">
                      {client.contact_number ? (
                        <span>{client.contact_number}</span>
                      ) : (
                        <span className="text-gray-400">No contact</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-3">
                  {editingClient === client.id ? (
                    <div className="min-w-[150px]">
                      <div className="space-y-1.5">
                        {[
                          'Owner',
                          'Musician',
                          'Dealer',
                          'Collector',
                          'Other',
                        ].map(tag => (
                          <label
                            key={tag}
                            className="flex items-center cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors duration-150"
                            onClick={e => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={(editData.tags || []).includes(tag)}
                              onChange={() => handleTagToggle(tag)}
                              className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                              onClick={e => e.stopPropagation()}
                            />
                            <span
                              className={`ml-2 text-xs font-medium ${getTagTextColor(tag)}`}
                            >
                              {tag}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1 min-w-[120px]">
                      {sortTags([...client.tags]).map(tag => (
                        <span
                          key={tag}
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTagColor(tag)}`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-6 py-3">
                  {editingClient === client.id ? (
                    <div className="min-w-[120px]">
                      <select
                        value={editData.interest || ''}
                        onChange={e =>
                          handleEditFieldChange('interest', e.target.value)
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={e => e.stopPropagation()}
                      >
                        <option value="">Select interest</option>
                        <option value="Active">Active</option>
                        <option value="Passive">Passive</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  ) : (
                    <div className="text-sm min-w-[100px]">
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
                <td className="px-6 py-3">
                  {editingClient === client.id ? (
                    <input
                      type="text"
                      value={editData.client_number || ''}
                      onChange={e =>
                        handleEditFieldChange('client_number', e.target.value)
                      }
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onClick={e => e.stopPropagation()}
                      placeholder="Client #"
                    />
                  ) : (
                    <div className="text-sm text-gray-900 font-mono">
                      {client.client_number || '—'}
                    </div>
                  )}
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
                        aria-label="View client details"
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
                        aria-label="Edit client"
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
                            window.location.href = `mailto:${client.email}`;
                          } else {
                            alert('No email address available');
                          }
                        }}
                        aria-label={`Email ${client.email ?? 'client (no email)'}`}
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
                      {onDeleteClient && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (
                              window.confirm(
                                `Are you sure you want to delete ${client.first_name} ${client.last_name}? This action cannot be undone.`
                              )
                            ) {
                              onDeleteClient(client.id);
                            }
                          }}
                          aria-label="Delete client"
                          className="text-gray-400 hover:text-red-500 transition-all duration-200 hover:scale-110 p-2 rounded-md hover:bg-red-50"
                          title="Delete client"
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
                      )}
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
