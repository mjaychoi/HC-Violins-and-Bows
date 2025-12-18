'use client';

import React from 'react';
import type { ExtendedView } from './CalendarView';
import { getViewRangeLabel } from '../utils/viewUtils';

interface CalendarHeaderProps {
  currentDate: Date;
  calendarView: ExtendedView;
  view: 'calendar' | 'list';
  onPrevious: () => void;
  onNext: () => void;
  onGoToToday: () => void;
  onViewChange: (view: 'calendar' | 'list') => void;
  onOpenNewTask: () => void;
  notificationBadge?: React.ReactNode;
}

export default function CalendarHeader({
  currentDate,
  calendarView,
  view,
  onPrevious,
  onNext,
  onGoToToday,
  onViewChange,
  onOpenNewTask,
  notificationBadge,
}: CalendarHeaderProps) {
  const viewRangeLabel = getViewRangeLabel(calendarView, currentDate);

  return (
    <header className="mb-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* 왼쪽: 네비 + 날짜 범위 */}
        <div className="flex items-center gap-3">
          {/* 네비 버튼 */}
          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-1 py-0.5">
            <button
              onClick={onPrevious}
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Previous"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              onClick={onNext}
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Next"
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>

          {/* 날짜 범위 표시 */}
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold tracking-tight text-gray-900">
              {viewRangeLabel}
            </h1>
          </div>
        </div>

        {/* Right: Today / View Toggle / New Task Button */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* FIXED: Ensure notificationBadge has keyboard focus styles if interactive */}
          {notificationBadge && (
            <div className="[&_*]:focus-visible:ring-2 [&_*]:focus-visible:ring-blue-500 [&_*]:focus-visible:outline-none">
              {notificationBadge}
            </div>
          )}
          <button
            onClick={onGoToToday}
            className="flex h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Go to today"
          >
            {/* FIXED: Decorative SVG hidden from screen readers */}
            <svg
              className="h-4 w-4"
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
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Today
          </button>

          <div
            role="tablist"
            aria-label="Calendar view"
            className="flex gap-1 rounded-lg bg-gray-100 p-1 border border-gray-200"
          >
            <button
              onClick={() => onViewChange('calendar')}
              role="tab"
              aria-selected={view === 'calendar'}
              className={`flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition ${
                view === 'calendar'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-white hover:text-gray-900'
              }`}
              aria-label="Calendar view"
            >
              {/* FIXED: Decorative SVG hidden from screen readers */}
              <svg
                className="w-4 h-4"
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
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Calendar
            </button>
            <button
              onClick={() => onViewChange('list')}
              role="tab"
              aria-selected={view === 'list'}
              className={`flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition ${
                view === 'list'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-white hover:text-gray-900'
              }`}
              aria-label="List view"
            >
              {/* FIXED: Decorative SVG hidden from screen readers */}
              <svg
                className="w-4 h-4"
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
                  d="M4 6h16M4 10h16M4 14h16M4 18h16"
                />
              </svg>
              List
            </button>
          </div>

          <button
            onClick={onOpenNewTask}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Add new task"
          >
            {/* FIXED: Decorative SVG hidden from screen readers */}
            <svg
              className="h-4 w-4"
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
            Add New Task
          </button>
        </div>
      </div>
    </header>
  );
}
