import { Purchase } from '../types';
import { format, parseISO } from 'date-fns';
import { parseYMDUTC } from '@/utils/dateParsing';
// ✅ FIXED: Use centralized color tokens
import { getPurchaseStatusColor } from '@/utils/colorTokens';

interface PurchaseHistoryProps {
  purchases: Purchase[];
  statusFilter: 'All' | 'Completed' | 'Pending' | 'Refunded';
  onStatusFilterChange: (
    status: 'All' | 'Completed' | 'Pending' | 'Refunded'
  ) => void;
}

const formatAmount = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    amount
  );

// ✅ Format date for display (consistent date formatting)
const formatDateForDisplay = (dateStr: string): string => {
  try {
    // Try parsing as YYYY-MM-DD first
    const date = parseYMDUTC(dateStr);
    return format(date, 'MMM d, yyyy');
  } catch {
    // Fallback to ISO parsing
    try {
      const date = parseISO(dateStr);
      return format(date, 'MMM d, yyyy');
    } catch {
      return dateStr; // Fallback to raw string
    }
  }
};

export function PurchaseHistory({
  purchases,
  statusFilter,
  onStatusFilterChange,
}: PurchaseHistoryProps) {
  const visible = purchases.filter(
    p => statusFilter === 'All' || p.status === statusFilter
  );

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <div className="text-sm font-semibold text-gray-900">
          Purchase History
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Status:</span>
          <select
            value={statusFilter}
            onChange={e =>
              onStatusFilterChange(
                e.target.value as 'All' | 'Completed' | 'Pending' | 'Refunded'
              )
            }
            className="h-8 px-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            {['All', 'Completed', 'Pending', 'Refunded'].map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
            />
          </svg>
          <h3 className="mt-4 text-sm font-medium text-gray-900">
            No purchases
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            This client has no purchase history yet.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {visible.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-medium">
                    {p.item}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                    {formatDateForDisplay(p.date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getPurchaseStatusColor(p.status)}`}
                      aria-label={`Status: ${p.status}`}
                    >
                      {p.status === 'Completed' && (
                        <svg
                          className="h-3 w-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                      {p.status === 'Pending' && (
                        <svg
                          className="h-3 w-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                      {p.status === 'Refunded' && (
                        <svg
                          className="h-3 w-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-gray-900">
                    {formatAmount(p.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
