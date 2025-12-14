'use client';

import { Client, Instrument, ClientInstrument } from '@/types';
import { formatClientName, formatInstrumentName } from '../utils';
import { classNames } from '@/utils/classNames';
import { RELATIONSHIP_TYPES } from '../utils/connectionGrouping';

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
      // FIXED: Let parent handle closing - don't call onClose() here
      // Parent (page.tsx) will close modal and reset form after successful creation
      await onSubmit(
        selectedClient,
        selectedInstrument,
        relationshipType,
        connectionNotes
      );
      // Parent handles: setShowConnectionModal(false) and resetConnectionForm()
    } catch {
      // Error is handled by parent component's error handler
      // Don't close modal on error - let user see the error and retry
    }
  };

  // FIXED: Filtering is already done in parent (page.tsx) via useFilterSort
  // Use clients and items directly from parent - no duplicate filtering
  // Parent passes filteredClients and filteredItems which are already filtered

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
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-modal-title"
      >
        {/* Header */}
        <div className="shrink-0 p-6 border-b border-gray-100 bg-blue-50">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg
                  className="w-6 h-6 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
              </div>
              <h3
                id="connection-modal-title"
                className="text-xl font-semibold text-gray-900"
              >
                Create New Connection
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors duration-200"
              aria-label="Close modal"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Form - Scrollable */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-6"
        >
          {/* Client Selection */}
          <div>
            <label className={classNames.formLabel}>Select Client</label>
            <input
              type="text"
              placeholder="Search clients..."
              value={clientSearchTerm}
              onChange={e => onClientSearchChange(e.target.value)}
              className={`${classNames.input} mb-2`}
            />
            <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md">
              {clients.map(client => {
                const isSelected = selectedClient === client.id;
                return (
                  <div
                    key={client.id}
                    className={`p-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${
                      isSelected
                        ? 'bg-blue-50 border-l-4 border-l-blue-500'
                        : 'border-l-4 border-l-transparent hover:bg-gray-50'
                    }`}
                    onClick={() => onClientChange(client.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {formatClientName(client)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {client.email}
                        </div>
                      </div>
                      {isSelected && (
                        <svg
                          className="w-5 h-5 text-blue-500 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Instrument Selection */}
          <div>
            <label className={classNames.formLabel}>Select Instrument</label>
            <input
              type="text"
              placeholder="Search instruments..."
              value={instrumentSearchTerm}
              onChange={e => onInstrumentSearchChange(e.target.value)}
              className={`${classNames.input} mb-2`}
            />
            <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md">
              {items.map(item => {
                const isSelected = selectedInstrument === item.id;
                return (
                  <div
                    key={item.id}
                    className={`p-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${
                      isSelected
                        ? 'bg-blue-50 border-l-4 border-l-blue-500'
                        : 'border-l-4 border-l-transparent hover:bg-gray-50'
                    }`}
                    onClick={() => onInstrumentChange(item.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {formatInstrumentName(item)}
                        </div>
                        <div className="text-sm text-gray-500">
                          Year: {item.year}
                        </div>
                      </div>
                      {isSelected && (
                        <svg
                          className="w-5 h-5 text-blue-500 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Relationship Type */}
          <div>
            <label className={classNames.formLabel}>Relationship Type</label>
            <select
              value={relationshipType}
              onChange={e =>
                onRelationshipTypeChange(
                  e.target.value as ClientInstrument['relationship_type']
                )
              }
              className={classNames.input}
            >
              {RELATIONSHIP_TYPES.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className={classNames.formLabel}>Notes (Optional)</label>
            <textarea
              value={connectionNotes}
              onChange={e => onNotesChange(e.target.value)}
              rows={3}
              className={classNames.input}
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
