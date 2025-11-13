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
  const groupedTasks: GroupedTasks[] = useMemo(() => {
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

  // Instrument icon based on type
  const getInstrumentIcon = (instrumentType: string | null | undefined): string => {
    if (!instrumentType) return '🎼';
    const type = instrumentType.toLowerCase();
    if (type.includes('violin') || type.includes('바이올린')) return '🎻';
    if (type.includes('viola') || type.includes('비올라')) return '🎼';
    if (type.includes('cello') || type.includes('첼로')) return '🎼';
    if (type.includes('bass') || type.includes('베이스')) return '🎼';
    if (type.includes('bow') || type.includes('활')) return '🎵';
    return '🎼';
  };

  // Status pill color
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'pending':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Priority pill color
  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Date text color (adjusted)
  const getDateColor = (dateType: 'received' | 'due' | 'personal' | 'scheduled') => {
    switch (dateType) {
      case 'received':
        return 'text-[#2563EB]'; // 파랑
      case 'due':
        return 'text-[#D97706]'; // 주황
      case 'personal':
        return 'text-gray-700';
      case 'scheduled':
        return 'text-green-600';
      default:
        return 'text-gray-700';
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
    <div className="space-y-20" data-testid="task-list">
      {groupedTasks.map((group: GroupedTasks) => {
        // Create summary message for tasks on this date
        const rehairTasks = group.tasks.filter((t: MaintenanceTask) => t.task_type === 'rehair');
        const repairTasks = group.tasks.filter((t: MaintenanceTask) => t.task_type === 'repair');
        const otherTasks = group.tasks.filter((t: MaintenanceTask) => t.task_type !== 'rehair' && t.task_type !== 'repair');
        
        const dateObj = parseISO(group.date);
        const isTodayDate = isToday(dateObj);
        const isTomorrowDate = isTomorrow(dateObj);
        const daysDiff = differenceInDays(dateObj, new Date());
        
        return (
          <div key={group.date} className="space-y-2 pb-2">
            {/* Date Header - Improved format */}
            {(() => {
              // Format header text
              let headerText = '';
              let statusColor = 'text-gray-700';
              let statusBg = 'bg-gray-50';
              let statusBorder = 'border-gray-200';
              if (isTodayDate) {
                headerText = `Due Today`;
                statusColor = 'text-blue-700';
                statusBg = 'bg-blue-50';
                statusBorder = 'border-blue-200';
              } else if (isTomorrowDate) {
                headerText = `Due Tomorrow`;
                statusColor = 'text-amber-700';
                statusBg = 'bg-amber-50';
                statusBorder = 'border-amber-200';
              } else if (daysDiff > 0 && daysDiff <= 7) {
                headerText = `Due in ${daysDiff} day${daysDiff > 1 ? 's' : ''}`;
                statusColor = 'text-gray-700';
                statusBg = 'bg-gray-50';
                statusBorder = 'border-gray-200';
              } else if (daysDiff < 0 && daysDiff >= -7) {
                headerText = `Overdue ${Math.abs(daysDiff)} day${Math.abs(daysDiff) > 1 ? 's' : ''}`;
                statusColor = 'text-red-700';
                statusBg = 'bg-red-50';
                statusBorder = 'border-red-200';
              } else {
                headerText = '';
                statusColor = 'text-gray-700';
                statusBg = 'bg-gray-50';
                statusBorder = 'border-gray-200';
              }
              
              return (
                <div className="flex items-center justify-between py-3 px-1">
                  <div className="flex items-center gap-3">
                    {headerText && (
                      <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${statusColor} ${statusBg} border ${statusBorder}`}>
                        {headerText}
                      </span>
                    )}
                    <span className="text-base font-bold text-gray-900">
                      {formatDate(group.date, 'short')}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-600">
                    {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}
                  </span>
                </div>
              );
            })()}
            
              {/* Summary Message */}
            {(isTodayDate || isTomorrowDate) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-4">
                <p className="text-sm font-medium text-blue-900">
                  {isTomorrowDate ? 'Tomorrow' : 'Today'}, 
                  {rehairTasks.length > 0 && (
                    <span>
                      {' '}bow{rehairTasks.length > 1 ? 's' : ''}{' '}
                      {rehairTasks.map((task: MaintenanceTask, idx: number) => {
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
                      {repairTasks.map((task: MaintenanceTask, idx: number) => {
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
            <div className="space-y-4">
              {group.tasks.map((task: MaintenanceTask) => {
                const instrument = task.instrument_id ? instruments?.get(task.instrument_id) : undefined;
                const client = task.client_id ? clients?.get(task.client_id) : undefined;
                const dateStatus = getDateStatus(task);
                
                // Get due date for display
                const dueDate = task.due_date || task.personal_due_date || task.scheduled_date;
                const dueDateObj = dueDate ? parseISO(dueDate) : null;
                const isDueOverdue = dueDateObj && dueDateObj < new Date() && task.status !== 'completed';
                const isDueUpcoming = dueDateObj && differenceInDays(dueDateObj, new Date()) > 0 && differenceInDays(dueDateObj, new Date()) <= 3;
                
                return (
                  <div
                    key={task.id}
                    data-testid={`task-${task.id}`}
                    className="group bg-white rounded-lg p-5 hover:shadow-sm transition-all duration-200 cursor-pointer border border-gray-100"
                    onClick={() => onTaskClick?.(task)}
                    title={`${task.title} - ${task.status} - ${task.priority} priority${dateStatus.status === 'overdue' ? ' (OVERDUE)' : dateStatus.status === 'upcoming' ? ' (UPCOMING)' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-5">
                      <div className="flex-1 min-w-0 space-y-4">
                        {/* Title Header - Main */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 flex-1">
                              {instrument && (
                                <span className="text-lg">{getInstrumentIcon(instrument.type)}</span>
                              )}
                              <h4 className="font-bold text-gray-900 text-lg flex-1">{task.title}</h4>
                            </div>
                            <div className="flex items-center gap-2 text-sm shrink-0">
                              <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${getStatusColor(task.status)}`}>
                                {task.status.replace('_', ' ')}
                              </span>
                              <span className="text-gray-400">•</span>
                              <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${getPriorityColor(task.priority)}`}>
                                {task.priority}
                              </span>
                            </div>
                          </div>
                          
                          {/* Instrument/Bow and Client - Inline */}
                          {instrument && (
                            <div className="text-sm text-gray-700">
                              {instrument.type || 'Unknown'}
                              {instrument.maker && ` – ${instrument.maker}`}
                              {instrument.ownership && ` (${instrument.ownership})`}
                            </div>
                          )}
                          
                          {/* Client */}
                          {client && (
                            <div className="text-sm text-gray-600">
                              {client.firstName} {client.lastName}
                              {client.email && ` (${client.email})`}
                            </div>
                          )}
                          
                          {/* Task Type */}
                          <div className="text-sm text-gray-600 capitalize">
                            {task.task_type}
                          </div>
                        </div>
                        
                        {/* Dates - 2-column grid */}
                        {(task.received_date || task.due_date || task.personal_due_date || task.scheduled_date) && (
                          <div className="pt-4 border-t border-gray-100">
                            <div className="flex items-center gap-2 mb-3">
                              <svg
                                className="w-5 h-5 text-gray-600"
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
                              <div className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Dates</div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                              {task.received_date && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-600">Received:</span>
                                  <span className={`text-base font-semibold ${getDateColor('received')}`}>{formatDate(task.received_date, 'short')}</span>
                                  {(() => {
                                    const receivedInfo = getRelativeDateDisplay(task.received_date);
                                    if (receivedInfo.text !== formatDate(task.received_date, 'short')) {
                                      return <span className="text-gray-500 text-xs">({receivedInfo.text})</span>;
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}
                              {task.personal_due_date && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-600">Personal Due:</span>
                                  <span className={`text-base font-semibold ${getDateColor('personal')}`}>{formatDate(task.personal_due_date, 'short')}</span>
                                  {(() => {
                                    const personalInfo = getRelativeDateDisplay(task.personal_due_date);
                                    if (personalInfo.text !== formatDate(task.personal_due_date, 'short')) {
                                      return <span className="text-gray-500 text-xs">({personalInfo.text})</span>;
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}
                              {task.due_date && (
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm text-gray-600 ${isDueOverdue || isDueUpcoming ? 'font-semibold' : ''}`}>Customer Due:</span>
                                  <span className={`text-base font-bold ${getDateColor('due')} ${isDueOverdue || isDueUpcoming ? '' : ''}`}>
                                    {formatDate(task.due_date, 'short')}
                                  </span>
                                  {(() => {
                                    const dueInfo = getRelativeDateDisplay(task.due_date);
                                    if (dueInfo.text !== formatDate(task.due_date, 'short')) {
                                      return <span className="text-gray-500 text-xs">({dueInfo.text})</span>;
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}
                              {task.scheduled_date && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-600">Scheduled:</span>
                                  <span className={`text-base font-semibold ${getDateColor('scheduled')}`}>{formatDate(task.scheduled_date, 'short')}</span>
                                  {(() => {
                                    const scheduledInfo = getRelativeDateDisplay(task.scheduled_date);
                                    if (scheduledInfo.text !== formatDate(task.scheduled_date, 'short')) {
                                      return <span className="text-gray-500 text-xs">({scheduledInfo.text})</span>;
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Hours & Cost - 2-column grid */}
                        {(task.estimated_hours !== null || task.actual_hours !== null || task.cost !== null) && (
                          <div className="pt-4 border-t border-gray-100">
                            <div className="flex items-center gap-2 mb-3">
                              <svg
                                className="w-5 h-5 text-gray-600"
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
                              <div className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Workload</div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-600">
                              {task.estimated_hours !== null && (
                                <div>
                                  Estimated Hours: <span className="text-gray-900 font-medium">{task.estimated_hours}</span>
                                </div>
                              )}
                              {task.actual_hours !== null && (
                                <div>
                                  Actual Hours: <span className="text-gray-900 font-medium">{task.actual_hours}</span>
                                </div>
                              )}
                              {task.cost !== null && (
                                <div>
                                  Cost: <span className="text-gray-900 font-medium">${task.cost.toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Description & Notes - Clean style */}
                        {(task.description || task.notes) && (
                          <div className="pt-4 border-t border-gray-100">
                            {task.description && (
                              <div className="text-sm mb-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <svg
                                    className="w-5 h-5 text-gray-600"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                    />
                                  </svg>
                                  <div className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Description</div>
                                </div>
                                <p className="text-gray-700 line-clamp-3">{task.description}</p>
                              </div>
                            )}
                            
                            {task.notes && (
                              <div className="text-sm">
                                <div className="flex items-center gap-2 mb-2">
                                  <svg
                                    className="w-5 h-5 text-gray-600"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    />
                                  </svg>
                                  <div className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Notes</div>
                                </div>
                                <p className="text-gray-600 italic line-clamp-3">{task.notes}</p>
                              </div>
                            )}
                          </div>
                        )}
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

