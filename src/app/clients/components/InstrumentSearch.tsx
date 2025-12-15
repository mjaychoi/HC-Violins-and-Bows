'use client';
// src/app/clients/components/InstrumentSearch.tsx
import { Instrument } from '@/types';
import { EmptyState } from '@/components/common';

interface InstrumentSearchProps {
  isOpen: boolean;
  onClose: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onSearch: (searchTerm: string) => void;
  searchResults: Instrument[];
  isSearching: boolean;
  onAddInstrument: (instrument: Instrument, relationshipType: string) => void;
  selectedInstruments: Array<{
    instrument: Instrument;
    relationshipType: string;
  }>;
  onRemoveInstrument: (instrumentId: string) => void;
}

export default function InstrumentSearch({
  isOpen,
  onClose,
  searchTerm,
  onSearchChange,
  onSearch,
  searchResults,
  isSearching,
  onAddInstrument,
  selectedInstruments,
  onRemoveInstrument,
}: InstrumentSearchProps) {
  const handleSearchChange = (value: string) => {
    onSearchChange(value);
    onSearch(value);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">
              Search Instruments
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
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="p-6 border-b border-gray-200">
          <input
            type="text"
            placeholder="Search instruments by maker or name..."
            value={searchTerm}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Search Results */}
        <div className="flex-1 overflow-y-auto p-6">
          {isSearching && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Searching instruments...</p>
            </div>
          )}

          {!isSearching && searchResults.length === 0 && searchTerm && (
            <EmptyState
              title="No instruments found"
              description="Try refining your search terms or check the spelling."
              className="shadow-none border-none"
            />
          )}

          {!isSearching && searchResults.length > 0 && (
            <div className="space-y-4">
              {searchResults.map(instrument => (
                <div
                  key={instrument.id}
                  className="flex justify-between items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="text-lg font-medium text-gray-900">
                      {instrument.maker}
                    </div>
                    <div className="text-sm text-gray-600">
                      {instrument.type}
                    </div>
                    <div className="text-xs text-gray-500">
                      Year: {instrument.year}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <select
                      value=""
                      onChange={e => {
                        if (!e.target.value) return;
                        onAddInstrument(instrument, e.target.value);
                        e.currentTarget.value = '';
                      }}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      <option value="" disabled>
                        Select relationship
                      </option>
                      <option value="Interested">Interested</option>
                      <option value="Sold">Sold</option>
                      <option value="Booked">Booked</option>
                      <option value="Owned">Owned</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isSearching && !searchTerm && (
            <EmptyState
              title="Search instruments"
              description="Start typing to search by maker or name."
              className="shadow-none border-none"
            />
          )}
        </div>

        {/* Selected Instruments */}
        {selectedInstruments.length > 0 && (
          <div className="border-t border-gray-200 p-6">
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              Selected Instruments
            </h4>
            <div className="space-y-4">
              {selectedInstruments.map(item => (
                <div
                  key={item.instrument.id}
                  className="flex justify-between items-center bg-gray-50 p-3 rounded-md"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {item.instrument.maker} - {item.instrument.type}
                    </div>
                    <div className="text-xs text-gray-500">
                      {item.relationshipType}
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveInstrument(item.instrument.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
