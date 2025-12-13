import { useState, useEffect } from 'react';
import { ClientInstrument, Client, Instrument } from '@/types';

interface EditConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    connectionId: string,
    updates: {
      relationshipType: 'Booked' | 'Sold' | 'Interested' | 'Owned';
      notes: string;
    }
  ) => Promise<void>;
  connection: ClientInstrument | null;
  clients?: Client[];
  items?: Instrument[];
}

export const EditConnectionModal = ({
  isOpen,
  onClose,
  onSave,
  connection,
}: EditConnectionModalProps) => {
  const [relationshipType, setRelationshipType] = useState<
    'Booked' | 'Sold' | 'Interested' | 'Owned'
  >('Interested');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Initialize form when connection changes
  useEffect(() => {
    if (connection) {
      setRelationshipType(
        connection.relationship_type as
          | 'Booked'
          | 'Sold'
          | 'Interested'
          | 'Owned'
      );
      setNotes(connection.notes || '');
    }
  }, [connection]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connection) return;

    setSubmitting(true);
    try {
      await onSave(connection.id, {
        relationshipType,
        notes,
      });
      // Only close modal on success - errors are handled by parent
      onClose();
    } catch {
      // Error is handled by parent component's error handler
      // Don't close modal on error - let user see the error and retry
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !connection) return null;

  return (
    <div
      className="fixed inset-0 bg-gray-900 bg-opacity-20 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Edit Connection
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
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
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Connection Info Display */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-2">
              <strong>Instrument:</strong> {connection.instrument?.maker}{' '}
              {connection.instrument?.type}
            </div>
            <div className="text-sm text-gray-600">
              <strong>Client:</strong> {connection.client?.first_name}{' '}
              {connection.client?.last_name}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Relationship Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Relationship Type
              </label>
              <select
                value={relationshipType}
                onChange={e =>
                  setRelationshipType(
                    e.target.value as 'Booked' | 'Sold' | 'Interested' | 'Owned'
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                Notes
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Add any additional notes..."
              />
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-3 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
