'use client';

import React from 'react';
import { formatDate } from '@/utils/formatUtils';
import { parseYMDLocal } from '@/utils/dateParsing';
import {
  differenceInCalendarDays,
  startOfDay,
  isToday,
  isTomorrow,
} from 'date-fns';
import { getDateStatus } from '@/utils/tasks/style';
import type { MaintenanceTask } from '@/types';

interface DateGroupHeaderProps {
  date: string;
  tasks: MaintenanceTask[];
}

export default function DateGroupHeader({ date, tasks }: DateGroupHeaderProps) {
  const dateObj = parseYMDLocal(date);
  if (!dateObj) return null;

  // Use calendar days for consistent date comparison (ignores time)
  const today = startOfDay(new Date());
  const dateStart = startOfDay(dateObj);
  const daysDiff = differenceInCalendarDays(dateStart, today);
  const isTodayDate = isToday(dateObj);
  const isTomorrowDate = isTomorrow(dateObj);

  // Determine status for header pill
  let statusText = '';
  let statusColor = '';
  let statusBg = '';

  // Calculate overdue days based on task's actual due_date (not group dateKey)
  // Use the maximum overdue days from tasks that are actually overdue
  const overdueDays = Math.max(
    ...tasks.map(task => {
      const dateStatus = getDateStatus(task);
      if (dateStatus.status === 'overdue') {
        // Calculate days difference from task's due_date
        const taskDueDate = task.due_date ? parseYMDLocal(task.due_date) : null;
        if (taskDueDate) {
          const taskDueStart = startOfDay(taskDueDate);
          const taskDaysDiff = differenceInCalendarDays(taskDueStart, today);
          return Math.abs(taskDaysDiff);
        }
      }
      return 0;
    }),
    0
  );

  const hasOverdue = overdueDays > 0;

  if (hasOverdue) {
    statusText = `🔴 Overdue · ${overdueDays} day${overdueDays > 1 ? 's' : ''}`;
    statusColor = 'text-red-700';
    statusBg = 'bg-red-50 border-red-200';
  } else if (isTodayDate) {
    statusText = 'Today';
    statusColor = 'text-green-800';
    statusBg = 'bg-green-50 border-green-200';
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

  // Count urgent/overdue tasks in this group
  const urgentCount = tasks.filter(
    task =>
      task.priority === 'urgent' || getDateStatus(task).status === 'overdue'
  ).length;

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-gray-50 border-b-2 border-gray-300 mb-2">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-bold text-gray-900">{displayDate}</h2>
        {statusText && (
          <span
            className={`px-2.5 py-1 rounded text-xs font-semibold border ${statusColor} ${statusBg}`}
          >
            {statusText}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span className="font-medium">
          {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
        </span>
        {urgentCount > 0 && (
          <>
            <span className="text-gray-400">·</span>
            <span className="text-red-600 font-semibold">
              {urgentCount} urgent
            </span>
          </>
        )}
      </div>
    </div>
  );
}
