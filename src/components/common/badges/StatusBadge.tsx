import React from 'react';
import { Instrument } from '@/types';
import { getStatusBadgeColor } from '@/utils/colorTokens';

export interface StatusBadgeProps {
  status: Instrument['status'] | string;
  /** 테이블 셀 안에서 더 컴팩트하게 쓸 때 */
  size?: 'sm' | 'md';
}

function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const finalClassName = getStatusBadgeColor(status);

  const iconMap = {
    Available: '✅',
    Sold: '💰',
    Reserved: '🔒',
    Maintenance: '🔧',
    Booked: '📅',
  } as const;

  const icon = iconMap[status as keyof typeof iconMap] ?? '❓';

  const paddingClasses =
    size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ${paddingClasses} ${finalClassName}`}
      aria-label={`Status: ${status}`}
      title={`Status: ${status}`}
    >
      <span aria-hidden="true">{icon}</span>
      {status}
    </span>
  );
}

export default React.memo(StatusBadge);
