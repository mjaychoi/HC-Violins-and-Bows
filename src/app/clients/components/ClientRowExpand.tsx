'use client';

import { useClientSalesData } from '../hooks/useClientKPIs';
import { CardSkeleton } from '@/components/common';

interface ClientRowExpandProps {
  clientId: string;
}

const formatAmount = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

export function ClientRowExpand({ clientId }: ClientRowExpandProps) {
  const { totalSpend, purchaseCount, lastPurchaseDate, loading } =
    useClientSalesData(clientId);

  if (loading) {
    return (
      <tr className="bg-gray-50">
        <td colSpan={7} className="px-6 py-4">
          <CardSkeleton count={1} />
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-gray-50 border-t border-gray-200">
      <td colSpan={7} className="px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-xs font-medium text-gray-500 mb-1">
              Total Spend
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {formatAmount(totalSpend)}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-xs font-medium text-gray-500 mb-1">
              Purchase Count
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {purchaseCount}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="text-xs font-medium text-gray-500 mb-1">
              Last Purchase
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {lastPurchaseDate}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}
