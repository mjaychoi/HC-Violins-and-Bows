import React from 'react';
import { getInterestColor } from '@/utils/colorTokens';

export interface InterestBadgeProps {
  interest: string | null;
  /** 컨텍스트: table(기본), card */
  context?: 'table' | 'card';
}

function InterestBadge({ interest, context = 'table' }: InterestBadgeProps) {
  if (!interest) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-gray-400 bg-gray-50 border border-gray-100">
        No interest
      </span>
    );
  }

  const variant = context === 'card' ? 'solid' : 'muted';
  const className = getInterestColor(interest, variant);

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className} max-w-[150px] truncate`}
      aria-label={`Interest: ${interest}`}
      title={`Interest: ${interest}`}
    >
      {interest}
    </span>
  );
}

export default React.memo(InterestBadge);
