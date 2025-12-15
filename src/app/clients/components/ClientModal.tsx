'use client';
import { useMemo, useRef } from 'react';
import Link from 'next/link';
import { Client, Instrument, ClientInstrument } from '@/types';
import {
  getTagColor,
  sortTags,
  formatClientName,
  formatClientContact,
} from '../utils';
import { useOutsideClose } from '@/hooks/useOutsideClose';
import ClientTagSelector from './ClientTagSelector';
import InterestSelector from './InterestSelector';
import { ClientRelationshipType, ClientViewFormData } from '../types';
import ContactLog from './ContactLog';
import FollowUpButton from './FollowUpButton';
import { useContactLogs } from '../hooks/useContactLogs';
import { useClientsContactInfo } from '../hooks/useClientsContactInfo';
import dynamic from 'next/dynamic';

const MessageComposer = dynamic(
  () => import('@/components/messages/MessageComposer'),
  { ssr: false }
);

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (clientData: Partial<Client>) => Promise<void>;
  onDelete: () => void;
  onCancel: () => void;
  submitting: boolean;
  instrumentRelationships: ClientInstrument[];
  onAddInstrument: (
    instrumentId: string,
    relationshipType: ClientRelationshipType
  ) => Promise<void>;
  onRemoveInstrument: (relationshipId: string) => Promise<void>;
  searchResults: Instrument[];
  isSearchingInstruments: boolean;
  showInstrumentSearch: boolean;
  onToggleInstrumentSearch: () => void;
  instrumentSearchTerm: string;
  onInstrumentSearchTermChange: (term: string) => void;
  viewFormData: ClientViewFormData;
  showInterestDropdown: boolean;
  onViewInputChange: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => void;
  onUpdateViewFormData: (updates: Partial<ClientViewFormData>) => void;
}

