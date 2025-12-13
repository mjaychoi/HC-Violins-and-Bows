import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

// common classNames utility
export const classNames = {
  // Input styles
  input:
    'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500',
  inputError:
    'w-full px-3 py-2 border border-red-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500',

  // Button styles
  buttonPrimary:
    'bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500',
  buttonSecondary:
    'bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500',
  buttonDanger:
    'bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500',
  buttonSuccess:
    'bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500',
  buttonWarning:
    'bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500',

  // Card styles
  card: 'bg-white p-6 rounded-lg shadow border border-gray-200',
  cardHeader: 'border-b border-gray-200 pb-4 mb-4',

  // Form styles
  formGroup: 'space-y-4',
  formLabel: 'block text-sm font-medium text-gray-700 mb-1',
  formError: 'text-red-600 text-sm mt-1',

  // Table styles (통일된 테이블 스타일)
  tableWrapper: 'rounded-xl border border-gray-100 bg-white shadow-sm',
  tableContainer: 'overflow-x-auto',
  table: 'min-w-full divide-y divide-gray-200',
  tableHeader: 'sticky top-0 bg-white/80 backdrop-blur border-b border-gray-200',
  tableHeaderRow: '',
  tableHeaderCell: 'px-6 py-3 text-left text-xs font-semibold text-gray-500',
  tableHeaderCellSortable: 'px-6 py-3 text-left text-xs font-semibold text-gray-500 cursor-pointer group select-none',
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
