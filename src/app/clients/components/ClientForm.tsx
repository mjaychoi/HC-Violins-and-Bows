'use client';
import { useState, useEffect, useRef } from 'react';
import { Client, Instrument, ClientInstrument } from '@/types';
import { supabase } from '@/lib/supabase';
import { useDataState } from '@/hooks/useDataState';
import { useDataFetching } from '@/hooks/useDataFetching';
import { useFormState } from '@/hooks/useFormState';
import { logError } from '@/utils/logger';
import { classNames } from '@/utils/classNames';
import { clientValidation, validateForm } from '@/utils/validationUtils';
import { generateClientNumber } from '@/utils/uniqueNumberGenerator';
import { useUnifiedClients } from '@/hooks/useUnifiedData';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';

interface ClientFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: Omit<Client, 'id' | 'created_at'>) => Promise<void>;
  submitting: boolean;
}

export default function ClientForm({
  isOpen,
  onClose,
  onSubmit,
  submitting,
}: ClientFormProps) {
  const { clients } = useUnifiedClients();

  const initialFormData = {
    last_name: '',
    first_name: '',
    contact_number: '',
    email: '',
    tags: [] as string[],
    interest: '',
    note: '',
    client_number: '',
  };

  const {
    formData,
    updateField,
    // updateFields,
    resetForm,
  } = useFormState(initialFormData);

  const [showInterestDropdown, setShowInterestDropdown] = useState(false);

  // New client instrument connection states using useDataState
  const [showInstrumentSearchForNew, setShowInstrumentSearchForNew] =
    useState(false);
  const [instrumentSearchTermForNew, setInstrumentSearchTermForNew] =
    useState('');
  const {
    data: searchResultsForNew,
    setItems: setSearchResultsForNew,
    clearData: clearSearchResults,
  } = useDataState<Instrument>(item => item.id, []);
  const [isSearchingInstrumentsForNew, setIsSearchingInstrumentsForNew] =
    useState(false);
  const {
    data: selectedInstrumentsForNew,
    addItem: addSelectedInstrument,
    removeItem: removeSelectedInstrument,
    clearData: clearSelectedInstruments,
  } = useDataState<{
    instrument: Instrument;
    relationshipType: ClientInstrument['relationship_type'];
  }>(item => item.instrument.id, []);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      updateField(name as keyof typeof formData, checked.toString());
    } else {
      updateField(name as keyof typeof formData, value as string);
    }
  };

  const addTag = (tag: string) => {
    if (!formData.tags.includes(tag)) {
      updateField('tags', [...formData.tags, tag]);
    }
  };

  const removeTag = (tag: string) => {
    updateField(
      'tags',
      formData.tags.filter(t => t !== tag)
    );
  };

  const addInstrumentForNew = (
    instrument: Instrument,
    relationshipType: ClientInstrument['relationship_type'] = 'Interested'
  ) => {
    addSelectedInstrument({ instrument, relationshipType });
    setShowInstrumentSearchForNew(false);
    setInstrumentSearchTermForNew('');
    clearSearchResults();
  };

  const removeInstrumentForNew = (instrumentId: string) => {
    removeSelectedInstrument(instrumentId);
  };

  // Use useDataFetching for instrument search with parameter support
  const { fetchData: searchInstruments } = useDataFetching<Instrument, string>(
    async (term?: string) => {
      if (!term || term.length < 2) return [];

      const { data, error } = await supabase
        .from('instruments')
        .select('*')
        .or(`maker.ilike.%${term}%,type.ilike.%${term}%`)
        .limit(10);

      if (error) throw error;
      // Filter out instruments already selected to prevent duplicates
      const selectedIds = new Set(
        selectedInstrumentsForNew.map(si => si.instrument.id)
      );
      return (data || []).filter(
        (inst: Instrument) => !selectedIds.has(inst.id)
      );
    },
    'Search instruments'
  );

  const lastReqIdRef = useRef(0);
  const searchInstrumentsForNew = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      clearSearchResults();
      return;
    }

    setIsSearchingInstrumentsForNew(true);
    const reqId = ++lastReqIdRef.current;
    try {
      const results = await searchInstruments(searchTerm);
      if (reqId === lastReqIdRef.current && results) {
        setSearchResultsForNew(results);
      }
    } catch (error) {
      logError('Error searching instruments', error, 'ClientForm', {
        searchTerm: instrumentSearchTermForNew,
        action: 'searchInstruments',
      });
      if (reqId === lastReqIdRef.current) {
        clearSearchResults();
      }
    } finally {
      if (reqId === lastReqIdRef.current) {
        setIsSearchingInstrumentsForNew(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form data
    const validationSchema = {
      first_name: clientValidation.firstName,
      last_name: clientValidation.lastName,
      email: clientValidation.email,
      contact_number: clientValidation.phone,
    };

    const validation = validateForm(formData, validationSchema);
    if (!validation.isValid) {
      // Set validation errors
      Object.entries(validation.errors).forEach(([,]) => {
        // setFieldError(field as keyof typeof formData, error)
      });
      return;
    }

    await onSubmit(formData);

    // Reset form
    resetForm();
    setShowInterestDropdown(false);
    clearSelectedInstruments();
    setShowInstrumentSearchForNew(false);
    setInstrumentSearchTermForNew('');
    clearSearchResults();
    onClose();
  };

  // Update interest dropdown visibility based on tags
  useEffect(() => {
    const shouldShowInterest = formData.tags.some(tag =>
      ['Musician', 'Dealer', 'Collector'].includes(tag)
    );
    setShowInterestDropdown(shouldShowInterest);
  }, [formData.tags]);

  // 자동으로 client number 생성
  useEffect(() => {
    if (isOpen && !formData.client_number) {
      const existingNumbers = clients
        .map(c => c.client_number)
        .filter((num): num is string => num !== null && num !== undefined);
      const autoClientNumber = generateClientNumber(existingNumbers);
      updateField('client_number', autoClientNumber);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, clients]);

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-40 border-l border-gray-200">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">
              Add New Client
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
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
        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-gray-900">
            <div className="space-y-4">
              <Input
                label="Last Name"
                name="last_name"
                value={formData.last_name}
                onChange={handleInputChange}
                required
                placeholder="Enter last name"
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleInputChange}
                  required
                  className={classNames.input}
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
                  value={formData.contact_number}
                  onChange={handleInputChange}
                  className={classNames.input}
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
                  value={formData.email}
                  onChange={handleInputChange}
                  className={classNames.input}
                  placeholder="Enter email address"
                />
              </div>

              {/* Tags Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags
                </label>
                <div className="space-y-2">
                  {['Owner', 'Musician', 'Dealer', 'Collector', 'Other'].map(
                    tag => (
                      <label key={tag} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.tags.includes(tag)}
                          onChange={e =>
                            e.target.checked ? addTag(tag) : removeTag(tag)
                          }
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">
                          {tag}
                        </span>
                      </label>
                    )
                  )}
                </div>
              </div>

              {/* Interest Section - Conditional */}
              {showInterestDropdown && (
                <div>
                  <label
                    htmlFor="interest"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Interest
                  </label>
                  <select
                    id="interest"
                    name="interest"
                    value={formData.interest}
                    onChange={handleInputChange}
                    className={classNames.input}
                  >
                    <option value="">Select interest level</option>
                    <option value="Active">Active</option>
                    <option value="Passive">Passive</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Number
                  <span className="ml-2 text-xs text-gray-500">
                    (자동 생성)
                  </span>
                </label>
                <input
                  type="text"
                  name="client_number"
                  value={formData.client_number}
                  onChange={handleInputChange}
                  disabled
                  className={
                    classNames.input + ' bg-gray-100 cursor-not-allowed'
                  }
                  placeholder="자동 생성됨"
                />
                <p className="mt-1 text-xs text-gray-500">
                  클라이언트 추가 시 자동으로 생성됩니다
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Note
                </label>
                <textarea
                  name="note"
                  value={formData.note}
                  onChange={handleInputChange}
                  rows={3}
                  className={classNames.input}
                  placeholder="Enter any additional notes"
                />
              </div>

              {/* Instrument Connection Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Connect Instruments (Optional)
                </label>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() =>
                      setShowInstrumentSearchForNew(!showInstrumentSearchForNew)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {showInstrumentSearchForNew
                      ? 'Hide Instrument Search'
                      : 'Search for Instruments'}
                  </button>

                  {showInstrumentSearchForNew && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Search instruments..."
                        value={instrumentSearchTermForNew}
                        onChange={e => {
                          setInstrumentSearchTermForNew(e.target.value);
                          searchInstrumentsForNew(e.target.value);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />

                      {isSearchingInstrumentsForNew && (
                        <div className="text-center py-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto"></div>
                        </div>
                      )}

                      {searchResultsForNew.length > 0 && (
                        <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md">
                          {searchResultsForNew.map(instrument => (
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
                                    addInstrumentForNew(instrument)
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

                      {selectedInstrumentsForNew.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-gray-700">
                            Selected Instruments:
                          </div>
                          {selectedInstrumentsForNew.map(item => (
                            <div
                              key={item.instrument.id}
                              className="flex justify-between items-center bg-gray-50 p-2 rounded text-sm"
                            >
                              <span>
                                {item.instrument.maker} - {item.instrument.type}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  removeInstrumentForNew(item.instrument.id)
                                }
                                className="text-red-600 hover:text-red-800"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4 border-t border-gray-200">
              <Button type="submit" loading={submitting} className="w-full">
                Add Client
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
