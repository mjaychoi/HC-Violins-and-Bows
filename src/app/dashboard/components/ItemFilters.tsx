'use client';

import React, { useRef, useEffect } from 'react';
import { Instrument } from '@/types';
import { getPriceRange } from '../utils/dashboardUtils';
import { getUniqueValues } from '@/utils/uniqueValues';
// import { classNames } from '@/utils/classNames'
// import Button from '@/components/common/Button'
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface ItemFiltersProps {
  items: Instrument[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filters: {
    status: string[];
    maker: string[];
    type: string[];
    subtype: string[];
    ownership: string[];
    certificate: boolean[];
    priceRange: { min: string; max: string };
    hasClients: string[];
  };
  onFilterChange: (filterType: string, value: string | boolean) => void;
  onPriceRangeChange: (field: 'min' | 'max', value: string) => void;
  onClearFilters: () => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  activeFiltersCount: number;
}

export default function ItemFilters({
  items,
  searchTerm,
  onSearchChange,
  filters,
  onFilterChange,
  onPriceRangeChange,
  // onClearFilters,
  showFilters,
  onToggleFilters,
  activeFiltersCount,
}: ItemFiltersProps) {
  const filterPanelRef = useRef<HTMLDivElement>(null);

  // Close filter panel with ESC key
  useEscapeKey(onToggleFilters, showFilters);

  // Handle click outside filter panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const filterButton = document.querySelector('[data-filter-button]');
      if (filterButton && filterButton.contains(target)) {
        return;
      }

      if (filterPanelRef.current && !filterPanelRef.current.contains(target)) {
        onToggleFilters();
      }
    };

    if (showFilters) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilters, onToggleFilters]);

  const filterOptions = {
    status: getUniqueValues(items, 'status'),
    maker: getUniqueValues(items, 'maker'),
    type: getUniqueValues(items, 'type'),
    subtype: getUniqueValues(items, 'subtype'),
    ownership: getUniqueValues(items, 'ownership'),
  };

  const priceRange = getPriceRange(items);

  return (
    <div className="mb-6">
      {/* Search and Filter Controls */}
      <div className="flex items-center justify-between mb-4">
        <input
          placeholder="Search items..."
          className="w-full max-w-lg h-10 rounded-lg border border-gray-200 bg-gray-50 px-3
                     focus:outline-none focus:ring-2 focus:ring-blue-100"
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
        />
        <div className="ml-4">
          <button
            data-filter-button
            onClick={onToggleFilters}
            className="h-10 px-3 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div
          ref={filterPanelRef}
          className="bg-white border border-gray-200 rounded-lg p-4 shadow-lg"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <div className="space-y-2">
                {filterOptions.status.map(status => (
                  <label key={status} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.status.includes(status)}
                      onChange={() => onFilterChange('status', status)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">{status}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Maker Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maker
              </label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {filterOptions.maker.map(maker => (
                  <label key={maker} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.maker.includes(maker)}
                      onChange={() => onFilterChange('maker', maker)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">{maker}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type
              </label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {filterOptions.type.map(type => (
                  <label key={type} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.type.includes(type)}
                      onChange={() => onFilterChange('type', type)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Subtype Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subtype
              </label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {filterOptions.subtype.map(subtype => (
                  <label key={subtype} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.subtype.includes(subtype)}
                      onChange={() => onFilterChange('subtype', subtype)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      {subtype}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Ownership Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ownership
              </label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {filterOptions.ownership.map(ownership => (
                  <label key={ownership} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.ownership.includes(ownership)}
                      onChange={() => onFilterChange('ownership', ownership)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      {ownership}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Price Range Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Price Range
              </label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={filters.priceRange.min}
                    onChange={e => onPriceRangeChange('min', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.priceRange.max}
                    onChange={e => onPriceRangeChange('max', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="text-xs text-gray-500">
                  Range: ${priceRange.min.toLocaleString()} - $
                  {priceRange.max.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
