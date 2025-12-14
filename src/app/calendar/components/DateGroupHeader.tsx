'use client';

import React from 'react';
import { formatDate } from '@/utils/formatUtils';
import { parseYMDLocal } from '@/utils/dateParsing';
import { differenceInDays, isToday, isTomorrow } from 'date-fns';
import { getDateStatus } from '@/utils/tasks/style';
import type { MaintenanceTask } from '@/types';

interface DateGroupHeaderProps {
  date: string;
  tasks: MaintenanceTask[];
}

export default function DateGroupHeader({ date, tasks }: DateGroupHeaderProps) {
  const dateObj = parseYMDLocal(date);
  if (!dateObj) return null;

  const now = new Date();
  const daysDiff = differenceInDays(dateObj, now);
  const isTodayDate = isToday(dateObj);
  const isTomorrowDate = isTomorrow(dateObj);

  // Determine status for header pill
  let statusText = '';
  let statusColor = '';
  let statusBg = '';

  // Check if any task is overdue
  const hasOverdue = tasks.some(task => {
    const dateStatus = getDateStatus(task);
    return dateStatus.status === 'overdue';
  });

  if (hasOverdue) {
    const overdueDays = Math.abs(daysDiff);
    statusText = `🔴 Overdue · ${overdueDays} day${overdueDays > 1 ? 's' : ''}`;
    statusColor = 'text-red-700';
    statusBg = 'bg-red-50 border-red-200';
  } else if (isTodayDate) {
    statusText = '🟢 Today';
    statusColor = 'text-blue-700';
    statusBg = 'bg-blue-50 border-blue-200';
  } else if (isTomorrowDate) {
    statusText = '🟡 Tomorrow';
    statusColor = 'text-amber-700';
    statusBg = 'bg-amber-50 border-amber-200';
  } else if (daysDiff > 0 && daysDiff <= 7) {
    statusText = `In ${daysDiff} day${daysDiff > 1 ? 's' : ''}`;
    statusColor = 'text-gray-700';
    statusBg = 'bg-gray-50 border-gray-200';
  } else if (daysDiff < 0 && daysDiff >= -7) {
    statusText = `${Math.abs(daysDiff)} day${Math.abs(daysDiff) > 1 ? 's' : ''} ago`;
    statusColor = 'text-gray-600';
    statusBg = 'bg-gray-50 border-gray-200';
  }

  const displayDate = formatDate(date, 'short');
  const taskCount = tasks.length;

  return (
    <div className="flex items-center justify-between py-3 px-1 border-b border-gray-200">
      <div className="flex items-center gap-3">
        {statusText && (
          <span
            className={`px-3 py-1.5 rounded-md text-sm font-semibold border ${statusColor} ${statusBg}`}
          >
            {statusText}
          </span>
        )}
        <h2 className="text-lg font-bold text-gray-900">{displayDate}</h2>
      </div>
      <span className="text-sm font-medium text-gray-600">
        {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
      </span>
    </div>
  );
}
