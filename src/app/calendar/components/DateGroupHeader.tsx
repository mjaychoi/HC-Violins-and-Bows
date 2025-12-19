'use client';

import React from 'react';
import { formatDateOnly } from '@/utils/formatUtils';
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
  // Check if group contains overdue tasks (based on task's actual due_date, not group dateKey)
  // This prevents confusion when group dateKey is future but contains overdue tasks
  const overdueTasks = tasks.filter(
    task => getDateStatus(task).status === 'overdue'
  );
  const hasOverdueTasks = overdueTasks.length > 0;

  // Calculate overdue days based on group dateKey for date-based status
  // But only show overdue badge if group dateKey itself is overdue
  const groupOverdueDays = daysDiff < 0 ? Math.abs(daysDiff) : 0;
  const isGroupOverdue = groupOverdueDays > 0;

  let statusText = '';
  let statusColor = '';
  let statusBg = '';

  // Show overdue badge only if the group dateKey itself is overdue
  // If group contains overdue tasks but dateKey is future, show "Contains overdue tasks" instead
  if (isGroupOverdue) {
    statusText = `Overdue · ${groupOverdueDays} day${groupOverdueDays > 1 ? 's' : ''}`;
    statusColor = 'text-red-700';
    statusBg = 'bg-red-50 border-red-200';
  } else if (hasOverdueTasks) {
    // Group dateKey is not overdue, but contains overdue tasks
    statusText = 'Contains overdue tasks';
    statusColor = 'text-orange-700';
    statusBg = 'bg-orange-50 border-orange-200';
  } else if (isTodayDate) {
    statusText = 'Today';
    statusColor = 'text-green-800';
    statusBg = 'bg-green-50 border-green-200';
  } else if (isTomorrowDate) {
    statusText = 'Tomorrow';
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
  } else if (daysDiff > 7) {
    // Default for far future dates (8+ days)
    statusText = 'Upcoming';
    statusColor = 'text-gray-700';
    statusBg = 'bg-gray-50 border-gray-200';
  } else {
    // Default for far past dates (8+ days ago)
    statusText = 'Past';
    statusColor = 'text-gray-600';
    statusBg = 'bg-gray-50 border-gray-200';
  }

  const displayDate = formatDateOnly(date);
  const taskCount = tasks.length;

  // Count overdue and urgent tasks separately for accurate labeling
  const overdueCount = tasks.filter(
    task => getDateStatus(task).status === 'overdue'
  ).length;
  const urgentPriorityCount = tasks.filter(
    task =>
      task.priority === 'urgent' && getDateStatus(task).status !== 'overdue'
  ).length;

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-gray-50 border-b border-gray-200 mb-2">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-bold text-gray-900">{displayDate}</h2>
        <span
          className={`px-2.5 py-1 rounded text-xs font-semibold border ${statusColor} ${statusBg}`}
        >
          {statusText}
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span className="font-medium">
          {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
        </span>
        {(overdueCount > 0 || urgentPriorityCount > 0) && (
          <>
            <span className="text-gray-400">·</span>
            <div className="flex items-center gap-2">
              {overdueCount > 0 && (
                <span className="text-red-600 font-semibold">
                  {overdueCount} overdue
                </span>
              )}
              {overdueCount > 0 && urgentPriorityCount > 0 && (
                <span className="text-gray-400">·</span>
              )}
              {urgentPriorityCount > 0 && (
                <span className="text-red-600 font-semibold">
                  {urgentPriorityCount} urgent
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
