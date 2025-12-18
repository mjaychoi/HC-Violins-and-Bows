import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * ✅ FIXED: Common classNames utility - Layout/Spacing/Typography only
 * Color/status/variant styles should use colorTokens-based functions instead
 * This prevents conflicts with the centralized color token system
 *
 * Usage Policy:
 * - classNames.*: Pre-defined style tokens (table, input, formLabel, etc.)
 *   Use for: Consistent layout/spacing/typography across components
 * - cn(): Dynamic class combination (conditional, merging, etc.)
 *   Use for: Conditional classes, merging multiple classes, component-specific overrides
 *
 * For button colors, use: buttonPrimary, buttonSecondary, buttonDanger (or colorTokens)
 * For status/badge colors, use: getStatusColor, getTagColor from colorTokens
 */
export const classNames = {
  // Input styles (layout/spacing only, colors handled separately)
  input: 'w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2',
  inputError:
    'w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2',

  // Button base styles (layout/spacing only, colors handled separately)
  buttonBase:
    'px-4 py-2 rounded-md focus:outline-none focus:ring-2 transition-colors',
  buttonPrimary:
    'px-4 py-2 rounded-md focus:outline-none focus:ring-2 transition-colors bg-blue-600 text-white hover:bg-blue-500',
  buttonSecondary:
    'px-4 py-2 rounded-md focus:outline-none focus:ring-2 transition-colors bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
  buttonDanger:
    'px-4 py-2 rounded-md focus:outline-none focus:ring-2 transition-colors bg-red-600 text-white hover:bg-red-500',
  // Note: Use colorTokens-based functions for button colors (e.g., btnVariant('primary'))

  // Card styles (layout/spacing only)
  card: 'bg-white p-6 rounded-lg shadow border',
  cardHeader: 'border-b pb-4 mb-4',

  // Form styles (layout/spacing/typography only)
  formGroup: 'space-y-4',
  formLabel: 'block text-sm font-medium mb-1',
  formError: 'text-sm mt-1',

  // Table styles (통일된 테이블 스타일)
  tableWrapper: 'rounded-xl border border-gray-100 bg-white shadow-sm',
  tableContainer: 'overflow-x-auto',
  table: 'min-w-full divide-y divide-gray-200',
  tableHeader:
    'sticky top-0 bg-white/80 backdrop-blur border-b border-gray-200',
  tableHeaderRow: '',
  tableHeaderCell: 'px-6 py-3 text-left text-xs font-medium text-[#6B7280]',
  tableHeaderCellSortable:
    'px-6 py-3 text-left text-xs font-medium text-[#6B7280] cursor-pointer group select-none',
  tableBody: 'bg-white divide-y divide-gray-200',
  tableRow: 'hover:bg-gray-50 transition-colors',
  tableCell: 'px-6 py-4 text-sm text-gray-900',

  // Modal styles
  modalOverlay:
    'fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50',
  modalWrapper: 'relative top-20 mx-auto w-96', // width control here
  modalContent: 'p-5 border shadow-lg rounded-md bg-white', // content only has padding/border
  modalHeader: 'flex justify-between items-center mb-4',
  modalBody: 'mb-4',
  modalFooter: 'flex justify-end space-x-2',
};

// conditional classNames combination function with tailwind-merge
export const cn = (
  ...inputs: (string | undefined | null | boolean | Record<string, unknown>)[]
) => twMerge(clsx(inputs));
