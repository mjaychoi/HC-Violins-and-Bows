'use client';

import { useState, useRef } from 'react';
import { Client, RelationshipType } from '@/types';
import { useOutsideClose } from '@/hooks/useOutsideClose';
import Button from '@/components/common/Button';
import { modalStyles } from '@/components/common/modalStyles';
import { ModalHeader } from '@/components/common/ModalHeader';

interface InstrumentFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: {
    maker: string;
    name: string;
    year: string;
  }) => Promise<void>;
  submitting: boolean;
}

export default function InstrumentForm({
  isOpen,
  onClose,
  onSubmit,
  submitting,
}: InstrumentFormProps) {
  const [formData, setFormData] = useState({
    maker: '',
    name: '',
    year: '',
  });

  // Client search states
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [isSearchingClients, setIsSearchingClients] = useState(false);
  const [selectedClients, setSelectedClients] = useState<
    Array<{ client: Client; relationshipType: RelationshipType }>
  >([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
    // Reset form
    setFormData({ maker: '', name: '', year: '' });
    setSelectedClients([]);
    setShowClientSearch(false);
    setClientSearchTerm('');
    setSearchResults([]);
  };

  // Close modal with ESC key and outside click
  const modalRef = useRef<HTMLDivElement>(null);
  useOutsideClose(modalRef, {
    isOpen,
    onClose,
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const searchClients = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearchingClients(true);
    try {
      // Use API route instead of direct Supabase client to reduce bundle size
      const params = new URLSearchParams({
        search: searchTerm,
        limit: '10',
      });
      const response = await fetch(`/api/clients?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to search clients: ${response.statusText}`);
      }
      const result = await response.json();
      const selectedIds = new Set(selectedClients.map(sc => sc.client.id));
      const filtered = (result.data || []).filter(
        (c: Client) => !selectedIds.has(c.id)
      );
      setSearchResults(filtered);
    } catch {
      // Error is handled silently - search results will be empty
      setSearchResults([]);
    } finally {
      setIsSearchingClients(false);
    }
  };

  const addClient = (
    client: Client,
    relationshipType: RelationshipType = 'Interested'
  ) => {
    setSelectedClients(prev => {
      if (prev.some(p => p.client.id === client.id)) return prev;
      return [...prev, { client, relationshipType }];
    });
    setShowClientSearch(false);
    setClientSearchTerm('');
    setSearchResults([]);
  };

  const removeClient = (clientId: string) => {
    setSelectedClients(prev =>
      prev.filter(item => item.client.id !== clientId)
    );
  };

  if (!isOpen) return null;

  return (
    <div
      className={modalStyles.overlay}
      onClick={e => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className={modalStyles.container}
        role="dialog"
        aria-modal="true"
        aria-labelledby="instrument-form-title"
      >
        <ModalHeader
          title="Add New Instrument"
          icon="instrument"
          onClose={onClose}
          titleId="instrument-form-title"
        />

        <form onSubmit={handleSubmit} className={`${modalStyles.formBody} space-y-4`}>
            <div>
              <label
                htmlFor="maker"
                className="block text-sm font-medium text-gray-700"
              >
                Maker
              </label>
              <input
                type="text"
                id="maker"
                name="maker"
                value={formData.maker}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Gibson, Fender, Yamaha"
              />
            </div>

            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700"
              >
                Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Les Paul Standard, Grand Piano, Stradivarius Violin"
              />
            </div>

            <div>
              <label
                htmlFor="year"
                className="block text-sm font-medium text-gray-700"
              >
                Year
              </label>
              <input
                type="number"
                id="year"
                name="year"
                value={formData.year}
                onChange={handleInputChange}
                required
                min="1900"
                max={new Date().getFullYear()}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 2020"
              />
            </div>

            {/* Client Connections Section */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex justify-between items-center mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  Connect Clients (Optional)
                </label>
                <Button
                  type="button"
                  onClick={() => setShowClientSearch(true)}
                  variant="primary"
                  size="sm"
                >
                  Add Client
                </Button>
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
                        <h5 className="text-xs font-medium text-gray-600">
                          Results:
                        </h5>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {searchResults
                            .filter(
                              client =>
                                !selectedClients.some(
                                  sc => sc.client.id === client.id
                                )
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
                          onChange={e => {
                            setSelectedClients(prev =>
                              prev.map(selected =>
                                selected.client.id === item.client.id
                                  ? {
                                      ...selected,
                                      relationshipType: e.target
                                        .value as RelationshipType,
                                    }
                                  : selected
                              )
                            );
                          }}
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

            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" onClick={onClose} variant="secondary">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                variant="primary"
                loading={submitting}
              >
                {submitting ? 'Adding...' : 'Add Instrument'}
              </Button>
            </div>
          </form>
        </div>
      </div>
  );
}
