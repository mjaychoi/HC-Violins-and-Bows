import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { parseISO } from 'date-fns';
import { CustomerWithPurchases } from '../types';
import { getMostRecentDate, parseYMDLocal } from '@/utils/dateParsing';

// Format amount with 0 decimal places (for total spend)
const formatAmount = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

// Format amount with 2 decimal places (for average spend)
const formatAmountWithDecimals = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(amount);

// Format date for display (consistent with PurchaseHistory and CustomerList)
// Use local parsing for display to avoid timezone issues
const formatDateForDisplay = (dateStr?: string | null): string => {
  if (!dateStr) return '—';
  try {
    // Use parseYMDLocal for display to show correct local date
    const date = parseYMDLocal(dateStr);
    if (date) {
      return format(date, 'MMM d, yyyy');
    }
  } catch {
    // Continue to fallback
  }
  // Fallback to ISO parsing
  try {
    const date = parseISO(dateStr);
    return format(date, 'MMM d, yyyy');
  } catch {
    return dateStr; // Fallback to raw string
  }
};

export function CustomerStats({
  customers,
  hasActiveFilters = false,
  totalCustomers = 0,
}: {
  customers: CustomerWithPurchases[];
  hasActiveFilters?: boolean;
  totalCustomers?: number;
}) {
  // Optimize calculations with useMemo
  const {
    filteredCount,
    totalSpend,
    avgSpend,
    purchaseCount,
    recentDateDisplay,
  } = useMemo(() => {
    const filteredCount = customers.length;

    let totalSpend = 0;
    let purchaseCount = 0;
    const dates: string[] = [];

    for (const c of customers) {
      purchaseCount += c.purchases.length;
      for (const p of c.purchases) {
        totalSpend += p.amount;
        if (p.date) dates.push(p.date);
      }
    }

    const avgSpend = filteredCount ? totalSpend / filteredCount : 0;
    const recentRaw = dates.length > 0 ? getMostRecentDate(dates) : null;

    return {
      filteredCount,
      totalSpend,
      avgSpend,
      purchaseCount,
      recentDateDisplay: formatDateForDisplay(recentRaw),
    };
  }, [customers]);

  const cards = [
    { label: 'Customers', value: filteredCount.toString() },
    { label: 'Total Spend', value: formatAmount(totalSpend) },
    { label: 'Avg Spend/Customer', value: formatAmountWithDecimals(avgSpend) },
    { label: 'Purchases', value: purchaseCount.toString() },
    { label: 'Most Recent Purchase', value: recentDateDisplay },
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
