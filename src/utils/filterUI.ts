/**
 * Common filter UI preset classes and utilities
 * Provides consistent styling across Calendar/Dashboard/Clients pages
 */

import React from 'react';

/**
 * Filter panel preset classes
 */
export const filterPanelClasses = {
  container:
    'mt-3 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden z-30',
  content: 'p-4 max-h-[70vh] overflow-y-auto',
  footer:
    'border-t border-gray-200 bg-gray-50 px-4 py-3 flex justify-between items-center',
} as const;

/**
 * Filter toolbar preset classes (one-line filter bar)
 */
export const filterToolbarClasses = {
  container:
    'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm',
  leftSection: 'flex flex-wrap items-center gap-2 text-xs md:text-sm',
  rightSection:
    'flex flex-wrap items-center gap-2 text-[11px] md:text-xs text-gray-600',
  label: 'font-medium text-gray-500',
} as const;

/**
 * Filter select/dropdown preset classes
 */
export const filterSelectClasses = {
  select:
    'h-8 appearance-none rounded-full border border-slate-200 bg-white px-3 pr-7 text-[11px] md:text-xs text-slate-700 transition hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
  selectWrapper: 'relative',
  icon: 'pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2',
  iconSvg: 'h-3 w-3 text-slate-400',
} as const;

/**
 * Filter button preset classes
 */
export const filterButtonClasses = {
  reset:
    'flex h-8 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500',
  sortToggle:
    'flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500',
  badge:
    'rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700',
  activeBadge:
    'rounded-full bg-blue-600 px-2.5 py-1 text-xs font-medium text-white',
} as const;

/**
 * Pill select preset classes (for FilterGroup/PillSelect components)
 */
export const pillSelectClasses = {
  pill: 'rounded-full border px-2.5 py-1 text-xs transition',
  pillActive: 'border-blue-500 bg-blue-50 text-blue-700',
  pillInactive: 'border-gray-200 bg-white text-gray-600 hover:border-blue-300',
  container: 'flex flex-wrap gap-2 text-xs text-gray-600',
  label: 'text-[11px] uppercase tracking-wide text-gray-400',
} as const;

/**
 * Filter group preset classes (for FilterGroup component)
 */
export const filterGroupClasses = {
  container: 'border-b border-gray-100 pb-3 last:border-b-0',
  title: 'text-sm font-semibold text-gray-900 mb-3',
  badge:
    'ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium text-white bg-blue-600 rounded-full',
} as const;

/**
 * Search input preset classes
 */
export const searchInputClasses = {
  input:
    'flex-1 min-w-[260px] h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 focus:outline-none focus:ring-2 focus:ring-blue-100',
  container:
    'mb-6 sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-100 pb-4',
} as const;

/**
 * Active filter badge preset classes
 */
export const activeBadgeClasses = {
  container: 'flex flex-wrap gap-2',
  badge:
    'inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 border border-blue-100',
  removeButton: 'text-blue-500 hover:text-blue-700',
} as const;

/**
 * Filter toggle button preset classes
 */
export const filterToggleButtonClasses = {
  button:
    'h-10 px-3 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors',
  resetButton: 'h-10 px-3 rounded-lg border text-sm font-medium transition',
  resetButtonActive: 'border-red-200 text-red-700 bg-red-50 hover:bg-red-100',
  resetButtonInactive:
    'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed',
} as const;

/**
 * Build filter select dropdown with preset classes
 * Note: This returns props object, not JSX. Use it with spread operator: <select {...buildFilterSelect(...)} />
 */
export function buildFilterSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return {
    className: className || filterSelectClasses.select,
    value,
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
      onChange(e.target.value),
    children: options.map(option =>
      React.createElement(
        'option',
        { key: option.value, value: option.value },
        option.label
      )
    ),
  };
}

/**
 * Build filter button with preset classes
 * Note: This returns props object, not JSX. Use it with spread operator: <button {...buildFilterButton(...)}>...</button>
 */
export function buildFilterButton({
  onClick,
  children,
  variant = 'default',
  className,
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'default' | 'reset' | 'sortToggle';
  className?: string;
}) {
  const variantClasses = {
    default: '',
    reset: filterButtonClasses.reset,
    sortToggle: filterButtonClasses.sortToggle,
  };

  return {
    className: className || variantClasses[variant],
    onClick,
    children,
  };
}
