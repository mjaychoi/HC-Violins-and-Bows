'use client';

import React from 'react';
import { getStatusPillClasses } from '@/utils/tasks/style';
import { getStatusLabel } from '@/utils/calendar';
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
  // But add sr-only text for screen readers
  if (task.status === 'completed') {
    return (
      <span className="sr-only" aria-label="Status: Completed">
        Completed
      </span>
    );
  }

  // Only show prominent pills for action-required statuses
  const showPill = isOverdue || isUpcoming || task.status === 'in_progress';

  if (!showPill) {
    return null;
  }

  // Use centralized status label mapping
  const statusText = getStatusLabel(task.status);

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
