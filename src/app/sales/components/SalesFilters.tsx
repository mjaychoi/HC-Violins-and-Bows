import { useMemo } from 'react';
import { DatePreset } from '../types';
import { getDateRangeFromPreset } from '../utils/salesUtils';

interface SalesFiltersProps {
  showFilters: boolean;
  onToggleFilters: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  from: string;
  onFromChange: (value: string) => void;
  to: string;
  onToChange: (value: string) => void;
  onDatePreset: (preset: DatePreset) => void;
  onClearFilters: () => void;
  onExportCSV: () => void;
  isExportingCSV?: boolean;
  hasData: boolean;
}

export default function SalesFilters({
  showFilters,
  onToggleFilters,
  search,
  onSearchChange,
  from,
  onFromChange,
  to,
  onToChange,
  onDatePreset,
  onClearFilters,
  onExportCSV,
  isExportingCSV = false,
  hasData,
}: SalesFiltersProps) {
  const hasActiveFilters = !!(search || from || to);
  const filtersPanelId = 'sales-filters-panel';

  // FIXED: Memoize preset calculation to avoid re-computing on every render
  const activePreset = useMemo((): DatePreset | 'all' | null => {
    if (!from && !to) return 'all';

    const presets: DatePreset[] = [
      'last7',
      'thisMonth',
      'lastMonth',
      'last3Months',
      'last12Months',
    ];
    for (const preset of presets) {
      const { from: presetFrom, to: presetTo } = getDateRangeFromPreset(preset);
      if (from === presetFrom && to === presetTo) {
        return preset;
      }
    }
    return null;
  }, [from, to]);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={onToggleFilters}
          aria-expanded={showFilters}
          aria-controls={filtersPanelId}
          className={`flex items-center gap-2 text-sm font-medium rounded-lg border transition-colors px-3 py-1.5 ${
            showFilters || hasActiveFilters
              ? 'border-blue-500 text-blue-600 bg-blue-50'
              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Filters & Search
        </button>
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
            type="button"
          >
            Clear filters
          </button>
        )}
      </div>

      {showFilters && (
        <div
          id={filtersPanelId}
          className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-4"
        >
          {/* Date Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Quick Filters:
            </span>
            <button
              type="button"
              onClick={() => {
                onFromChange('');
                onToChange('');
              }}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${
                !from && !to
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
              }`}
            >
              All time
            </button>
            <button
              type="button"
              onClick={() => onDatePreset('last7')}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${
                activePreset === 'last7'
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Last 7 days
            </button>
            <button
              type="button"
              onClick={() => onDatePreset('thisMonth')}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${
                activePreset === 'thisMonth'
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
              }`}
            >
              This month
            </button>
            <button
              type="button"
              onClick={() => onDatePreset('lastMonth')}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${
                activePreset === 'lastMonth'
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Last month
            </button>
            <button
              type="button"
              onClick={() => onDatePreset('last3Months')}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${
                activePreset === 'last3Months'
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Last 3 months
            </button>
            <button
              type="button"
              onClick={() => onDatePreset('last12Months')}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${
                activePreset === 'last12Months'
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Last 12 months
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <input
              type="text"
              placeholder="Search sales (client, instrument, notes)..."
              className="flex-1 min-w-[260px] h-10 px-4 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              aria-label="Search sales"
            />

            {/* Date Filters */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                onChange={e => {
                  const newFrom = e.target.value;
                  // FIXED: Auto-adjust 'to' if from > to to prevent invalid ranges
                  if (to && newFrom > to) {
                    onToChange(newFrom);
                  }
                  onFromChange(newFrom);
                }}
                className="h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                aria-label="From date"
              />
              <span className="text-gray-500 text-sm">to</span>
              <input
                type="date"
                value={to}
                onChange={e => {
                  const newTo = e.target.value;
                  // FIXED: Auto-adjust 'from' if to < from to prevent invalid ranges
                  if (from && newTo < from) {
                    onFromChange(newTo);
                  }
                  onToChange(newTo);
                }}
                className="h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                aria-label="To date"
              />
            </div>

            {/* Export CSV Button */}
            <button
              type="button"
              onClick={onExportCSV}
              disabled={!hasData || isExportingCSV}
              className="h-10 px-4 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              title="Export to CSV"
            >
              {isExportingCSV ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Export CSV
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
