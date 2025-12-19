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

  // ✅ FIXED: size="sm"일 때 아이콘 숨김 (테이블에서 시각 잡음 감소)
  const showIcon = size !== 'sm';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ${paddingClasses} ${finalClassName} ${size === 'sm' ? 'max-w-[120px] truncate' : ''}`}
      aria-label={`Status: ${status}`}
      title={`Status: ${status}`}
    >
      {showIcon && <span aria-hidden="true">{icon}</span>}
      <span className={size === 'sm' ? 'truncate' : ''}>{status}</span>
    </span>
  );
}

export default React.memo(StatusBadge);