export default function ClientModal({
  isOpen,
  onClose,
  client,
  isEditing,
  onEdit,
  onSave,
  onDelete,
  onCancel,
  submitting,
  instrumentRelationships,
  onAddInstrument,
  onRemoveInstrument,
  searchResults,
  isSearchingInstruments,
  showInstrumentSearch,
  onToggleInstrumentSearch,
  instrumentSearchTerm,
  onInstrumentSearchTermChange,
  viewFormData,
  showInterestDropdown,
  onViewInputChange,
  onUpdateViewFormData,
}: ClientModalProps) {
  // Close modal with ESC key and outside click
  const modalRef = useRef<HTMLDivElement>(null);
  useOutsideClose(modalRef, {
    isOpen,
    onClose,
  });

  const filteredInstrumentRelationships = useMemo(
    () =>
      instrumentRelationships.filter(
        rel => rel.client_id === client?.id && rel.instrument_id
      ),
    [instrumentRelationships, client?.id]
  );

  // Contact logs hook
  const {
    contactLogs,
    submitting: contactLogsSubmitting,
    addContact,
    updateContact,
    deleteContact,
    setFollowUp,
  } = useContactLogs({
    clientId: client?.id,
    autoFetch: isOpen && !!client?.id,
  });

  // Contact info for summary
  const { getContactInfo } = useClientsContactInfo({
    clientIds: client?.id ? [client.id] : [],
    enabled: isOpen && !!client?.id,
  });

  const contactInfo = client?.id ? getContactInfo(client.id) : null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(viewFormData);
  };

  if (!isOpen || !client) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-modal-title"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3
              id="client-modal-title"
              className="text-lg font-medium text-gray-900"
            >
              {isEditing ? 'Edit Client' : 'Client Details'}
            </h3>
            <button
              onClick={onClose}
              aria-label="Close modal"
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
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isEditing ? (
            <form onSubmit={handleSave} className="p-6 space-y-5 text-gray-900">
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    value={viewFormData.last_name}
                    onChange={onViewInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Enter last name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    value={viewFormData.first_name}
                    onChange={onViewInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Enter first name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    name="contact_number"
                    value={viewFormData.contact_number}
                    onChange={onViewInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Enter contact number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={viewFormData.email}
                    onChange={onViewInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Enter email address"
                  />
                </div>

                {/* Tags Section */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags
                  </label>
                  <ClientTagSelector
                    selectedTags={viewFormData.tags}
                    onChange={next => onUpdateViewFormData({ tags: next })}
                  />
                </div>

                {/* Interest Section - Conditional */}
                {showInterestDropdown && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Interest
                    </label>
                    <InterestSelector
                      value={viewFormData.interest}
                      onChange={value =>
                        onUpdateViewFormData({ interest: value })
                      }
                      name="interest"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Note
                  </label>
                  <textarea
                    name="note"
                    value={viewFormData.note}
                    onChange={onViewInputChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    placeholder="Enter any additional notes"
                  />
                </div>
              </div>

              {/* Instrument Connections - Edit Mode */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-medium text-gray-700">
                    Instrument Connections
                  </h4>
                  <button
                    type="button"
                    onClick={onToggleInstrumentSearch}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    {showInstrumentSearch ? 'Hide Search' : 'Add Instrument'}
                  </button>
                </div>

                {showInstrumentSearch && (
                  <div className="mb-4 space-y-4">
                    <input
                      type="text"
                      placeholder="Search instruments..."
                      value={instrumentSearchTerm}
                      onChange={e => {
                        onInstrumentSearchTermChange(e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />

                    {isSearchingInstruments && (
                      <div className="text-center py-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto"></div>
                      </div>
                    )}

                    {searchResults.length > 0 && (
                      <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md">
                        {searchResults.map(instrument => (
                          <div
                            key={instrument.id}
                            className="p-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="text-sm font-medium">
                                  {instrument.maker}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {instrument.type} ({instrument.year})
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  onAddInstrument(instrument.id, 'Interested')
                                }
                                className="text-blue-600 hover:text-blue-800 text-sm"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {filteredInstrumentRelationships.length > 0 ? (
                  <div className="space-y-4">
                    {filteredInstrumentRelationships.map(relationship => (
                      <div
                        key={relationship.id}
                        className="flex justify-between items-center bg-gray-50 p-3 rounded-md"
                      >
                        <div>
                          <div className="text-sm font-medium">
                            {relationship.instrument?.maker} -{' '}
                            {relationship.instrument?.type}
                          </div>
                          <div className="text-xs text-gray-500">
                            {relationship.instrument?.year} •{' '}
                            {relationship.relationship_type}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveInstrument(relationship.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">
                    No instrument connections
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-gray-200 flex space-x-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="p-6 space-y-6">
              {/* Client Info */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Name</h4>
                  <p className="text-lg text-gray-900">
                    {formatClientName(client)}
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-500">Contact</h4>
                  <p className="text-gray-900">{formatClientContact(client)}</p>
                </div>

                {/* Message Composer - Moved to top for visibility */}
                {client && (
                  <div className="pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">
                      Send Message
                    </h4>
                    <MessageComposer
                      client={client}
                      instrument={
                        filteredInstrumentRelationships[0]?.instrument || null
                      }
                    />
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-medium text-gray-500">Tags</h4>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {sortTags([...(client.tags ?? [])]).map(tag => (
                      <span
                        key={tag}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTagColor(tag)}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {client.interest && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">
                      Interest
                    </h4>
                    <p className="text-gray-900">{client.interest}</p>
                  </div>
                )}

                {client.note && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Note</h4>
                    <p className="text-gray-900">{client.note}</p>
                  </div>
                )}
              </div>

              {/* Contact Summary */}
              {client && contactInfo && (
                <div className="pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">
                    Contact Summary
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Recent Contact
                      </div>
                      <div className="text-sm font-semibold text-gray-900">
                        {contactInfo.lastContactDateDisplay ? (
                          <>
                            {contactInfo.lastContactDateDisplay}
                            {contactInfo.daysSinceLastContact !== null && (
                              <span className="ml-2 text-xs font-normal text-gray-500">
                                ({contactInfo.daysSinceLastContact} days ago)
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-400">None</span>
                        )}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Next Contact
                      </div>
                      <div className="text-sm font-semibold text-gray-900">
                        {contactInfo.nextFollowUpDateDisplay ? (
                          <span
                            className={
                              contactInfo.isOverdue
                                ? 'text-red-600'
                                : contactInfo.daysUntilFollowUp !== null &&
                                    contactInfo.daysUntilFollowUp <= 3
                                  ? 'text-amber-600'
                                  : ''
                            }
                          >
                            {contactInfo.nextFollowUpDateDisplay}
                            {contactInfo.daysUntilFollowUp !== null && (
                              <span className="ml-2 text-xs font-normal text-gray-500">
                                (
                                {contactInfo.daysUntilFollowUp < 0
                                  ? `${Math.abs(contactInfo.daysUntilFollowUp)} days overdue`
                                  : contactInfo.daysUntilFollowUp === 0
                                    ? 'Today'
                                    : `${contactInfo.daysUntilFollowUp} days later`}
                                )
                              </span>
                            )}
                            {contactInfo.isOverdue && (
                              <span className="ml-2 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                overdue
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-400">None</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Follow-up Quick Actions */}
              {client && (
                <div className="pt-4 border-t border-gray-200">
                  <FollowUpButton
                    clientId={client.id}
                    onSetFollowUp={setFollowUp}
                    loading={contactLogsSubmitting}
                    variant="default"
                  />
                </div>
              )}

              {/* Contact Logs */}
              {client && (
                <div className="pt-4 border-t border-gray-200">
                  <ContactLog
                    clientId={client.id}
                    contactLogs={contactLogs}
                    onAddContact={addContact}
                    onUpdateContact={updateContact}
                    onDeleteContact={deleteContact}
                    loading={contactLogsSubmitting}
                  />
                </div>
              )}

              {/* Instrument Connections */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-medium text-gray-500">
                    Instrument Connections
                  </h4>
                  <button
                    onClick={onToggleInstrumentSearch}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    {showInstrumentSearch ? 'Hide Search' : 'Add Instrument'}
                  </button>
                </div>

                {showInstrumentSearch && (
                  <div className="mb-4 space-y-4">
                    <input
                      type="text"
                      placeholder="Search instruments..."
                      value={instrumentSearchTerm}
                      onChange={e => {
                        onInstrumentSearchTermChange(e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />

                    {isSearchingInstruments && (
                      <div className="text-center py-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto"></div>
                      </div>
                    )}

                    {searchResults.length > 0 && (
                      <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md">
                        {searchResults.map(instrument => (
                          <div
                            key={instrument.id}
                            className="p-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="text-sm font-medium">
                                  {instrument.maker}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {instrument.type} ({instrument.year})
                                </div>
                              </div>
                              <button
                                onClick={() =>
                                  onAddInstrument(instrument.id, 'Interested')
                                }
                                className="text-blue-600 hover:text-blue-800 text-sm"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {filteredInstrumentRelationships.length > 0 ? (
                  <div className="space-y-4">
                    {filteredInstrumentRelationships.map(relationship => (
                      <div
                        key={relationship.id}
                        className="flex justify-between items-center bg-gray-50 p-3 rounded-md"
                      >
                        <div className="flex-1">
                          {relationship.instrument_id ? (
                            <Link
                              href={`/dashboard?instrumentId=${relationship.instrument_id}`}
                              onClick={e => e.stopPropagation()}
                              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors text-left block"
                              title="View instrument details"
                            >
                              {relationship.instrument?.maker} -{' '}
                              {relationship.instrument?.type}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-gray-900">
                              {relationship.instrument?.maker} -{' '}
                              {relationship.instrument?.type}
                            </span>
                          )}
                          <div className="text-xs text-gray-500">
                            {relationship.instrument?.year} •{' '}
                            {relationship.relationship_type}
                          </div>
                        </div>
                        <button
                          onClick={() => onRemoveInstrument(relationship.id)}
                          className="text-red-600 hover:text-red-800 text-sm ml-2"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">
                    No instrument connections
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isEditing && (
          <div className="p-6 border-t border-gray-200">
            <div className="flex space-x-3">
              <button
                onClick={onEdit}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Edit
              </button>
              <button
                onClick={onDelete}
                className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
