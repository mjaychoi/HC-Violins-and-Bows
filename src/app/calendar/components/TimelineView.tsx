'use client';

import React, { useMemo, useState, useCallback } from 'react';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  addWeeks,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { MaintenanceTask } from '@/types';
import { parseYMDLocal, taskDayKey } from '@/utils/dateParsing';
import { parseISO, isValid } from 'date-fns';
import { getDateStatus } from '@/utils/tasks/style';

interface TimelineViewProps {
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

export default function TimelineView({
  currentDate,
  tasks,
  instruments,
  onSelectEvent,
  onNavigate: _onNavigate,
}: TimelineViewProps) {
  // onNavigate reserved for future enhancements
  void _onNavigate;
  const [weekOffset, setWeekOffset] = useState(0);

  const weekRange = useMemo(() => {
    // Explicitly set weekStartsOn to 0 (Sunday) for consistency
    const weekStart = startOfWeek(addWeeks(currentDate, weekOffset), {
      weekStartsOn: 0,
    });
    const weekEnd = endOfWeek(addWeeks(currentDate, weekOffset), {
      weekStartsOn: 0,
    });
    return { weekStart, weekEnd };
  }, [currentDate, weekOffset]);

  const days = useMemo(() => {
    return eachDayOfInterval({
      start: weekRange.weekStart,
      end: weekRange.weekEnd,
    });
  }, [weekRange]);

  // FIXED: Only extract time if task date has time component (timestamp)
  // For date-only strings, use default 9:00 AM for visibility
  // Note: This function is used in useMemo, so it must be defined before useMemo
  const getTaskTime = useCallback(
    (task: MaintenanceTask): { hour: number; minute: number } => {
      // FIXED: Use correct date priority: due_date > personal_due_date > scheduled_date
      const taskDate =
        task.due_date || task.personal_due_date || task.scheduled_date;
      if (!taskDate) return { hour: 9, minute: 0 };

      // Check if date string includes time component
      const hasTime = taskDate.includes('T');
      if (!hasTime) {
        // Date-only: use default time
        return { hour: 9, minute: 0 };
      }

      try {
        // Has time: extract from parsed date
        let date: Date | null = parseYMDLocal(taskDate);
        if (!date) {
          const isoDate = parseISO(taskDate);
          date = isValid(isoDate) ? isoDate : null;
        }
        if (!date) return { hour: 9, minute: 0 };
        return { hour: date.getHours(), minute: date.getMinutes() };
      } catch {
        return { hour: 9, minute: 0 };
      }
    },
    []
  );

  // FIXED: Build dayKey → hour → tasks map for O(1) hour lookup
  // FIXED: Use parseYMDLocal for consistent date parsing strategy
  const tasksByDayHour = useMemo(() => {
    const map = new Map<string, Map<number, MaintenanceTask[]>>();

    // Build map of all tasks by day key and hour
    for (const task of tasks) {
      // FIXED: Use correct date priority: due_date > personal_due_date > scheduled_date
      const raw =
        task.due_date || task.personal_due_date || task.scheduled_date;
      if (!raw) continue;

      const dayKey = taskDayKey(raw);
      const { hour } = getTaskTime(task);

      let dayMap = map.get(dayKey);
      if (!dayMap) {
        dayMap = new Map<number, MaintenanceTask[]>();
        map.set(dayKey, dayMap);
      }

      const hourTasks = dayMap.get(hour) ?? [];
      hourTasks.push(task);
      dayMap.set(hour, hourTasks);
    }

    // Keep only visible week days (optional optimization)
    const visibleKeys = new Set(
      days.map(d => taskDayKey(format(d, 'yyyy-MM-dd')))
    );
    for (const k of Array.from(map.keys())) {
      if (!visibleKeys.has(k)) map.delete(k);
    }

    return map;
  }, [tasks, days, getTaskTime]);

  const hours = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => i);
  }, []);

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
    <div className="timeline-view p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {format(weekRange.weekStart, 'MMMM d, yyyy')} -{' '}
            {format(weekRange.weekEnd, 'MMMM d, yyyy')}
          </h2>
        </div>
        <div role="group" aria-label="Week navigation" className="flex gap-2">
          <button
            onClick={() => setWeekOffset(prev => prev - 1)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            aria-label="Previous week"
          >
            Previous Week
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            aria-label="Go to current week"
          >
            Today
          </button>
          <button
            onClick={() => setWeekOffset(prev => prev + 1)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            aria-label="Next week"
          >
            Next Week
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-full">
            {/* Header */}
            <div className="grid grid-cols-8 border-b border-gray-200 bg-gray-50">
              <div className="p-3 text-sm font-semibold text-gray-700 border-r border-gray-200">
                Time
              </div>
              {days.map(day => {
                const isToday = isSameDay(day, new Date());
                return (
                  <div
                    key={day.toISOString()}
                    className={`p-3 text-sm font-semibold text-center border-r border-gray-200 last:border-r-0 ${
                      isToday ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                    }`}
                  >
                    <div>{format(day, 'EEE', { locale: ko })}</div>
                    <div className="text-xs mt-1">
                      {format(day, 'M/d', { locale: ko })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Timeline */}
            <div className="divide-y divide-gray-200">
              {hours.map(hour => (
                <div key={hour} className="grid grid-cols-8">
                  <div className="p-2 text-xs text-gray-500 border-r border-gray-200 bg-gray-50">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                  {days.map(day => {
                    // Use taskDayKey for consistent key generation
                    const dayKey = taskDayKey(format(day, 'yyyy-MM-dd'));
                    // O(1) lookup: get hour bucket directly
                    const hourTasks =
                      tasksByDayHour.get(dayKey)?.get(hour) ?? [];
                    const isToday = isSameDay(day, new Date());

                    return (
                      <div
                        key={`${day.toISOString()}-${hour}`}
                        className={`p-1 border-r border-gray-200 last:border-r-0 min-h-[60px] ${
                          isToday ? 'bg-blue-50' : 'bg-white'
                        }`}
                      >
                        {hourTasks.map(task => {
                          const instrument = task.instrument_id
                            ? instruments?.get(task.instrument_id)
                            : undefined;
                          const dateStatus = getDateStatus(task);
                          const statusLabel =
                            task.status === 'completed'
                              ? 'Completed'
                              : task.status === 'cancelled'
                                ? 'Cancelled'
                                : dateStatus.status === 'overdue'
                                  ? 'Overdue'
                                  : task.status === 'in_progress'
                                    ? 'In Progress'
                                    : 'Scheduled';
                          return (
                            <div
                              key={task.id}
                              role="button"
                              tabIndex={0}
                              aria-label={`Task ${task.title} at ${hour}:00, ${statusLabel}`}
                              className={`${getTaskColor(task)} text-white text-xs p-1.5 rounded mb-1 cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1`}
                              onClick={() => onSelectEvent?.(task)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  onSelectEvent?.(task);
                                }
                              }}
                              title={`${task.title} - ${statusLabel} - ${instrument?.type || 'Unknown'}`}
                            >
                              <div className="font-medium truncate">
                                {task.title}
                              </div>
                              {instrument?.type && (
                                <div className="text-[10px] opacity-90 truncate">
                                  {instrument.type}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
