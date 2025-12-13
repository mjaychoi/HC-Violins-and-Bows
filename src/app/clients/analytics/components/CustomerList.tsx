import { CustomerWithPurchases } from '../types';
import { getMostRecentDate } from '@/utils/dateParsing';
import { EmptyState } from '@/components/common';

interface CustomerListProps {
  customers: CustomerWithPurchases[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const formatAmount = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

export function CustomerList({ customers, selectedId, onSelect }: CustomerListProps) {
  if (!customers.length) {
    return (
      <EmptyState
        title="No customers found"
        description="Try adjusting your search or filters, or add your first customer."
      />
    );
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 divide-y divide-gray-200">
      {customers.map(customer => {
        const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unnamed';
        const totalSpend = customer.purchases.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
        // FIXED: Use getMostRecentDate instead of string sorting
        const recentDate = customer.purchases.length > 0
          ? getMostRecentDate(customer.purchases.map((p: { date: string }) => p.date))
          : '—';
        // FIXED: Normalize tags to prevent runtime crash
        const tags = Array.isArray(customer.tags) ? customer.tags : [];
        return (
          <button
            key={customer.id}
            onClick={() => onSelect(customer.id)}
            className={`w-full text-left px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors ${
              selectedId === customer.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
            }`}
            aria-pressed={selectedId === customer.id}
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 truncate">{fullName}</div>
              <div className="text-sm text-gray-500 mt-0.5 truncate">{customer.email || 'No email'}</div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {tags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {tags.slice(0, 2).map((tag, i) => (
                      // FIXED: Add index to key to prevent collisions if tags repeat
                      <span
                        key={`${tag}-${i}`}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                      >
                        {tag}
                      </span>
                    ))}
                    {tags.length > 2 && (
                      <span className="text-xs text-gray-400">+{tags.length - 2}</span>
                    )}
                  </div>
                )}
                {customer.interest && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    {customer.interest}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right ml-4 flex-shrink-0">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Total</div>
              <div className="font-semibold text-gray-900">{formatAmount(totalSpend)}</div>
              <div className="text-xs text-gray-400 mt-0.5">Last: {recentDate}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
