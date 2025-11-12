'use client';

import React, { useMemo } from 'react';
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { MaintenanceTask } from '@/types';

interface YearViewProps {
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

export default function YearView({
  currentDate,
  tasks,
  instruments,
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
      
      // Get tasks for this month
      const monthTasks = tasks.filter(task => {
        const taskDate = task.scheduled_date || task.due_date || task.personal_due_date;
        if (!taskDate) return false;
        try {
          const taskDateObj = parseISO(taskDate);
          return isSameMonth(taskDateObj, month);
        } catch {
          return false;
        }
      });
      
      return {
        month,
        days,
        tasks: monthTasks,
      };
    });
  }, [currentDate, tasks]);

  const getTaskColor = (task: MaintenanceTask): string => {
    if (task.status === 'completed') return 'bg-green-500';
    if (task.status === 'cancelled') return 'bg-gray-400';
    if (task.priority === 'urgent') return 'bg-red-500';
    if (task.priority === 'high') return 'bg-orange-500';
    if (task.priority === 'medium') return 'bg-yellow-500';
    if (task.priority === 'low') return 'bg-blue-500';
    return 'bg-gray-500';
  };

  return (
    <div className="year-view p-4">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900">
          {format(currentDate, 'yyyy년', { locale: ko })}
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {year.map(({ month, days, tasks: monthTasks }) => (
          <div
            key={month.toISOString()}
            className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => onNavigate?.(month)}
          >
            <div className="mb-2">
              <h3 className="text-lg font-semibold text-gray-900">
                {format(month, 'M월', { locale: ko })}
              </h3>
              <p className="text-xs text-gray-500">
                {monthTasks.length}개 작업
              </p>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['일', '월', '화', '수', '목', '금', '토'].map(day => (
                <div
                  key={day}
                  className="text-xs font-medium text-gray-500 text-center py-1"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map(day => {
                const dayTasks = monthTasks.filter(task => {
                  const taskDate = task.scheduled_date || task.due_date || task.personal_due_date;
                  if (!taskDate) return false;
                  try {
                    return isSameDay(parseISO(taskDate), day);
                  } catch {
                    return false;
                  }
                });
                const isToday = isSameDay(day, new Date());
                
                return (
                  <div
                    key={day.toISOString()}
                    className={`relative min-h-[32px] flex items-center justify-center text-xs rounded ${
                      isToday
                        ? 'bg-blue-100 text-blue-700 font-bold'
                        : isSameMonth(day, month)
                        ? 'text-gray-700 hover:bg-gray-50'
                        : 'text-gray-300'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate?.(day);
                    }}
                  >
                    <span>{format(day, 'd')}</span>
                    {dayTasks.length > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-0.5 pb-0.5">
                        {dayTasks.slice(0, 3).map((task, idx) => (
                          <div
                            key={task.id}
                            className={`w-1 h-1 rounded-full ${getTaskColor(task)}`}
                            title={task.title}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectEvent?.(task);
                            }}
                          />
                        ))}
                        {dayTasks.length > 3 && (
                          <div className="text-[8px] text-gray-500">+{dayTasks.length - 3}</div>
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

