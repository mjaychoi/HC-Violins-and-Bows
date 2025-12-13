import { Instrument } from '@/types';

// FIXED: Use proper type instead of loose string
interface StatusBadgeProps {
  status: Instrument['status'] | string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const statusMap = {
    Available: 'bg-green-50 text-green-700 ring-1 ring-green-100',
    Sold: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
    Reserved: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
    Maintenance: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
    Booked: 'bg-purple-50 text-purple-700 ring-1 ring-purple-100',
  } as const;

  const iconMap = {
    Available: '✅',
    Sold: '💰',
    Reserved: '🔒',
    Maintenance: '🔧',
    Booked: '📅',
  } as const;

  const icon = iconMap[status as keyof typeof iconMap] ?? '❓';
  const className =
    statusMap[status as keyof typeof statusMap] ||
    'bg-gray-50 text-gray-700 ring-1 ring-gray-100';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${className}`}
      aria-label={`Status: ${status}`}
      title={`Status: ${status}`}
    >
      {/* FIXED: Mark emoji as decorative for better accessibility */}
      <span aria-hidden="true">{icon}</span>
      {status}
    </span>
  );
}
