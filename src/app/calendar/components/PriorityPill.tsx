'use client';

import React from 'react';

interface PriorityPillProps {
  priority: string;
}

export default function PriorityPill({ priority }: PriorityPillProps) {
  // Priority color policy: urgent only gets red, others are gray
  const isUrgent = priority.toLowerCase() === 'urgent';

  return (
    <span
      className={`px-2.5 py-1 rounded-md text-xs font-medium ${
        isUrgent
          ? 'bg-red-50 border border-red-200 text-red-700 font-semibold'
          : 'bg-gray-100 border border-gray-200 text-gray-600'
      }`}
    >
      {priority}
    </span>
  );
}
