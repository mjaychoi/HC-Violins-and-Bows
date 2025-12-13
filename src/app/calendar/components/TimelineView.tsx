'use client';

import React, { useMemo, useState } from 'react';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  addWeeks,
} from 'date-fns';
import { enUS } from 'date-fns/locale';
import { MaintenanceTask } from '@/types';
import { parseTaskDateLocal, taskDayKey } from '@/utils/dateParsing';
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
    const weekStart = startOfWeek(addWeeks(currentDate, weekOffset), {
      locale: enUS,
    });
    const weekEnd = endOfWeek(addWeeks(currentDate, weekOffset), {
      locale: enUS,
    });
    return { weekStart, weekEnd };
  }, [currentDate, weekOffset]);

  const days = useMemo(() => {
    return eachDayOfInterval({
      start: weekRange.weekStart,
      end: weekRange.weekEnd,
    });
  }, [weekRange]);

  // FIXED: Build dayKey → tasks map once (O(N) instead of O(7 * N))
  // FIXED: Use parseTaskDateLocal to avoid timezone shifts
  const tasksByDay = useMemo(() => {
    const map = new Map<string, MaintenanceTask[]>();

    // Build map of all tasks by day key
    for (const task of tasks) {
      const raw =
        task.scheduled_date || task.due_date || task.personal_due_date;
      if (!raw) continue;

      const key = taskDayKey(raw);
      const arr = map.get(key) ?? [];
      arr.push(task);
      map.set(key, arr);
    }

    // Keep only visible week days (optional optimization)
    const visibleKeys = new Set(days.map(d => format(d, 'yyyy-MM-dd')));
    for (const k of Array.from(map.keys())) {
      if (!visibleKeys.has(k)) map.delete(k);
    }

    return map;
  }, [tasks, days]);

  const hours = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => i);
  }, []);

  const getTaskColor = (task: MaintenanceTask): string => {
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
  };

  // FIXED: Only extract time if task date has time component (timestamp)
  // For date-only strings, use default 9:00 AM for visibility
  const getTaskTime = (
    task: MaintenanceTask
  ): { hour: number; minute: number } => {
    const taskDate =
      task.scheduled_date || task.due_date || task.personal_due_date;
    if (!taskDate) return { hour: 9, minute: 0 };
    
    // Check if date string includes time component
    const hasTime = taskDate.includes('T');
    if (!hasTime) {
      // Date-only: use default time
      return { hour: 9, minute: 0 };
    }
    
    try {
      // Has time: extract from parsed date
      const date = parseTaskDateLocal(taskDate);
      return { hour: date.getHours(), minute: date.getMinutes() };
    } catch {
      return { hour: 9, minute: 0 };
    }
  };

  return (
    <div className="timeline-view p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {format(weekRange.weekStart, 'MMMM d, yyyy')} -{' '}
            {format(weekRange.weekEnd, 'MMMM d, yyyy')}
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setWeekOffset(prev => prev - 1)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Previous Week
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setWeekOffset(prev => prev + 1)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
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
                    <div>{format(day, 'EEE', { locale: enUS })}</div>
                    <div className="text-xs mt-1">
                      {format(day, 'M/d', { locale: enUS })}
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
                    const dayKey = format(day, 'yyyy-MM-dd');
                    const dayTasks = tasksByDay.get(dayKey) || [];
                    const hourTasks = dayTasks.filter(task => {
                      const { hour: taskHour } = getTaskTime(task);
                      return taskHour === hour;
                    });
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
                          return (
                            <div
                              key={task.id}
                              className={`${getTaskColor(task)} text-white text-xs p-1.5 rounded mb-1 cursor-pointer hover:opacity-80 transition-opacity`}
                              onClick={() => onSelectEvent?.(task)}
                              title={`${task.title} - ${instrument?.type || 'Unknown'}`}
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
