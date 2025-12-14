'use client';

import React, { useMemo, useCallback } from 'react';
import {
  format,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { MaintenanceTask } from '@/types';
import { parseYMDLocal, taskDayKey } from '@/utils/dateParsing';
import { parseISO, isValid } from 'date-fns';
import { getDateStatus } from '@/utils/tasks/style';

interface YearViewProps {
  currentDate: Date;
  tasks: MaintenanceTask[];
  instruments?: Map<
    string,
    {
      type: string | null;
      maker: string | null;
      ownership: string | null;
    }
  >;
  onSelectEvent?: (task: MaintenanceTask) => void;
  onNavigate?: (date: Date) => void;
}

export default function YearView({
  currentDate,
  tasks,
  onSelectEvent,
  onNavigate,
}: YearViewProps) {
  // FIXED: Pre-process tasks once (O(N)) instead of filtering 12 times (O(12N))
  const yearBuckets = useMemo(() => {
    const year = currentDate.getFullYear();
    const monthMap = new Map<
      string,
      {
        monthTasks: MaintenanceTask[];
        dayMap: Map<string, MaintenanceTask[]>;
      }
    >();

    // Single pass through tasks
    for (const task of tasks) {
      const raw =
        task.scheduled_date || task.due_date || task.personal_due_date;
      if (!raw) continue;

      let d: Date | null = null;
      try {
        // Try parseYMDLocal first (handles YYYY-MM-DD as local)
        d = parseYMDLocal(raw);
        // If that fails, try parseISO for timestamps
        if (!d) {
          const isoDate = parseISO(raw);
          d = isValid(isoDate) ? isoDate : null;
        }
      } catch {
        continue;
      }

      if (!d) continue;

      // Skip tasks outside current year
      if (d.getFullYear() !== year) continue;

      const monthKey = format(d, 'yyyy-MM'); // ex) 2025-01
      const dayKey = taskDayKey(raw); // ex) 2025-01-03

      const bucket = monthMap.get(monthKey) ?? {
        monthTasks: [],
        dayMap: new Map<string, MaintenanceTask[]>(),
      };
      bucket.monthTasks.push(task);

      const dayTasks = bucket.dayMap.get(dayKey) ?? [];
      dayTasks.push(task);
      bucket.dayMap.set(dayKey, dayTasks);

      monthMap.set(monthKey, bucket);
    }

    return monthMap;
  }, [tasks, currentDate]);

  const year = useMemo(() => {
    const yearStart = startOfYear(currentDate);
    const yearEnd = endOfYear(currentDate);
    const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });

    return months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

      // Get pre-processed bucket for this month
      const monthKey = format(month, 'yyyy-MM');
      const bucket = yearBuckets.get(monthKey) ?? {
        monthTasks: [],
        dayMap: new Map<string, MaintenanceTask[]>(),
      };

      return {
        month,
        days,
        tasks: bucket.monthTasks,
        dayMap: bucket.dayMap,
      };
    });
  }, [currentDate, yearBuckets]);

  const getTaskColor = useCallback((task: MaintenanceTask): string => {
    const dateStatus = getDateStatus(task);
    const isOverdue = dateStatus.status === 'overdue';
    const status = (task.status ?? '').toLowerCase();

    // Completed/Cancelled: Gray
    if (status === 'completed' || status === 'cancelled') {
      return 'bg-gray-400';
    }

    // Overdue: Red
    if (isOverdue) {
      return 'bg-red-500';
    }

    // In Progress: Blue
    if (status === 'in_progress') {
      return 'bg-blue-500';
    }

    // Scheduled/Pending: Green
    return 'bg-emerald-500';
  }, []);

  return (
    <div className="year-view">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">
          {format(currentDate, 'yyyy', { locale: ko })}
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {year.map(({ month, days, tasks: monthTasks, dayMap }) => (
          <button
            key={month.toISOString()}
            type="button"
            className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer text-left w-full"
            onClick={() => onNavigate?.(month)}
            aria-label={`View ${format(month, 'MMMM yyyy', { locale: ko })}`}
          >
            <div className="mb-3">
              <h3 className="text-base font-semibold text-gray-900">
                {format(month, 'MMMM', { locale: ko })}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {monthTasks.length} {monthTasks.length === 1 ? 'task' : 'tasks'}
              </p>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div
                  key={day}
                  className="text-xs font-medium text-gray-500 text-center py-1"
                  aria-label={day}
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map(day => {
                // FIXED: Use taskDayKey for consistent day key generation (matches dayMap keys)
                // Convert Date to string first, then use taskDayKey for consistency
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayKey = taskDayKey(dayStr);
                const dayTasks = dayMap.get(dayKey) ?? [];
                const isToday = isSameDay(day, new Date());

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={`relative min-h-[32px] flex items-center justify-center text-xs rounded transition-colors ${
                      isToday
                        ? 'bg-blue-100 text-blue-700 font-semibold'
                        : isSameMonth(day, month)
                          ? 'text-gray-700 hover:bg-gray-50'
                          : 'text-gray-300'
                    }`}
                    onClick={e => {
                      e.stopPropagation();
                      onNavigate?.(day);
                    }}
                    aria-label={`View ${format(day, 'MMMM d, yyyy', { locale: ko })}${dayTasks.length > 0 ? ` - ${dayTasks.length} tasks` : ''}`}
                  >
                    <span>{format(day, 'd')}</span>
                    {dayTasks.length > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-0.5 pb-0.5 pointer-events-none">
                        {dayTasks.slice(0, 3).map(task => (
                          <button
                            key={task.id}
                            type="button"
                            className={`w-1.5 h-1.5 rounded-full ${getTaskColor(task)} pointer-events-auto cursor-pointer`}
                            title={task.title}
                            onClick={e => {
                              e.stopPropagation();
                              onSelectEvent?.(task);
                            }}
                            aria-label={`Task: ${task.title}`}
                          />
                        ))}
                        {dayTasks.length > 3 && (
                          <div className="text-[8px] text-gray-500 pointer-events-auto">
                            +{dayTasks.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
