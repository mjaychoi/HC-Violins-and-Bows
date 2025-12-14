import { CustomerWithPurchases, Purchase } from '../types';
import { getMostRecentDate } from '@/utils/dateParsing';

const formatAmount = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

export function CustomerStats({
  customers,
  hasActiveFilters = false,
  totalCustomers = 0,
}: {
  customers: CustomerWithPurchases[];
  hasActiveFilters?: boolean;
  totalCustomers?: number;
}) {
  const filteredCount = customers.length;
  const totalSpend = customers.reduce(
    (sum: number, c: CustomerWithPurchases) =>
      sum +
      c.purchases.reduce((pSum: number, p: Purchase) => pSum + p.amount, 0),
    0
  );
  const avgSpend = filteredCount ? totalSpend / filteredCount : 0;
  const purchaseCount = customers.reduce(
    (sum: number, c: CustomerWithPurchases) => sum + c.purchases.length,
    0
  );
  // FIXED: Use getMostRecentDate instead of string sorting
  const recentDate = getMostRecentDate(
    customers.flatMap((c: CustomerWithPurchases) =>
      c.purchases.map((p: Purchase) => p.date)
    )
  );

  const cards = [
    { label: 'Customers', value: filteredCount.toString() },
    { label: 'Total Spend', value: formatAmount(totalSpend) },
    { label: 'Avg Spend/Customer', value: formatAmount(avgSpend) },
    { label: 'Purchases', value: purchaseCount.toString() },
    { label: 'Most Recent Purchase', value: recentDate },
  ];

  return (
    <div className="space-y-2">
      {/* Filter indicator */}
      {hasActiveFilters && totalCustomers > 0 && (
        <div className="text-xs text-gray-500 flex items-center gap-1">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          <span>
            Showing {filteredCount} of {totalCustomers} customers
          </span>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(card => (
          <div
            key={card.label}
            className={`rounded-lg border px-4 py-3 ${
              hasActiveFilters
                ? 'border-blue-200 bg-blue-50/30'
                : 'border-gray-200 bg-white'
            }`}
          >
            <div className="text-xs font-medium text-gray-500">
              {card.label}
            </div>
            <div className="text-xl font-semibold text-gray-900 mt-1">
              {card.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
