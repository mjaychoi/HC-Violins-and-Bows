'use client';

import React, { useState, useCallback } from 'react';
import { DateRange, FilterOperator } from '@/types/search';

interface AdvancedSearchProps {
  dateRange: DateRange | null;
  onDateRangeChange: (range: DateRange | null) => void;
  operator: FilterOperator;
  onOperatorChange: (operator: FilterOperator) => void;
  dateFields?: Array<{ field: string; label: string }>;
  onApply?: () => void;
  onReset?: () => void;
}

export default function AdvancedSearch({
  dateRange,
  onDateRangeChange,
  operator,
  onOperatorChange,
  dateFields = [],
  onApply,
  onReset,
}: AdvancedSearchProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleDateChange = useCallback(
    (field: 'from' | 'to', value: string) => {
      onDateRangeChange({
        from: field === 'from' ? value : dateRange?.from || null,
        to: field === 'to' ? value : dateRange?.to || null,
      });
    },
    [dateRange, onDateRangeChange]
  );

  const handleClearDateRange = useCallback(() => {
    onDateRangeChange(null);
  }, [onDateRangeChange]);

  const hasActiveFilters = dateRange?.from || dateRange?.to;

  return (
    <div className="relative inline-block">
      <button
        data-testid="advanced-search-toggle"
        aria-label="Toggle advanced search"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center h-10 w-10 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
          />
        </svg>
        {hasActiveFilters && (
          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-600"></span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-2 w-96 bg-white rounded-lg border border-gray-200 shadow-lg p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  Advanced Search
                </h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close advanced search"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              {/* 날짜 범위 검색 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  날짜 범위
                </label>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      시작일
                    </label>
                    <input
                      type="date"
                      value={dateRange?.from || ''}
                      onChange={e => handleDateChange('from', e.target.value)}
                      className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label="Start date"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={dateRange?.to || ''}
                      onChange={e => handleDateChange('to', e.target.value)}
                      min={dateRange?.from || undefined}
                      className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label="End date"
                    />
                  </div>
                  {hasActiveFilters && (
                    <button
                      onClick={handleClearDateRange}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      Clear Date Range
                    </button>
                  )}
                </div>
              </div>

              {/* Operator selection (for future expansion) */}
              {dateFields.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Condition Operator
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onOperatorChange('AND')}
                      className={`flex-1 h-10 rounded-lg border text-sm font-medium transition-colors ${
                        operator === 'AND'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                      aria-label="All Match (AND)"
                    >
                      All Match (AND)
                    </button>
                    <button
                      onClick={() => onOperatorChange('OR')}
                      className={`flex-1 h-10 rounded-lg border text-sm font-medium transition-colors ${
                        operator === 'OR'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                      aria-label="Any Match (OR)"
                    >
                      Any Match (OR)
                    </button>
                  </div>
                </div>
              )}

              {/* Apply/Reset buttons */}
              <div className="flex gap-2 pt-2 border-t border-gray-200">
                {onReset && (
                  <button
                    onClick={() => {
                      onReset();
                    }}
                    disabled={!hasActiveFilters}
                    className="flex-1 h-10 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Reset advanced search"
                  >
                    Reset
                  </button>
                )}
                <button
                  data-testid="advanced-search-apply"
                  onClick={() => {
                    onApply?.();
                    setIsOpen(false);
                  }}
                  className="flex-1 h-10 rounded-lg border border-blue-600 bg-blue-600 text-sm font-medium text-white hover:bg-blue-700"
                  aria-label="Apply advanced search"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
