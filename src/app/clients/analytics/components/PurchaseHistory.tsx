import { Purchase } from '../types';

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
        <div className="p-4 text-center text-gray-500 text-sm">
          No purchases
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
                    {p.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        p.status === 'Completed'
                          ? 'bg-green-100 text-green-700'
                          : p.status === 'Pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : p.status === 'Refunded'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                      }`}
                    >
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
