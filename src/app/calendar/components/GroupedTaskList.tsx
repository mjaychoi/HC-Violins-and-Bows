'use client';

import React, { useMemo } from 'react';
import { MaintenanceTask } from '@/types';
import { formatDate } from '@/utils/formatUtils';
import { isToday, isTomorrow, isYesterday, parseISO, differenceInDays } from 'date-fns';

interface GroupedTaskListProps {
  tasks: MaintenanceTask[];
  instruments?: Map<string, { 
    type: string | null; 
    maker: string | null; 
    ownership: string | null;
    clientId?: string | null;
    clientName?: string | null;
  }>;
  clients?: Map<string, { 
    firstName: string;
    lastName: string;
    email?: string | null;
  }>;
  onTaskClick?: (task: MaintenanceTask) => void;
  onTaskDelete?: (taskId: string) => void;
}

interface GroupedTasks {
  date: string;
  displayDate: string;
  tasks: MaintenanceTask[];
}

export default function GroupedTaskList({ 
  tasks, 
  instruments, 
  clients,
  onTaskClick, 
  onTaskDelete 
}: GroupedTaskListProps) {
  // Group tasks by scheduled_date (or due_date if scheduled_date is not available)
  const groupedTasks = useMemo(() => {
    const groups = new Map<string, MaintenanceTask[]>();
    
    tasks.forEach(task => {
      // Use scheduled_date first, then due_date, then personal_due_date
      const dateKey = task.scheduled_date || task.due_date || task.personal_due_date || task.received_date;
      if (!dateKey) return;
      
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(task);
    });
    
    // Convert to array and sort by date
    const groupedArray: GroupedTasks[] = Array.from(groups.entries())
      .map(([date, tasks]) => {
        const dateObj = parseISO(date);
        let displayDate = formatDate(date, 'short');
        
        // Add relative date labels
        if (isToday(dateObj)) {
          displayDate = `Today - ${displayDate}`;
        } else if (isTomorrow(dateObj)) {
          displayDate = `Tomorrow - ${displayDate}`;
        } else if (isYesterday(dateObj)) {
          displayDate = `Yesterday - ${displayDate}`;
        } else {
          const daysDiff = differenceInDays(dateObj, new Date());
          if (daysDiff > 0 && daysDiff <= 7) {
            displayDate = `In ${daysDiff} days - ${displayDate}`;
          } else if (daysDiff < 0 && daysDiff >= -7) {
            displayDate = `${Math.abs(daysDiff)} days ago - ${displayDate}`;
          }
        }
        
        return {
          date,
          displayDate,
          tasks: tasks.sort((a, b) => {
            // Sort by priority (urgent > high > medium > low)
            const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
            const aPriority = priorityOrder[a.priority] || 0;
            const bPriority = priorityOrder[b.priority] || 0;
            if (aPriority !== bPriority) return bPriority - aPriority;
            
            // Then by task type
            return a.task_type.localeCompare(b.task_type);
          }),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    
    return groupedArray;
  }, [tasks]);


  // Get relative date display with color indication
  const getRelativeDateDisplay = (date: string): { text: string; color: string; bgColor: string; isOverdue: boolean; isUpcoming: boolean } => {
    const dateObj = parseISO(date);
    const daysDiff = differenceInDays(dateObj, new Date());
    const isOverdue = daysDiff < 0 && dateObj < new Date();
    const isUpcoming = daysDiff > 0 && daysDiff <= 3;
    
    let text = '';
    let color = 'text-gray-700';
    let bgColor = 'bg-gray-50';
    
    if (isToday(dateObj)) {
      text = 'Today';
      color = 'text-blue-700';
      bgColor = 'bg-blue-50';
    } else if (isTomorrow(dateObj)) {
      text = 'Tomorrow';
      color = 'text-amber-700';
      bgColor = 'bg-amber-50';
    } else if (isYesterday(dateObj)) {
      text = 'Yesterday';
      color = 'text-gray-600';
      bgColor = 'bg-gray-100';
    } else if (daysDiff > 0 && daysDiff <= 7) {
      text = `In ${daysDiff} days`;
      if (daysDiff <= 3) {
        color = 'text-amber-700';
        bgColor = 'bg-amber-50';
      } else {
        color = 'text-gray-700';
        bgColor = 'bg-gray-50';
      }
    } else if (daysDiff < 0 && daysDiff >= -7) {
      text = `${Math.abs(daysDiff)} days ago`;
      color = 'text-red-700';
      bgColor = 'bg-red-50';
    } else {
      text = formatDate(date, 'short');
      color = 'text-gray-700';
      bgColor = 'bg-gray-50';
    }
    
    return { text, color, bgColor, isOverdue, isUpcoming };
  };

  // Get date status (overdue, upcoming, normal)
  const getDateStatus = (task: MaintenanceTask): { status: 'overdue' | 'upcoming' | 'normal'; days: number } => {
    const now = new Date();
    let targetDate: string | null = null;
    
    // Priority: due_date > personal_due_date > scheduled_date
    if (task.due_date) {
      targetDate = task.due_date;
    } else if (task.personal_due_date) {
      targetDate = task.personal_due_date;
    } else if (task.scheduled_date) {
      targetDate = task.scheduled_date;
    }
    
    if (!targetDate) {
      return { status: 'normal', days: 0 };
    }
    
    const dateObj = parseISO(targetDate);
    const daysDiff = differenceInDays(dateObj, now);
    
    // If task is completed or cancelled, it's normal
    if (task.status === 'completed' || task.status === 'cancelled') {
      return { status: 'normal', days: daysDiff };
    }
    
    if (daysDiff < 0) {
      return { status: 'overdue', days: Math.abs(daysDiff) };
    } else if (daysDiff <= 3) {
      return { status: 'upcoming', days: daysDiff };
    }
    
    return { status: 'normal', days: daysDiff };
  };

  // Enhanced priority color with stronger distinction
  const getPriorityColorEnhanced = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return {
          bg: 'bg-red-100',
          text: 'text-red-800',
          border: 'border-red-300',
          dot: 'bg-red-500',
        };
      case 'high':
        return {
          bg: 'bg-orange-100',
          text: 'text-orange-800',
          border: 'border-orange-300',
          dot: 'bg-orange-500',
        };
      case 'medium':
        return {
          bg: 'bg-yellow-100',
          text: 'text-yellow-800',
          border: 'border-yellow-300',
          dot: 'bg-yellow-500',
        };
      case 'low':
        return {
          bg: 'bg-green-100',
          text: 'text-green-800',
          border: 'border-green-300',
          dot: 'bg-green-500',
        };
      default:
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-800',
          border: 'border-gray-300',
          dot: 'bg-gray-500',
        };
    }
  };

  // Enhanced status color with stronger distinction
  const getStatusColorEnhanced = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          bg: 'bg-green-100',
          text: 'text-green-800',
          border: 'border-green-300',
          dot: 'bg-green-500',
        };
      case 'in_progress':
        return {
          bg: 'bg-blue-100',
          text: 'text-blue-800',
          border: 'border-blue-300',
          dot: 'bg-blue-500',
        };
      case 'pending':
        return {
          bg: 'bg-yellow-100',
          text: 'text-yellow-800',
          border: 'border-yellow-300',
          dot: 'bg-yellow-500',
        };
      case 'cancelled':
        return {
          bg: 'bg-red-100',
          text: 'text-red-800',
          border: 'border-red-300',
          dot: 'bg-red-500',
        };
      default:
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-800',
          border: 'border-gray-300',
          dot: 'bg-gray-500',
        };
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="mx-auto h-12 w-12 text-gray-400 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <h3 className="text-sm font-medium text-gray-900 mb-1">No tasks found</h3>
        <p className="text-sm text-gray-500">
          Get started by creating your first task.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="task-list">
      {groupedTasks.map(group => {
        // Create summary message for tasks on this date
        const rehairTasks = group.tasks.filter(t => t.task_type === 'rehair');
        const repairTasks = group.tasks.filter(t => t.task_type === 'repair');
        const otherTasks = group.tasks.filter(t => t.task_type !== 'rehair' && t.task_type !== 'repair');
        
        const dateObj = parseISO(group.date);
        const isTodayDate = isToday(dateObj);
        const isTomorrowDate = isTomorrow(dateObj);
        
        return (
          <div key={group.date} className="space-y-3">
            {/* Date Header with improved styling */}
            {(() => {
              const dateInfo = getRelativeDateDisplay(group.date);
              const hasOverdue = group.tasks.some(task => getDateStatus(task).status === 'overdue');
              const hasUpcoming = group.tasks.some(task => getDateStatus(task).status === 'upcoming');
              
              return (
                <div className={`flex items-center justify-between pb-2 border-b-2 ${
                  hasOverdue ? 'border-red-300' : 
                  hasUpcoming ? 'border-amber-300' : 
                  'border-gray-200'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${dateInfo.bgColor} border ${dateInfo.color === 'text-red-700' ? 'border-red-200' : dateInfo.color === 'text-amber-700' ? 'border-amber-200' : 'border-gray-200'}`}>
                      <svg
                        className={`w-4 h-4 ${dateInfo.color} shrink-0`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <h3 className={`text-lg font-semibold ${dateInfo.color}`}>
                        {dateInfo.text}
                      </h3>
                      <span className={`text-xs ${dateInfo.color} opacity-75`}>
                        ({formatDate(group.date, 'short')})
                      </span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      hasOverdue ? 'bg-red-100 text-red-700 border border-red-200' :
                      hasUpcoming ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                      'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                      {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>
                </div>
              );
            })()}
            
              {/* Summary Message */}
            {(isTodayDate || isTomorrowDate) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-3">
                <p className="text-sm font-medium text-blue-900">
                  {isTomorrowDate ? 'Tomorrow' : 'Today'}, 
                  {rehairTasks.length > 0 && (
                    <span>
                      {' '}bow{rehairTasks.length > 1 ? 's' : ''}{' '}
                      {rehairTasks.map((task, idx) => {
                        const instrument = task.instrument_id ? instruments?.get(task.instrument_id) : undefined;
                        const instrumentName = instrument?.type || instrument?.maker || 'Unknown';
                        return (
                          <React.Fragment key={task.id}>
                            <span className="font-semibold">{instrumentName}</span>
                            {idx < rehairTasks.length - 1 && <span>, </span>}
                          </React.Fragment>
                        );
                      })}
                      {' '}are scheduled for rehairing
                    </span>
                  )}
                  {repairTasks.length > 0 && (
                    <span>
                      {rehairTasks.length > 0 ? ' and ' : ' '}
                      instrument{repairTasks.length > 1 ? 's' : ''}{' '}
                      {repairTasks.map((task, idx) => {
                        const instrument = task.instrument_id ? instruments?.get(task.instrument_id) : undefined;
                        const instrumentName = instrument?.type || instrument?.maker || 'Unknown';
                        return (
                          <React.Fragment key={task.id}>
                            <span className="font-semibold">{instrumentName}</span>
                            {idx < repairTasks.length - 1 && <span>, </span>}
                          </React.Fragment>
                        );
                      })}
                      {' '}for repair
                    </span>
                  )}
                  {otherTasks.length > 0 && (
                    <span>
                      {(rehairTasks.length > 0 || repairTasks.length > 0) ? ' and ' : ' '}
                      {otherTasks.length} other {otherTasks.length === 1 ? 'task' : 'tasks'}
                    </span>
                  )}
                  .
                </p>
              </div>
            )}

            {/* Tasks */}
            <div className="space-y-3">
              {group.tasks.map(task => {
                const instrument = task.instrument_id ? instruments?.get(task.instrument_id) : undefined;
                const client = task.client_id ? clients?.get(task.client_id) : undefined;
                const dateStatus = getDateStatus(task);
                const priorityColors = getPriorityColorEnhanced(task.priority);
                const statusColors = getStatusColorEnhanced(task.status);
                
                // Determine task card border color based on status
                const getTaskBorderColor = () => {
                  if (dateStatus.status === 'overdue') {
                    return 'border-red-300 border-2';
                  } else if (dateStatus.status === 'upcoming') {
                    return 'border-amber-300 border-2';
                  } else if (task.priority === 'urgent') {
                    return 'border-red-200 border-2';
                  } else if (task.priority === 'high') {
                    return 'border-orange-200';
                  }
                  return 'border-gray-200';
                };
                
                // Determine task background color
                const getTaskBgColor = () => {
                  if (dateStatus.status === 'overdue' && task.status !== 'completed') {
                    return 'bg-red-50';
                  } else if (dateStatus.status === 'upcoming' && task.status !== 'completed') {
                    return 'bg-amber-50';
                  }
                  return 'bg-gray-50';
                };
                
                return (
                  <div
                    key={task.id}
                    data-testid={`task-${task.id}`}
                    className={`group ${getTaskBgColor()} ${getTaskBorderColor()} rounded-lg p-4 hover:bg-white hover:shadow-lg transition-all duration-200 cursor-pointer`}
                    onClick={() => onTaskClick?.(task)}
                    title={`${task.title} - ${task.status} - ${task.priority} priority${dateStatus.status === 'overdue' ? ' (OVERDUE)' : dateStatus.status === 'upcoming' ? ' (UPCOMING)' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-start gap-3 mb-3">
                          <div className="shrink-0 mt-1">
                            <div className={`w-3 h-3 rounded-full ${statusColors.dot} ring-2 ${statusColors.border.replace('border-', 'ring-')}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <h4 className="font-semibold text-gray-900 text-base">{task.title}</h4>
                              {dateStatus.status === 'overdue' && (
                                <span className="inline-flex items-center px-2 py-0.5 bg-red-600 text-white rounded-full text-xs font-bold border-2 border-red-700 animate-pulse">
                                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                  </svg>
                                  OVERDUE
                                </span>
                              )}
                              {dateStatus.status === 'upcoming' && (
                                <span className="inline-flex items-center px-2 py-0.5 bg-amber-500 text-white rounded-full text-xs font-semibold border border-amber-600">
                                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                  </svg>
                                  UPCOMING
                                </span>
                              )}
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border-2 ${priorityColors.bg} ${priorityColors.text} ${priorityColors.border}`}
                                title={`Priority: ${task.priority}`}
                              >
                                <span className={`w-1.5 h-1.5 ${priorityColors.dot} rounded-full mr-1.5`}></span>
                                {task.priority.toUpperCase()}
                              </span>
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusColors.bg} ${statusColors.text} ${statusColors.border}`}
                                title={`Status: ${task.status.replace('_', ' ')}`}
                              >
                                <span className={`w-1.5 h-1.5 ${statusColors.dot} rounded-full mr-1.5`}></span>
                                {task.status.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                            
                            {/* Instrument Info */}
                            {instrument && (
                              <div className="flex items-center gap-2 flex-wrap text-sm mb-2">
                                <div className="flex items-center gap-2 text-gray-600">
                                  <svg
                                    className="w-4 h-4 text-gray-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                                    />
                                  </svg>
                                  <span className="font-medium">{instrument.type || 'Unknown'}</span>
                                  {instrument.maker && (
                                    <>
                                      <span className="text-gray-300">•</span>
                                      <span>{instrument.maker}</span>
                                    </>
                                  )}
                                </div>
                                {instrument.ownership && (
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-200">
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                      />
                                    </svg>
                                    <span>{instrument.ownership}</span>
                                    {instrument.clientName && instrument.clientName !== instrument.ownership && (
                                      <span className="text-blue-500">({instrument.clientName})</span>
                                    )}
                                  </div>
                                )}
                                {client && (
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-medium border border-purple-200">
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                      />
                                    </svg>
                                    <span>{client.firstName} {client.lastName}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Date Information - Improved UI with relative dates and colors */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm mb-3">
                              {task.received_date && (() => {
                                const receivedInfo = getRelativeDateDisplay(task.received_date);
                                const isReceivedOverdue = parseISO(task.received_date) < new Date();
                                return (
                                  <div 
                                    className={`flex items-center gap-2 p-2.5 rounded-md border ${receivedInfo.bgColor} ${isReceivedOverdue ? 'border-red-200' : 'border-gray-200'}`}
                                    title={`Received: ${formatDate(task.received_date, 'long')} (${receivedInfo.text})`}
                                  >
                                    <svg
                                      className={`w-4 h-4 ${receivedInfo.color} shrink-0`}
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                      />
                                    </svg>
                                    <div className="flex-1 min-w-0">
                                      <div className={`text-xs font-medium ${receivedInfo.color}`}>Received</div>
                                      <div className={`font-semibold ${receivedInfo.color}`}>{formatDate(task.received_date, 'short')}</div>
                                      {receivedInfo.text !== formatDate(task.received_date, 'short') && (
                                        <div className="text-xs opacity-75">{receivedInfo.text}</div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                              
                              {task.due_date && (() => {
                                const dueInfo = getRelativeDateDisplay(task.due_date);
                                const dueDateObj = parseISO(task.due_date);
                                const isDueOverdue = dueDateObj < new Date() && task.status !== 'completed';
                                const isDueUpcoming = differenceInDays(dueDateObj, new Date()) > 0 && differenceInDays(dueDateObj, new Date()) <= 3;
                                return (
                                  <div 
                                    className={`flex items-center gap-2 p-2.5 rounded-md border-2 ${
                                      isDueOverdue ? 'bg-red-100 border-red-300' :
                                      isDueUpcoming ? 'bg-amber-100 border-amber-300' :
                                      'bg-blue-50 border-blue-200'
                                    }`}
                                    title={`Due (Customer): ${formatDate(task.due_date, 'long')} (${dueInfo.text})${isDueOverdue ? ' - OVERDUE!' : isDueUpcoming ? ' - UPCOMING!' : ''}`}
                                  >
                                    <svg
                                      className={`w-4 h-4 shrink-0 ${
                                        isDueOverdue ? 'text-red-600' :
                                        isDueUpcoming ? 'text-amber-600' :
                                        'text-blue-600'
                                      }`}
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                    <div className="flex-1 min-w-0">
                                      <div className={`text-xs font-semibold ${
                                        isDueOverdue ? 'text-red-700' :
                                        isDueUpcoming ? 'text-amber-700' :
                                        'text-blue-700'
                                      }`}>
                                        Due (Customer)
                                        {isDueOverdue && <span className="ml-1 font-bold">⚠️</span>}
                                        {isDueUpcoming && !isDueOverdue && <span className="ml-1">⏰</span>}
                                      </div>
                                      <div className={`font-bold ${
                                        isDueOverdue ? 'text-red-900' :
                                        isDueUpcoming ? 'text-amber-900' :
                                        'text-blue-900'
                                      }`}>{formatDate(task.due_date, 'short')}</div>
                                      {dueInfo.text !== formatDate(task.due_date, 'short') && (
                                        <div className={`text-xs font-medium ${
                                          isDueOverdue ? 'text-red-600' :
                                          isDueUpcoming ? 'text-amber-600' :
                                          'text-blue-600'
                                        }`}>{dueInfo.text}</div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                              
                              {task.personal_due_date && (() => {
                                const personalInfo = getRelativeDateDisplay(task.personal_due_date);
                                const personalDateObj = parseISO(task.personal_due_date);
                                const isPersonalOverdue = personalDateObj < new Date() && task.status !== 'completed';
                                const isPersonalUpcoming = differenceInDays(personalDateObj, new Date()) > 0 && differenceInDays(personalDateObj, new Date()) <= 3;
                                return (
                                  <div 
                                    className={`flex items-center gap-2 p-2.5 rounded-md border-2 ${
                                      isPersonalOverdue ? 'bg-red-100 border-red-300' :
                                      isPersonalUpcoming ? 'bg-amber-100 border-amber-300' :
                                      'bg-amber-50 border-amber-200'
                                    }`}
                                    title={`Personal Due: ${formatDate(task.personal_due_date, 'long')} (${personalInfo.text})${isPersonalOverdue ? ' - OVERDUE!' : isPersonalUpcoming ? ' - UPCOMING!' : ''}`}
                                  >
                                    <svg
                                      className={`w-4 h-4 shrink-0 ${
                                        isPersonalOverdue ? 'text-red-600' :
                                        isPersonalUpcoming ? 'text-amber-600' :
                                        'text-amber-500'
                                      }`}
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                    <div className="flex-1 min-w-0">
                                      <div className={`text-xs font-semibold ${
                                        isPersonalOverdue ? 'text-red-700' :
                                        isPersonalUpcoming ? 'text-amber-700' :
                                        'text-amber-600'
                                      }`}>
                                        Personal Due
                                        {isPersonalOverdue && <span className="ml-1 font-bold">⚠️</span>}
                                        {isPersonalUpcoming && !isPersonalOverdue && <span className="ml-1">⏰</span>}
                                      </div>
                                      <div className={`font-bold ${
                                        isPersonalOverdue ? 'text-red-900' :
                                        isPersonalUpcoming ? 'text-amber-900' :
                                        'text-amber-900'
                                      }`}>{formatDate(task.personal_due_date, 'short')}</div>
                                      {personalInfo.text !== formatDate(task.personal_due_date, 'short') && (
                                        <div className={`text-xs font-medium ${
                                          isPersonalOverdue ? 'text-red-600' :
                                          isPersonalUpcoming ? 'text-amber-600' :
                                          'text-amber-600'
                                        }`}>{personalInfo.text}</div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                              
                              {task.scheduled_date && (() => {
                                const scheduledInfo = getRelativeDateDisplay(task.scheduled_date);
                                const scheduledDateObj = parseISO(task.scheduled_date);
                                const isScheduledUpcoming = isToday(scheduledDateObj) || isTomorrow(scheduledDateObj);
                                return (
                                  <div 
                                    className={`flex items-center gap-2 p-2.5 rounded-md border-2 ${
                                      isScheduledUpcoming ? 'bg-green-100 border-green-300' :
                                      'bg-green-50 border-green-200'
                                    }`}
                                    title={`Scheduled: ${formatDate(task.scheduled_date, 'long')} (${scheduledInfo.text})${isScheduledUpcoming ? ' - TODAY/TOMORROW!' : ''}`}
                                  >
                                    <svg
                                      className={`w-4 h-4 shrink-0 ${
                                        isScheduledUpcoming ? 'text-green-600' :
                                        'text-green-500'
                                      }`}
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                      />
                                    </svg>
                                    <div className="flex-1 min-w-0">
                                      <div className={`text-xs font-semibold ${
                                        isScheduledUpcoming ? 'text-green-700' :
                                        'text-green-600'
                                      }`}>
                                        Scheduled
                                        {isScheduledUpcoming && <span className="ml-1">📅</span>}
                                      </div>
                                      <div className={`font-bold ${
                                        isScheduledUpcoming ? 'text-green-900' :
                                        'text-green-900'
                                      }`}>{formatDate(task.scheduled_date, 'short')}</div>
                                      {scheduledInfo.text !== formatDate(task.scheduled_date, 'short') && (
                                        <div className={`text-xs font-medium ${
                                          isScheduledUpcoming ? 'text-green-600' :
                                          'text-green-600'
                                        }`}>{scheduledInfo.text}</div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Task Type */}
                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                              <svg
                                className="w-4 h-4 text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                                />
                              </svg>
                              <span className="font-medium">Type:</span>
                              <span className="capitalize">{task.task_type}</span>
                            </div>

                            {/* Description */}
                            {task.description && (
                              <div className="mt-3 pt-3 border-t border-gray-200">
                                <p className="text-sm text-gray-700 line-clamp-2">{task.description}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Actions */}
                      {onTaskDelete && (
                        <button
                          data-testid={`delete-task-${task.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Are you sure you want to delete this task?')) {
                              onTaskDelete(task.id);
                            }
                          }}
                          className="shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100"
                          aria-label="Delete task"
                          title="Delete task"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

