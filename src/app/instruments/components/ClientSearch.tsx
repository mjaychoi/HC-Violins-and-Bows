'use client';

import { useState } from 'react';
import { Client, RelationshipType } from '@/types';
import { supabase } from '@/lib/supabase';

interface ClientSearchProps {
  selectedClients: Array<{
    client: Client;
    relationshipType: RelationshipType;
  }>;
  onClientsChange: (
    clients: Array<{ client: Client; relationshipType: RelationshipType }>
  ) => void;
}

export default function ClientSearch({
  selectedClients,
  onClientsChange,
}: ClientSearchProps) {
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [isSearchingClients, setIsSearchingClients] = useState(false);

  const searchClients = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearchingClients(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .or(`last_name.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%`)
        .limit(10);

      if (error) throw error;
      const selectedIds = new Set(selectedClients.map(sc => sc.client.id));
      const filtered = (data || []).filter(c => !selectedIds.has(c.id));
      setSearchResults(filtered);
    } catch (error) {
      console.error('Error searching clients:', error);
      setSearchResults([]);
    } finally {
      setIsSearchingClients(false);
    }
  };

  const addClient = (
    client: Client,
    relationshipType: RelationshipType = 'Interested'
  ) => {
    const newClients = [...selectedClients, { client, relationshipType }];
    onClientsChange(newClients);
    setShowClientSearch(false);
    setClientSearchTerm('');
    setSearchResults([]);
  };

  const removeClient = (clientId: string) => {
    const newClients = selectedClients.filter(
      item => item.client.id !== clientId
    );
    onClientsChange(newClients);
  };

  const updateClientRelationship = (
    clientId: string,
    relationshipType: RelationshipType
  ) => {
    const newClients = selectedClients.map(selected =>
      selected.client.id === clientId
        ? { ...selected, relationshipType }
        : selected
    );
    onClientsChange(newClients);
  };

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <div className="flex justify-between items-center mb-3">
        <label className="block text-sm font-medium text-gray-700">
          Connect Clients (Optional)
        </label>
        <button
          type="button"
          onClick={() => setShowClientSearch(true)}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Add Client
        </button>
      </div>

      {/* Client Search Section */}
      {showClientSearch && (
        <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-medium text-gray-700">
              Search Clients
            </h4>
            <button
              type="button"
              onClick={() => {
                setShowClientSearch(false);
                setClientSearchTerm('');
                setSearchResults([]);
              }}
              className="text-gray-400 hover:text-gray-600"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <input
                type="text"
                placeholder="Search by first or last name..."
                value={clientSearchTerm}
                onChange={e => {
                  setClientSearchTerm(e.target.value);
                  searchClients(e.target.value);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            {isSearchingClients && (
              <div className="text-center text-gray-500 text-sm">
                Searching...
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-gray-600">Results:</h5>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {searchResults
                    .filter(
                      client =>
                        !selectedClients.some(sc => sc.client.id === client.id)
                    )
                    .map(client => (
                      <div
                        key={client.id}
                        className="p-2 border border-gray-200 rounded-md hover:bg-white cursor-pointer bg-white"
                        onClick={() => addClient(client)}
                      >
                        <div className="font-medium text-gray-900 text-sm">
                          {client.first_name} {client.last_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {client.email} • {client.contact_number}
                        </div>
                        <div className="text-xs text-gray-400">
                          {client.type} • {client.status}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {clientSearchTerm.length >= 2 &&
              searchResults.length === 0 &&
              !isSearchingClients && (
                <div className="text-center text-gray-500 text-sm">
                  No clients found
                </div>
              )}
          </div>
        </div>
      )}

      {/* Selected Clients List */}
      {selectedClients.length > 0 ? (
        <div className="space-y-2">
          {selectedClients.map(item => (
            <div
              key={item.client.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
            >
              <div className="flex-1">
                <div className="font-medium text-gray-900">
                  {item.client.first_name} {item.client.last_name}
                </div>
                <div className="text-sm text-gray-500">
                  {item.client.email} • {item.client.contact_number}
                </div>
                <div className="text-xs text-gray-400">
                  {item.client.type} • {item.client.status}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <select
                  value={item.relationshipType}
                  onChange={e =>
                    updateClientRelationship(
                      item.client.id,
                      e.target.value as RelationshipType
                    )
                  }
                  className="text-xs border border-gray-300 rounded px-2 py-1"
                >
                  <option value="Interested">Interested</option>
                  <option value="Booked">Booked</option>
                  <option value="Sold">Sold</option>
                  <option value="Owned">Owned</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeClient(item.client.id)}
                  className="text-red-500 hover:text-red-700"
                  title="Remove client"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-gray-500 py-4 text-sm">
          No clients connected to this instrument
        </div>
      )}
    </div>
  );
}
