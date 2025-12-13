'use client';

import React from 'react';

interface CalendarSummaryProps {
  total: number;
  overdue: number;
  today: number;
  upcoming: number;
  onFilterByStatus?: (status: 'all' | 'overdue' | 'today' | 'upcoming') => void;
}

export default function CalendarSummary({
  total,
  overdue,
  today,
  upcoming,
  onFilterByStatus,
}: CalendarSummaryProps) {
  const handleCardClick = (
    status: 'all' | 'overdue' | 'today' | 'upcoming'
  ) => {
    if (onFilterByStatus) {
      onFilterByStatus(status);
    }
  };

  return (
    <div className="mb-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* All */}
        <div
          className="rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all hover:border-gray-300 hover:shadow-sm cursor-pointer"
          onClick={() => handleCardClick('all')}
          role="button"
          tabIndex={0}
          aria-label="View all tasks"
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleCardClick('all');
            }
          }}
        >
          <span className="text-xs font-medium text-gray-500">All</span>
          <div className="mt-1">
            <span className="text-xl font-semibold text-gray-900">{total}</span>
          </div>
        </div>

        {/* Overdue */}
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 transition-all hover:border-red-300 hover:shadow-sm cursor-pointer"
          onClick={() => handleCardClick('overdue')}
          role="button"
          tabIndex={0}
          aria-label={`View ${overdue} overdue tasks`}
          title="View overdue tasks"
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleCardClick('overdue');
            }
          }}
        >
          <span className="text-xs font-medium text-red-600">Overdue</span>
          <div className="mt-1">
            <span className="text-xl font-semibold text-red-700">
              {overdue}
            </span>
          </div>
        </div>

        {/* Today */}
        <div
          className="rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all hover:border-gray-300 hover:shadow-sm cursor-pointer"
          onClick={() => handleCardClick('today')}
          role="button"
          tabIndex={0}
          aria-label={`View ${today} tasks due today`}
          title="View tasks due today"
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleCardClick('today');
            }
          }}
        >
          <span className="text-xs font-medium text-gray-500">Today</span>
          <div className="mt-1">
            <span className="text-xl font-semibold text-gray-900">{today}</span>
          </div>
        </div>

        {/* Next 7 days */}
        <div
          className="rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all hover:border-gray-300 hover:shadow-sm cursor-pointer"
          onClick={() => handleCardClick('upcoming')}
          role="button"
          tabIndex={0}
          aria-label={`View ${upcoming} upcoming tasks`}
          title="View upcoming tasks"
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleCardClick('upcoming');
            }
          }}
        >
          <span className="text-xs font-medium text-gray-500">Upcoming</span>
          <div className="mt-1">
            <span className="text-xl font-semibold text-gray-900">
              {upcoming}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
