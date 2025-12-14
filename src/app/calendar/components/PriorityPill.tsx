'use client';

import React from 'react';

interface PriorityPillProps {
  priority: string;
}

export default function PriorityPill({ priority }: PriorityPillProps) {
  // Priority = 회색 pill (차분한 정보 위주)
  const isUrgent = priority.toLowerCase() === 'urgent';

  return (
    <span
      className={`px-2.5 py-1 rounded-md text-xs font-medium ${
        isUrgent
          ? 'bg-gray-100 border border-gray-300 text-red-700'
          : 'bg-gray-100 border border-gray-200 text-gray-700'
      }`}
    >
      {priority}
    </span>
  );
}
