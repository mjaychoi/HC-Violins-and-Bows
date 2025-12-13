import { CustomerWithPurchases, Purchase } from '../types';
import { getMostRecentDate } from '@/utils/dateParsing';

const formatAmount = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

export function CustomerStats({ customers }: { customers: CustomerWithPurchases[] }) {
  const totalCustomers = customers.length;
  const totalSpend = customers.reduce(
    (sum: number, c: CustomerWithPurchases) => sum + c.purchases.reduce((pSum: number, p: Purchase) => pSum + p.amount, 0),
    0
  );
  const avgSpend = totalCustomers ? totalSpend / totalCustomers : 0;
  const purchaseCount = customers.reduce((sum: number, c: CustomerWithPurchases) => sum + c.purchases.length, 0);
  // FIXED: Use getMostRecentDate instead of string sorting
  const recentDate = getMostRecentDate(
    customers.flatMap((c: CustomerWithPurchases) => c.purchases.map((p: Purchase) => p.date))
  );

  const cards = [
    { label: 'Customers', value: totalCustomers.toString() },
    { label: 'Total Spend', value: formatAmount(totalSpend) },
    { label: 'Avg Spend/Customer', value: formatAmount(avgSpend) },
    { label: 'Purchases', value: purchaseCount.toString() },
    { label: 'Most Recent Purchase', value: recentDate },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map(card => (
        <div key={card.label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <div className="text-xs font-medium text-gray-500">{card.label}</div>
          <div className="text-xl font-semibold text-gray-900 mt-1">{card.value}</div>
        </div>
      ))}
    </div>
  );
}
