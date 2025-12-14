'use client';

import React from 'react';

interface CalendarSummaryProps {
  total: number;
  overdue: number;
  today: number;
  upcoming: number;
  onFilterByStatus?: (status: 'all' | 'overdue' | 'today' | 'upcoming') => void;
  activePreset?: 'all' | 'overdue' | 'today' | 'upcoming' | null;
}

interface SummaryCardProps {
  label: string;
  value: number;
  color?: 'green' | 'blue' | 'purple' | 'red' | 'orange';
  onClick?: () => void;
  isActive?: boolean;
}

function SummaryCard({
  label,
  value,
  color = 'blue',
  onClick,
  isActive = false,
}: SummaryCardProps) {
  // FIXED: Compact pill style with active state (background 100%, bold number)
  const isOverdue = label === 'Overdue';

  const baseClasses = `h-9 flex items-center gap-2 rounded-full border px-4 transition-all ${
    onClick ? 'cursor-pointer hover:shadow-sm' : ''
  }`;

  // Active state: full background color, bold number
  if (isActive) {
    if (isOverdue) {
      return (
        <button
          type="button"
          className={`${baseClasses} bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C] hover:bg-[#FEE2E2]`}
          onClick={onClick}
        >
          <span className="text-sm font-semibold">{label}</span>
          <span className="text-sm font-bold">{value}</span>
          <span className="text-xs">🔴</span>
        </button>
      );
    }

    // Active state for other colors
    const activeColorClasses = {
      green: 'bg-green-100 border-green-400 text-green-800',
      blue: 'bg-blue-100 border-blue-400 text-blue-800',
      purple: 'bg-purple-100 border-purple-400 text-purple-800',
      red: 'bg-red-100 border-red-400 text-red-800',
      orange: 'bg-orange-100 border-orange-400 text-orange-800',
    };

    const emojiMap: Record<string, string> = {
      All: '',
      Today: '🟢',
      'Next 7d': '🟣',
    };

    return (
      <button
        type="button"
        className={`${baseClasses} ${activeColorClasses[color]}`}
        onClick={onClick}
      >
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-sm font-bold">{value}</span>
        {emojiMap[label] && <span className="text-xs">{emojiMap[label]}</span>}
      </button>
    );
  }

  // Inactive state: outline only
  if (isOverdue) {
    return (
      <button
        type="button"
        className={`${baseClasses} bg-white border-[#FECACA] text-[#B91C1C] hover:border-[#F87171] hover:bg-[#FEF2F2]`}
        onClick={onClick}
      >
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm font-semibold">{value}</span>
        <span className="text-xs">🔴</span>
      </button>
    );
  }

  // Other pills: border-only color scheme (inactive)
  const colorClasses = {
    green:
      'bg-white border-green-300 text-gray-700 hover:border-green-400 hover:bg-green-50',
    blue: 'bg-white border-blue-300 text-gray-700 hover:border-blue-400 hover:bg-blue-50',
    purple:
      'bg-white border-purple-300 text-gray-700 hover:border-purple-400 hover:bg-purple-50',
    red: 'bg-white border-red-300 text-gray-700 hover:border-red-400 hover:bg-red-50',
    orange:
      'bg-white border-orange-300 text-gray-700 hover:border-orange-400 hover:bg-orange-50',
  };

  const emojiMap: Record<string, string> = {
    All: '',
    Today: '🟢',
    'Next 7d': '🟣',
  };

  return (
    <button
      type="button"
      className={`${baseClasses} ${colorClasses[color]}`}
      onClick={onClick}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
      {emojiMap[label] && <span className="text-xs">{emojiMap[label]}</span>}
    </button>
  );
}

export default function CalendarSummary({
  total,
  overdue,
  today,
  upcoming,
  onFilterByStatus,
  onOpenFilters,
  hasActiveFilters,
  activePreset,
}: CalendarSummaryProps & {
  onOpenFilters?: () => void;
  hasActiveFilters?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <SummaryCard
        label="All"
        value={total}
        color="blue"
        onClick={() => onFilterByStatus?.('all')}
        isActive={activePreset === 'all'}
      />
      <SummaryCard
        label="Overdue"
        value={overdue}
        color="red"
        onClick={() => onFilterByStatus?.('overdue')}
        isActive={activePreset === 'overdue'}
      />
      <SummaryCard
        label="Today"
        value={today}
        color="green"
        onClick={() => onFilterByStatus?.('today')}
        isActive={activePreset === 'today'}
      />
      <SummaryCard
        label="Next 7d"
        value={upcoming}
        color="purple"
        onClick={() => onFilterByStatus?.('upcoming')}
        isActive={activePreset === 'upcoming'}
      />
      {onOpenFilters && (
        <button
          type="button"
          onClick={onOpenFilters}
          className="h-9 flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors ml-auto"
          aria-label="Advanced Filters"
        >
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
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
            />
          </svg>
          Filters
          {hasActiveFilters && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
              Active
            </span>
          )}
        </button>
      )}
    </div>
  );
}
