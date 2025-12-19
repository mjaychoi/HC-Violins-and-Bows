'use client';

import React from 'react';
import { formatDateOnly } from '@/utils/formatUtils';
import { getStatusLabel } from '@/utils/calendar';

interface CalendarEmptyStateProps {
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  onOpenNewTask: () => void;
  resultCount?: number;
  // Filter summary for better UX
  activeFilters?: {
    status?: string;
    owner?: string;
    dateRange?: { from?: string; to?: string } | null;
    searchTerm?: string;
  };
}

export default function CalendarEmptyState({
  hasActiveFilters,
  onResetFilters,
  onOpenNewTask,
  resultCount = 0,
  activeFilters,
}: CalendarEmptyStateProps) {
  // Build filter summary text
  const filterSummaryParts: string[] = [];
  if (activeFilters?.status && activeFilters.status !== 'all') {
    filterSummaryParts.push(`Status: ${getStatusLabel(activeFilters.status)}`);
  }
  if (activeFilters?.owner && activeFilters.owner !== 'all') {
    filterSummaryParts.push(`Owner: ${activeFilters.owner}`);
  }
  if (activeFilters?.dateRange) {
    const { from, to } = activeFilters.dateRange;
    if (from && to) {
      filterSummaryParts.push(
        `Date: ${formatDateOnly(from)} - ${formatDateOnly(to)}`
      );
    } else if (from) {
      filterSummaryParts.push(`From: ${formatDateOnly(from)}`);
    } else if (to) {
      filterSummaryParts.push(`Until: ${formatDateOnly(to)}`);
    }
  }
  if (activeFilters?.searchTerm?.trim()) {
    filterSummaryParts.push(`Search: "${activeFilters.searchTerm}"`);
  }

  const filterSummaryText = filterSummaryParts.join(' · ');

  return (
    <div className="py-12 text-center">
      <div className="mx-auto max-w-md">
        {/* Screen reader announcement */}
        <div role="status" aria-live="polite" className="sr-only">
          {hasActiveFilters
            ? `No tasks found for current filters. ${resultCount} results. ${filterSummaryText ? `Active filters: ${filterSummaryText}` : ''}`
            : `No tasks yet. ${resultCount} results.`}
        </div>
        <div className="mb-4">
          {/* FIXED: Decorative SVG hidden from screen readers */}
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        {/* FIXED: Use h2 for primary empty state (depends on page structure, but typically h2 is better than h3) */}
        <h2 className="text-base font-medium text-gray-900 mb-1">
          {hasActiveFilters ? 'No tasks found' : 'No tasks yet'}
        </h2>
        {hasActiveFilters && filterSummaryText && (
          <div className="mb-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-600">
            <span className="font-medium">Active filters:</span>{' '}
            <span>{filterSummaryText}</span>
          </div>
        )}
        <p className="text-sm text-gray-500 mb-6">
          {hasActiveFilters
            ? 'Try adjusting your filters or create a new task.'
            : 'Get started by creating your first maintenance task.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {hasActiveFilters && (
            <button
              onClick={onResetFilters}
              className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {/* FIXED: Decorative SVG hidden from screen readers */}
              <svg
                className="mr-1.5 h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Clear filters
            </button>
          )}

          <button
            onClick={onOpenNewTask}
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            {/* FIXED: Decorative SVG hidden from screen readers */}
            <svg
              className="mr-1.5 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add maintenance task
          </button>
        </div>
      </div>
    </div>
  );
}
