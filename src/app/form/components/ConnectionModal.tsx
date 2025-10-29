'use client';

import { Client, Instrument, ClientInstrument } from '@/types';
import { formatClientName, formatInstrumentName } from '../utils';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    clientId: string,
    itemId: string,
    relationshipType: ClientInstrument['relationship_type'],
    notes: string
  ) => Promise<void>;
  clients: Client[];
  items: Instrument[];
  selectedClient: string;
  selectedInstrument: string;
  relationshipType: ClientInstrument['relationship_type'];
  connectionNotes: string;
  onClientChange: (clientId: string) => void;
  onInstrumentChange: (itemId: string) => void;
  onRelationshipTypeChange: (
    type: ClientInstrument['relationship_type']
  ) => void;
  onNotesChange: (notes: string) => void;
  clientSearchTerm: string;
  onClientSearchChange: (term: string) => void;
  instrumentSearchTerm: string;
  onInstrumentSearchChange: (term: string) => void;
  submitting: boolean;
}

export default function ConnectionModal({
  isOpen,
  onClose,
  onSubmit,
  clients,
  items,
  selectedClient,
  selectedInstrument,
  relationshipType,
  connectionNotes,
  onClientChange,
  onInstrumentChange,
  onRelationshipTypeChange,
  onNotesChange,
  clientSearchTerm,
  onClientSearchChange,
  instrumentSearchTerm,
  onInstrumentSearchChange,
  submitting,
}: ConnectionModalProps) {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !selectedInstrument) return;

    try {
      await onSubmit(
        selectedClient,
        selectedInstrument,
        relationshipType,
        connectionNotes
      );
      onClose();
    } catch (error) {
      console.error('Error creating connection:', error);
    }
  };

  const filteredClients = clients.filter(
    client =>
      clientSearchTerm === '' ||
      formatClientName(client)
        .toLowerCase()
        .includes(clientSearchTerm.toLowerCase())
  );

  const filteredItems = items.filter(
    item =>
      instrumentSearchTerm === '' ||
      formatInstrumentName(item)
        .toLowerCase()
        .includes(instrumentSearchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-gray-900 bg-opacity-20 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-modal-title"
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3
              id="connection-modal-title"
              className="text-lg font-medium text-gray-900"
            >
              Create New Connection
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close modal"
            >
              <svg
                className="w-6 h-6"
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Client Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Client
            </label>
            <input
              type="text"
              placeholder="Search clients..."
              value={clientSearchTerm}
              onChange={e => onClientSearchChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
            <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md">
              {filteredClients.map(client => (
                <div
                  key={client.id}
                  className={`p-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                    selectedClient === client.id ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => onClientChange(client.id)}
                >
                  <div className="font-medium text-gray-900">
                    {formatClientName(client)}
                  </div>
                  <div className="text-sm text-gray-500">{client.email}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Instrument Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Instrument
            </label>
            <input
              type="text"
              placeholder="Search instruments..."
              value={instrumentSearchTerm}
              onChange={e => onInstrumentSearchChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
            <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md">
              {filteredItems.map(item => (
                <div
                  key={item.id}
                  className={`p-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                    selectedInstrument === item.id ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => onInstrumentChange(item.id)}
                >
                  <div className="font-medium text-gray-900">
                    {formatInstrumentName(item)}
                  </div>
                  <div className="text-sm text-gray-500">Year: {item.year}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Relationship Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Relationship Type
            </label>
            <select
              value={relationshipType}
              onChange={e =>
                onRelationshipTypeChange(
                  e.target.value as ClientInstrument['relationship_type']
                )
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Interested">Interested</option>
              <option value="Booked">Booked</option>
              <option value="Sold">Sold</option>
              <option value="Owned">Owned</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={connectionNotes}
              onChange={e => onNotesChange(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Add any notes about this connection..."
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedClient || !selectedInstrument || submitting}
              aria-busy={submitting}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating...' : 'Create Connection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
