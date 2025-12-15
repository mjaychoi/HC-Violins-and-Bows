'use client';

import React from 'react';
import { getStatusPillClasses } from '@/utils/tasks/style';
import type { MaintenanceTask } from '@/types';

interface StatusPillProps {
  task: MaintenanceTask;
  isOverdue: boolean;
  isUpcoming: boolean;
}

export default function StatusPill({
  task,
  isOverdue,
  isUpcoming,
}: StatusPillProps) {
  // Don't show pill for completed tasks (shown as text instead)
  if (task.status === 'completed') {
    return null;
  }

  // Only show prominent pills for action-required statuses
  const showPill = isOverdue || isUpcoming || task.status === 'in_progress';

  if (!showPill) {
    return null;
  }

  const statusText = task.status.replace('_', ' ');

  return (
    <span
      className={`px-2.5 py-1 rounded-md text-xs font-medium ${getStatusPillClasses(
        task.status,
        {
          isOverdue,
          isUpcoming,
          task,
        }
      )}`}
    >
      {statusText}
    </span>
  );
}
