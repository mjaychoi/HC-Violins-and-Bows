import { useState, useEffect } from 'react';
import {
  ClientInstrument,
  Client,
  Instrument,
  RelationshipType,
} from '@/types';
import { EDITABLE_RELATIONSHIP_TYPES } from '../utils/connectionGrouping';
import {
  formatClientName,
  formatInstrumentName,
} from '../utils/connectionUtils';

interface EditConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    connectionId: string,
    updates: Partial<{
      relationshipType: RelationshipType;
      notes: string;
    }>
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
  // FIXED: Use RelationshipType instead of hardcoded union
  const [relationshipType, setRelationshipType] =
    useState<RelationshipType>('Interested');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Initialize form when connection changes
  useEffect(() => {
    if (connection) {
      setRelationshipType(connection.relationship_type);
      setNotes(connection.notes || '');
    }
  }, [connection]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connection) return;

    // Only submit fields the user actually changed from what this modal
    // loaded. `connection` stays referentially stable for the lifetime of
    // this open modal (see useConnectionEdit), so this diff is against the
    // values shown to the user, not a re-fetched copy. Sending an untouched
    // field back unconditionally would let this save silently overwrite a
    // change someone else made to that field while the modal was open.
    const updates: Partial<{
      relationshipType: RelationshipType;
      notes: string;
    }> = {};
    if (relationshipType !== connection.relationship_type) {
      updates.relationshipType = relationshipType;
    }
    if (notes !== (connection.notes || '')) {
      updates.notes = notes;
    }

    // Still submit (even with an empty diff) rather than special-casing a
    // silent close: Save Changes should always go through the same submit
    // path so loading/error/close behavior stays consistent regardless of
    // whether anything actually changed. An empty update is a harmless
    // no-op for the API/RPC.
    setSubmitting(true);
    try {
      await onSave(connection.id, updates);
      // Parent closes the modal only after a confirmed server result (e.g. valid updated row).
      // Do not call onClose here: onSave may resolve with soft-failure semantics at the data layer.
    } catch {
      // Error is handled by parent component's error handler
      // Don't close modal on error - let user see the error and retry
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !connection) return null;

  // F7: Sold is only ever reached via the sales workflow, and
  // update_connection_atomic rejects any transition to/from Sold. The
  // general editor must display it read-only rather than offering a
  // (rejected) transition.
  const isSold = connection.relationship_type === 'Sold';

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
              <strong>Instrument:</strong>{' '}
              {formatInstrumentName(connection.instrument)}
            </div>
            <div className="text-sm text-gray-600">
              <strong>Client:</strong> {formatClientName(connection.client)}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Relationship Type */}
            <div>
              <label
                htmlFor="edit-connection-relationship-type"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Relationship Type
              </label>
              {isSold ? (
                <div>
                  <span
                    id="edit-connection-relationship-type"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium"
                  >
                    Sold
                  </span>
                  <p className="text-xs text-gray-500 mt-2">
                    Sold connections cannot be changed here. Use the sales
                    refund/adjustment workflow to modify a completed sale.
                  </p>
                </div>
              ) : (
                <select
                  id="edit-connection-relationship-type"
                  value={relationshipType}
                  onChange={e =>
                    setRelationshipType(e.target.value as RelationshipType)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {EDITABLE_RELATIONSHIP_TYPES.map(type => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Notes */}
            <div>
              <label
                htmlFor="edit-connection-notes"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Notes
              </label>
              <textarea
                id="edit-connection-notes"
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
                {isSold ? 'Close' : 'Cancel'}
              </button>
              {!isSold && (
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-3 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
