'use client';

import { ClientKPIs } from '../hooks/useClientKPIs';
import { CardSkeleton } from '@/components/common';

const formatAmount = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

interface ClientKPISummaryProps {
  kpis: ClientKPIs;
}

export function ClientKPISummary({ kpis }: ClientKPISummaryProps) {
  if (kpis.loading) {
    return (
      <div className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <CardSkeleton count={1} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const cards = [
    {
      label: 'Total Customers',
      value: kpis.totalCustomers.toString(),
    },
    {
      label: 'Total Spend',
      value: formatAmount(kpis.totalSpend),
    },
    {
      label: 'Avg Spend/Customer',
      value: formatAmount(kpis.avgSpendPerCustomer),
    },
    {
      label: 'Purchases',
      value: kpis.totalPurchases.toString(),
    },
    {
      label: 'Most Recent Purchase',
      value: kpis.mostRecentPurchase,
    },
  ];

  return (
    <div className="mb-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(card => (
          <div
            key={card.label}
            className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
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
