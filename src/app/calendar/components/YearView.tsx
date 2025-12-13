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
import { enUS } from 'date-fns/locale';
import { MaintenanceTask } from '@/types';
import { parseTaskDateLocal, taskDayKey } from '@/utils/dateParsing';
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
  const year = useMemo(() => {
    const yearStart = startOfYear(currentDate);
    const yearEnd = endOfYear(currentDate);
    const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });

    return months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

      // Get tasks for this month (FIXED: Use parseTaskDateLocal to avoid timezone shifts)
      const monthTasks = tasks.filter(task => {
        const taskDate =
          task.scheduled_date || task.due_date || task.personal_due_date;
        if (!taskDate) return false;
        try {
          const taskDateObj = parseTaskDateLocal(taskDate);
          return isSameMonth(taskDateObj, month);
        } catch {
          return false;
        }
      });

      // FIXED: Build dayKey → tasks map once per month (O(days * monthTasks) → O(monthTasks))
      const dayMap = new Map<string, MaintenanceTask[]>();
      for (const task of monthTasks) {
        const raw =
          task.scheduled_date || task.due_date || task.personal_due_date;
        if (!raw) continue;
        const key = taskDayKey(raw);
        const arr = dayMap.get(key) ?? [];
        arr.push(task);
        dayMap.set(key, arr);
      }

      return {
        month,
        days,
        tasks: monthTasks,
        dayMap, // Add dayMap for efficient day lookup
      };
    });
  }, [currentDate, tasks]);

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
          {format(currentDate, 'yyyy', { locale: enUS })}
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {year.map(({ month, days, tasks: monthTasks, dayMap }) => (
          <div
            key={month.toISOString()}
            className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => onNavigate?.(month)}
            role="button"
            tabIndex={0}
            aria-label={`View ${format(month, 'MMMM yyyy', { locale: enUS })}`}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNavigate?.(month);
              }
            }}
          >
            <div className="mb-3">
              <h3 className="text-base font-semibold text-gray-900">
                {format(month, 'MMMM', { locale: enUS })}
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
                // FIXED: Use dayMap for O(1) lookup instead of O(monthTasks) filter
                const dayKey = format(day, 'yyyy-MM-dd');
                const dayTasks = dayMap.get(dayKey) ?? [];
                const isToday = isSameDay(day, new Date());

                return (
                  <div
                    key={day.toISOString()}
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
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${format(day, 'MMMM d, yyyy', { locale: enUS })}${dayTasks.length > 0 ? ` - ${dayTasks.length} tasks` : ''}`}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onNavigate?.(day);
                      }
                    }}
                  >
                    <span>{format(day, 'd')}</span>
                    {dayTasks.length > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-0.5 pb-0.5 pointer-events-none">
                        {dayTasks.slice(0, 3).map(task => (
                          <div
                            key={task.id}
                            className={`w-1.5 h-1.5 rounded-full ${getTaskColor(task)} pointer-events-auto cursor-pointer`}
                            title={task.title}
                            onClick={e => {
                              e.stopPropagation();
                              onSelectEvent?.(task);
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label={`Task: ${task.title}`}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                onSelectEvent?.(task);
                              }
                            }}
                          />
                        ))}
                        {dayTasks.length > 3 && (
                          <div className="text-[8px] text-gray-500 pointer-events-auto">
                            +{dayTasks.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
