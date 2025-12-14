import { Instrument } from '@/types';
// ✅ FIXED: Use centralized color tokens
import { getStatusBadgeColor } from '@/utils/colorTokens';

// FIXED: Use proper type instead of loose string
interface StatusBadgeProps {
  status: Instrument['status'] | string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  // ✅ FIXED: Use centralized color tokens
  const finalClassName = getStatusBadgeColor(status);

  const iconMap = {
    Available: '✅',
    Sold: '💰',
    Reserved: '🔒',
    Maintenance: '🔧',
    Booked: '📅',
  } as const;

  const icon = iconMap[status as keyof typeof iconMap] ?? '❓';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${finalClassName}`}
      aria-label={`Status: ${status}`}
      title={`Status: ${status}`}
    >
      {/* FIXED: Mark emoji as decorative for better accessibility */}
      <span aria-hidden="true">{icon}</span>
      {status}
    </span>
  );
}
