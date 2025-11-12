'use client';

import React, { useMemo, useState } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addWeeks, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { MaintenanceTask } from '@/types';

interface TimelineViewProps {
  currentDate: Date;
  tasks: MaintenanceTask[];
  instruments?: Map<string, { 
    type: string | null; 
    maker: string | null; 
    ownership: string | null;
  }>;
  onSelectEvent?: (task: MaintenanceTask) => void;
  onNavigate?: (date: Date) => void;
}

export default function TimelineView({
  currentDate,
  tasks,
  instruments,
  onSelectEvent,
  onNavigate,
}: TimelineViewProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  
  const weekRange = useMemo(() => {
    const weekStart = startOfWeek(addWeeks(currentDate, weekOffset), { locale: ko });
    const weekEnd = endOfWeek(addWeeks(currentDate, weekOffset), { locale: ko });
    return { weekStart, weekEnd };
  }, [currentDate, weekOffset]);

  const days = useMemo(() => {
    return eachDayOfInterval({ start: weekRange.weekStart, end: weekRange.weekEnd });
  }, [weekRange]);

  const tasksByDay = useMemo(() => {
    const tasksMap = new Map<string, MaintenanceTask[]>();
    
    days.forEach(day => {
      const dayKey = format(day, 'yyyy-MM-dd');
      const dayTasks = tasks.filter(task => {
        const taskDate = task.scheduled_date || task.due_date || task.personal_due_date;
        if (!taskDate) return false;
        try {
          const taskDateObj = parseISO(taskDate);
          return isSameDay(taskDateObj, day);
        } catch {
          return false;
        }
      });
      tasksMap.set(dayKey, dayTasks);
    });
    
    return tasksMap;
  }, [days, tasks]);

  const hours = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => i);
  }, []);

  const getTaskColor = (task: MaintenanceTask): string => {
    if (task.status === 'completed') return 'bg-green-500';
    if (task.status === 'cancelled') return 'bg-gray-400';
    if (task.priority === 'urgent') return 'bg-red-500';
    if (task.priority === 'high') return 'bg-orange-500';
    if (task.priority === 'medium') return 'bg-yellow-500';
    if (task.priority === 'low') return 'bg-blue-500';
    return 'bg-gray-500';
  };

  const getTaskTime = (task: MaintenanceTask): { hour: number; minute: number } => {
    const taskDate = task.scheduled_date || task.due_date || task.personal_due_date;
    if (!taskDate) return { hour: 9, minute: 0 };
    try {
      const date = parseISO(taskDate);
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
            {format(weekRange.weekStart, 'yyyy년 M월 d일', { locale: ko })} - {format(weekRange.weekEnd, 'M월 d일', { locale: ko })}
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setWeekOffset(prev => prev - 1)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            이전 주
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            오늘
          </button>
          <button
            onClick={() => setWeekOffset(prev => prev + 1)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            다음 주
          </button>
        </div>
      </div>
      
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-full">
            {/* Header */}
            <div className="grid grid-cols-8 border-b border-gray-200 bg-gray-50">
              <div className="p-3 text-sm font-semibold text-gray-700 border-r border-gray-200">
                시간
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
                    <div className="text-xs mt-1">{format(day, 'M/d', { locale: ko })}</div>
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
                          const instrument = task.instrument_id ? instruments?.get(task.instrument_id) : undefined;
                          return (
                            <div
                              key={task.id}
                              className={`${getTaskColor(task)} text-white text-xs p-1.5 rounded mb-1 cursor-pointer hover:opacity-80 transition-opacity`}
                              onClick={() => onSelectEvent?.(task)}
                              title={`${task.title} - ${instrument?.type || 'Unknown'}`}
                            >
                              <div className="font-medium truncate">{task.title}</div>
                              {instrument?.type && (
                                <div className="text-[10px] opacity-90 truncate">{instrument.type}</div>
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

