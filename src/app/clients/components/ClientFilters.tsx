'use client';
// src/app/clients/components/ClientFilters.tsx

import { useRef, useEffect } from 'react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { FilterState } from '../types';

interface FilterOptions {
  lastNames: string[];
  firstNames: string[];
  contactNumbers: string[];
  emails: string[];
  tags: string[];
  interests: string[];
}

interface ClientFiltersProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  filterOptions: FilterOptions;
  onFilterChange: (category: keyof FilterState, value: string) => void;
}

export default function ClientFilters({
  isOpen,
  onClose,
  filters,
  filterOptions,
  onFilterChange,
}: ClientFiltersProps) {
  const filterPanelRef = useRef<HTMLDivElement>(null);

  // Close filter panel with ESC key
  useEscapeKey(onClose, isOpen);

  // Handle click outside filter panel with shadow DOM support
  useEffect(() => {
    if (!isOpen) return;

    const filterButton = document.querySelector('[data-filter-button]');
    const onPointerDown = (event: MouseEvent) => {
      const path = (event.composedPath?.() ?? []) as Node[];
      if (filterPanelRef.current && path.includes(filterPanelRef.current))
        return;
      if (filterButton && path.includes(filterButton)) return;
      onClose();
    };

    document.addEventListener('mousedown', onPointerDown, { capture: true });
    return () =>
      document.removeEventListener('mousedown', onPointerDown, {
        capture: true,
      });
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={filterPanelRef}
      data-testid="filters-panel"
      role="dialog"
      aria-modal="false"
      className="bg-white border border-gray-200 rounded-lg p-4 shadow-lg"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Last Name Filter */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Last Name
            </h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {filterOptions.lastNames.map(lastName => (
                <label key={lastName} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.last_name.includes(lastName)}
                    onChange={() => onFilterChange('last_name', lastName)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">{lastName}</span>
                </label>
              ))}
            </div>
          </div>

          {/* First Name Filter */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              First Name
            </h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {filterOptions.firstNames.map(firstName => (
                <label key={firstName} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.first_name.includes(firstName)}
                    onChange={() => onFilterChange('first_name', firstName)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    {firstName}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Contact Number Filter */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Contact Number
            </h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {filterOptions.contactNumbers.map(contactNumber => (
                <label key={contactNumber} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.contact_number.includes(contactNumber)}
                    onChange={() =>
                      onFilterChange('contact_number', contactNumber)
                    }
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    {contactNumber}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Email Filter */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Email</h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {filterOptions.emails.map(email => (
                <label key={email} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.email.includes(email)}
                    onChange={() => onFilterChange('email', email)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">{email}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Tags Filter */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Tags</h4>
            <div className="space-y-2">
              {filterOptions.tags.map(tag => (
                <label key={tag} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.tags.includes(tag)}
                    onChange={() => onFilterChange('tags', tag)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">{tag}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Interest Filter */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Interest</h4>
            <div className="space-y-2">
              {filterOptions.interests.map(interest => (
                <label key={interest} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.interest.includes(interest)}
                    onChange={() => onFilterChange('interest', interest)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">{interest}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Has Instruments Filter */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Instrument Connections
            </h4>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.hasInstruments.includes('Has Instruments')}
                  onChange={() =>
                    onFilterChange('hasInstruments', 'Has Instruments')
                  }
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Has Instruments
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.hasInstruments.includes('No Instruments')}
                  onChange={() =>
                    onFilterChange('hasInstruments', 'No Instruments')
                  }
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">
                  No Instruments
                </span>
              </label>
            </div>
        </div>
      </div>
    </div>
  );
}
