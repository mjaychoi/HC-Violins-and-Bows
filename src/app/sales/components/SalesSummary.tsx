import { SalesTotals } from '../types';
import { currency } from '../utils/salesFormatters';

// Compact formatter for KPI cards
function formatCurrencyCompact(amount: number): string {
  if (amount === 0) return '$0';
  const absAmount = Math.abs(amount);

  if (absAmount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (absAmount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return currency.format(amount);
}

interface SummaryCardProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  color?: 'green' | 'blue' | 'purple' | 'red' | 'orange';
  period?: string;
  isSubtle?: boolean; // For secondary KPIs (Refunded, Refund Rate)
}

function SummaryCard({
  label,
  value,
  icon,
  color = 'blue',
  period,
  title, // For hover tooltip showing exact value
  isSubtle = false,
}: SummaryCardProps & { title?: string }) {
  const colorClasses = {
    green: 'bg-green-50 border-green-200 text-green-600',
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    purple: 'bg-purple-50 border-purple-200 text-purple-600',
    red: 'bg-red-50 border-red-200 text-red-600',
    orange: 'bg-orange-50 border-orange-200 text-orange-600',
  };

  // Subtle styling for secondary KPIs
  const subtleClasses = isSubtle
    ? 'bg-neutral-50 border-neutral-200'
    : 'bg-white border-gray-200';

  return (
    <div className={`${subtleClasses} border rounded-lg shadow-sm p-4`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div
            className={`text-xs font-medium uppercase tracking-wide ${
              isSubtle ? 'text-gray-400' : 'text-gray-500'
            }`}
          >
            {label}
          </div>
          {period && (
            <div className="text-xs text-gray-400 mt-0.5">{period}</div>
          )}
        </div>
        {icon && (
          <div
            className={`p-2 rounded-lg ${colorClasses[color]} ${
              isSubtle ? 'opacity-60' : ''
            }`}
          >
            {icon}
          </div>
        )}
      </div>
      <div
        className={`text-xl font-semibold ${isSubtle ? 'text-gray-600' : 'text-gray-900'}`}
        title={title}
      >
        {value}
      </div>
    </div>
  );
}

interface SalesSummaryProps {
  totals: SalesTotals;
  period: string;
}

export default function SalesSummary({ totals, period }: SalesSummaryProps) {
  return (
    <div className="space-y-4">
      {/* Primary KPIs: Revenue, Orders, Avg Ticket */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryCard
          label="Revenue"
          value={formatCurrencyCompact(totals.revenue)}
          title={currency.format(totals.revenue)}
          period={period}
          icon={
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
          color="green"
        />
        <SummaryCard
          label="Orders"
          value={totals.count.toLocaleString('en-US')}
          period={period}
          icon={
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          }
          color="blue"
        />
        <SummaryCard
          label="Avg. Ticket"
          value={formatCurrencyCompact(totals.avgTicket)}
          title={currency.format(totals.avgTicket)}
          period={period}
          icon={
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          }
          color="purple"
        />
      </div>

      {/* Secondary KPIs: Refunded, Refund Rate (subtle) */}
      {(totals.refund > 0 || totals.refundRate > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SummaryCard
            label="Refunded"
            value={formatCurrencyCompact(totals.refund)}
            title={currency.format(totals.refund)}
            period={period}
            icon={
              <svg
                className="w-4 h-4 opacity-60"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            }
            color="red"
            isSubtle={true}
          />
          {totals.refundRate > 0 && (
            <SummaryCard
              label="Refund Rate"
              value={`${totals.refundRate}%`}
              period={period}
              icon={
                <svg
                  className="w-4 h-4 opacity-60"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              }
              color="orange"
              isSubtle={true}
            />
          )}
        </div>
      )}
    </div>
  );
}
