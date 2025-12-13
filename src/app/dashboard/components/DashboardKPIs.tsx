'use client';

import React from 'react';
import { Instrument, ClientInstrument } from '@/types';
import { formatInstrumentPrice } from '../utils/dashboardUtils';

interface DashboardKPIsProps {
  instruments: Instrument[];
  clientRelationships: ClientInstrument[];
}

/**
 * Format large numbers with compact notation (e.g., $10.0M, $407.7K)
 * Falls back to regular formatting for smaller numbers
 */
function formatPriceCompact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '$0';

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numAmount)) return '$0';

  // For amounts >= 1M, use M notation
  if (Math.abs(numAmount) >= 1000000) {
    return `$${(numAmount / 1000000).toFixed(1)}M`;
  }
  // For amounts >= 1K, use K notation
  if (Math.abs(numAmount) >= 1000) {
    return `$${(numAmount / 1000).toFixed(1)}K`;
  }
  // Otherwise use regular formatting
  return formatInstrumentPrice(numAmount);
}

export default function DashboardKPIs({
  instruments,
  clientRelationships,
}: DashboardKPIsProps) {
  // Calculate statistics
  const stats = React.useMemo(() => {
    // Total value: sum of all prices
    const totalValue = instruments.reduce((sum, item) => {
      const price =
        typeof item.price === 'string' ? parseFloat(item.price) : item.price;
      return sum + (price || 0);
    }, 0);

    // Available value: sum of prices for Available items
    const availableValue = instruments
      .filter(item => item.status === 'Available')
      .reduce((sum, item) => {
        const price =
          typeof item.price === 'string' ? parseFloat(item.price) : item.price;
        return sum + (price || 0);
      }, 0);

    // Items in maintenance: count of Maintenance status items
    const itemsInMaintenance = instruments.filter(
      item => item.status === 'Maintenance'
    ).length;

    // Sold this month: count of items with Sold relationship created this month
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const soldThisMonth = clientRelationships.filter(rel => {
      if (rel.relationship_type !== 'Sold') return false;
      if (!rel.created_at) return false;

      const createdDate = new Date(rel.created_at);
      return (
        createdDate.getMonth() === currentMonth &&
        createdDate.getFullYear() === currentYear
      );
    }).length;

    return {
      totalValue,
      availableValue,
      itemsInMaintenance,
      soldThisMonth,
    };
  }, [instruments, clientRelationships]);

  return (
    <div className="mb-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Value */}
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Total Value
            </span>
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">
              {formatPriceCompact(stats.totalValue)}
            </span>
            <span className="text-xs text-gray-500 hidden sm:inline">
              ({formatInstrumentPrice(stats.totalValue)})
            </span>
          </div>
        </div>

        {/* Available Value */}
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-green-700 uppercase tracking-wide">
              Available Value
            </span>
            <svg
              className="w-5 h-5 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-green-700">
              {formatPriceCompact(stats.availableValue)}
            </span>
            <span className="text-xs text-green-600 hidden sm:inline">
              ({formatInstrumentPrice(stats.availableValue)})
            </span>
          </div>
        </div>

        {/* Items in Maintenance */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">
              In Maintenance
            </span>
            <svg
              className="w-5 h-5 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-700">
              {stats.itemsInMaintenance}
            </span>
            <span className="text-xs text-blue-600">items</span>
          </div>
        </div>

        {/* Sold This Month */}
        <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-purple-700 uppercase tracking-wide">
              Sold This Month
            </span>
            <svg
              className="w-5 h-5 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-purple-700">
              {stats.soldThisMonth}
            </span>
            <span className="text-xs text-purple-600">items</span>
          </div>
        </div>
      </div>
    </div>
  );
}
