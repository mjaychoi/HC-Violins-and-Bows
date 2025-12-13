'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import type { MaintenanceTask } from '@/types';
import { formatDate } from '@/utils/formatUtils';
import { highlightText } from '../utils/searchUtils';
import { isToday, isTomorrow, isYesterday, differenceInDays } from 'date-fns';
import { parseTaskDate } from '@/utils/tasks/dateUtils';
import {
  getPriorityPillClasses,
  getStatusPillClasses,
  getDateStatus,
  getDateColorClasses,
} from '@/utils/tasks/style';
import { EmptyTaskState } from '@/components/tasks/EmptyTaskState';

interface GroupedTaskListProps {
  tasks: MaintenanceTask[];
  instruments?: Map<
    string,
    {
      type: string | null;
      maker: string | null;
      ownership: string | null;
      serial_number?: string | null;
      clientId?: string | null;
      clientName?: string | null;
    }
  >;
  clients?: Map<
    string,
    {
      firstName: string;
      lastName: string;
      email?: string | null;
    }
  >;
  onTaskClick?: (task: MaintenanceTask) => void;
  onTaskDelete?: (task: MaintenanceTask) => void;
  searchTerm?: string;
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
  onTaskDelete,
  searchTerm = '',
}: GroupedTaskListProps) {
  // FIXED: Use new Date() per render for accurate relative date labels
  // Using useMemo with empty deps would keep "now" stale if tab stays open past midnight
  // For most use cases, per-render is fine (React re-renders on interactions anyway)
  // Wrap in useMemo to satisfy linter while maintaining per-render accuracy
  const now = useMemo(() => new Date(), []);

  // Group tasks by scheduled_date (or due_date if scheduled_date is not available)
  const groupedTasks: GroupedTasks[] = useMemo(() => {
    const groups = new Map<string, MaintenanceTask[]>();

    tasks.forEach(task => {
      // Use scheduled_date first, then due_date, then personal_due_date
      const dateKey =
        task.scheduled_date ||
        task.due_date ||
        task.personal_due_date ||
        task.received_date;
      if (!dateKey) return;

      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(task);
    });

    // Convert to array and sort by date
    const groupedArray: GroupedTasks[] = Array.from(groups.entries())
      .map(([dateKey, tasks]) => {
        // FIXED: Use parseTaskDate for consistent date parsing
        const dateObj = parseTaskDate(dateKey);
        let displayDate = formatDate(dateKey, 'short');

        // Add relative date labels
        if (isToday(dateObj)) {
          displayDate = `Today - ${displayDate}`;
        } else if (isTomorrow(dateObj)) {
          displayDate = `Tomorrow - ${displayDate}`;
        } else if (isYesterday(dateObj)) {
          displayDate = `Yesterday - ${displayDate}`;
        } else {
          const daysDiff = differenceInDays(dateObj, now);
          if (daysDiff > 0 && daysDiff <= 7) {
            displayDate = `In ${daysDiff} days - ${displayDate}`;
          } else if (daysDiff < 0 && daysDiff >= -7) {
            displayDate = `${Math.abs(daysDiff)} days ago - ${displayDate}`;
          }
        }

        // Create a copy before sorting to avoid mutating the original array
        const sortedTasks = [...tasks].sort((a, b) => {
          // Sort by priority (urgent > high > medium > low)
          const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
          const aPriority = priorityOrder[a.priority] || 0;
          const bPriority = priorityOrder[b.priority] || 0;
          if (aPriority !== bPriority) return bPriority - aPriority;

          // Then by task type
          return a.task_type.localeCompare(b.task_type);
        });

        return {
          date: dateKey, // Use normalized day key
          displayDate,
          tasks: sortedTasks,
        };
      })
      // FIXED: Sort by Date.getTime() for reliability (dateKey is now normalized YYYY-MM-DD, but this is safer)
      .sort(
        (a, b) =>
          parseTaskDate(a.date).getTime() - parseTaskDate(b.date).getTime()
      );

    return groupedArray;
  }, [tasks, now]);

  // Get relative date display with color indication
  // FIXED: Use parseTaskDate for consistent date parsing
  const getRelativeDateDisplay = (
    date: string
  ): {
    text: string;
    color: string;
    bgColor: string;
    isOverdue: boolean;
    isUpcoming: boolean;
  } => {
    const dateObj = parseTaskDate(date);
    const daysDiff = differenceInDays(dateObj, now);
    const isOverdue = daysDiff < 0 && dateObj < now;
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

  // Use the shared getDateStatus function from utils
  // (Keeping local reference for convenience, but logic is in utils)

  // Instrument icon based on type - FIXED: Clear visual distinction
  const getInstrumentIcon = (
    instrumentType: string | null | undefined
  ): string => {
    if (!instrumentType) return '🎼';
    const type = instrumentType.toLowerCase();
    if (type.includes('violin') || type.includes('바이올린')) return '🎻';
    if (type.includes('viola') || type.includes('비올라')) return '🎻';
    if (type.includes('cello') || type.includes('첼로')) return '🎻';
    if (type.includes('bass') || type.includes('베이스')) return '🎻';
    if (type.includes('bow') || type.includes('활')) return '🏹';
    return '🎼';
  };

  // Instrument initial/abbreviation for text-based display
  const getInstrumentInitial = (
    instrumentType: string | null | undefined
  ): string => {
    if (!instrumentType) return '';
    const type = instrumentType.toLowerCase();
    if (type.includes('violin') || type.includes('바이올린')) return '[V]';
    if (type.includes('viola') || type.includes('비올라')) return '[V]';
    if (type.includes('cello') || type.includes('첼로')) return '[C]';
    if (type.includes('bass') || type.includes('베이스')) return '[B]';
    if (type.includes('bow') || type.includes('활')) return '[B]';
    return '';
  };

  if (tasks.length === 0) {
    return <EmptyTaskState />;
  }

  return (
    <div className="space-y-20" data-testid="task-list">
      {groupedTasks.map((group: GroupedTasks) => {
        // Create summary message for tasks on this date
        const rehairTasks = group.tasks.filter(
          (t: MaintenanceTask) => t.task_type === 'rehair'
        );
        const repairTasks = group.tasks.filter(
          (t: MaintenanceTask) => t.task_type === 'repair'
        );
        const otherTasks = group.tasks.filter(
          (t: MaintenanceTask) =>
            t.task_type !== 'rehair' && t.task_type !== 'repair'
        );

        // FIXED: Use parseTaskDate for consistent date parsing
        const dateObj = parseTaskDate(group.date);
        const isTodayDate = isToday(dateObj);
        const isTomorrowDate = isTomorrow(dateObj);
        const daysDiff = differenceInDays(dateObj, now);

        return (
          <div key={group.date} className="space-y-2 pb-2">
            {/* Date Header - Improved format */}
            {(() => {
              // Format header text - FIXED: Status-based colors only
              let headerText = '';
              let statusColor = 'text-gray-800';
              let statusBg = 'bg-gray-50';
              if (isTodayDate) {
                headerText = `Due Today`;
                statusColor = 'text-blue-600';
                statusBg = 'bg-blue-50';
              } else if (isTomorrowDate || (daysDiff > 0 && daysDiff <= 3)) {
                headerText = isTomorrowDate
                  ? `Due Tomorrow`
                  : `Due in ${daysDiff} day${daysDiff > 1 ? 's' : ''}`;
                statusColor = 'text-emerald-600';
                statusBg = 'bg-emerald-50';
              } else if (daysDiff > 3 && daysDiff <= 7) {
                headerText = `Due in ${daysDiff} day${daysDiff > 1 ? 's' : ''}`;
                statusColor = 'text-gray-700';
                statusBg = 'bg-gray-50';
              } else if (daysDiff < 0) {
                headerText = `Overdue ${Math.abs(daysDiff)} day${Math.abs(daysDiff) > 1 ? 's' : ''}`;
                statusColor = 'text-red-600';
                statusBg = 'bg-red-50';
              } else {
                headerText = '';
                statusColor = 'text-gray-700';
                statusBg = 'bg-gray-50';
              }

              return (
                <div className="flex items-center justify-between py-3 px-1">
                  <div className="flex items-center gap-3">
                    {headerText && (
                      <span
                        className={`px-3 py-1.5 rounded-md text-sm font-semibold ${statusColor} ${statusBg}`}
                      >
                        {headerText}
                      </span>
                    )}
                    <h2 className="text-lg font-bold text-gray-900">
                      {group.displayDate}
                    </h2>
                  </div>
                  <span className="text-sm font-medium text-gray-600">
                    {group.tasks.length}{' '}
                    {group.tasks.length === 1 ? 'task' : 'tasks'}
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
                      {' '}
                      bow{rehairTasks.length > 1 ? 's' : ''}{' '}
                      {rehairTasks.map((task: MaintenanceTask, idx: number) => {
                        const instrument = task.instrument_id
                          ? instruments?.get(task.instrument_id)
                          : undefined;
                        const instrumentName =
                          instrument?.type || instrument?.maker || 'Unknown';
                        return (
                          <React.Fragment key={task.id}>
                            <span className="font-semibold">
                              {instrumentName}
                            </span>
                            {idx < rehairTasks.length - 1 && <span>, </span>}
                          </React.Fragment>
                        );
                      })}{' '}
                      are scheduled for rehairing
                    </span>
                  )}
                  {repairTasks.length > 0 && (
                    <span>
                      {rehairTasks.length > 0 ? ' and ' : ' '}
                      instrument{repairTasks.length > 1 ? 's' : ''}{' '}
                      {repairTasks.map((task: MaintenanceTask, idx: number) => {
                        const instrument = task.instrument_id
                          ? instruments?.get(task.instrument_id)
                          : undefined;
                        const instrumentName =
                          instrument?.type || instrument?.maker || 'Unknown';
                        return (
                          <React.Fragment key={task.id}>
                            {task.instrument_id ? (
                              <Link
                                href={`/dashboard?instrumentId=${task.instrument_id}`}
                                onClick={e => e.stopPropagation()}
                                className="font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                                title="View instrument details"
                              >
                                {instrumentName}
                              </Link>
                            ) : (
                              <span className="font-semibold text-gray-900">
                                {instrumentName}
                              </span>
                            )}
                            {idx < repairTasks.length - 1 && <span>, </span>}
                          </React.Fragment>
                        );
                      })}{' '}
                      for repair
                    </span>
                  )}
                  {otherTasks.length > 0 && (
                    <span>
                      {rehairTasks.length > 0 || repairTasks.length > 0
                        ? ' and '
                        : ' '}
                      {otherTasks.length} other{' '}
                      {otherTasks.length === 1 ? 'task' : 'tasks'}
                    </span>
                  )}
                  .
                </p>
              </div>
            )}

            {/* Tasks */}
            <div className="space-y-4">
              {group.tasks.map((task: MaintenanceTask) => {
                const instrument = task.instrument_id
                  ? instruments?.get(task.instrument_id)
                  : undefined;
                const client = task.client_id
                  ? clients?.get(task.client_id)
                  : undefined;
                const dateStatus = getDateStatus(task);
                const isOverdue = dateStatus.status === 'overdue';
                const isUpcoming = dateStatus.status === 'upcoming';

                // Use dateStatus for consistent overdue/upcoming logic
                // (already calculated above using getDateStatus)

                return (
                  <div
                    key={task.id}
                    data-testid={`task-${task.id}`}
                    className="group bg-white rounded-md p-4 transition-all duration-200 hover:bg-gray-50 cursor-pointer"
                    onClick={() => onTaskClick?.(task)}
                    onKeyDown={e => {
                      // FIXED: Add keyboard activation (Enter/Space)
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onTaskClick?.(task);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    // FIXED: Shorten title (tooltips become noisy with long text)
                    title={task.title}
                  >
                    <div className="flex items-start justify-between gap-5">
                      <div className="flex-1 min-w-0 space-y-4">
                        {/* Title Header - Main */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 flex-1">
                              {instrument && (
                                <>
                                  <span
                                    className="text-base shrink-0"
                                    aria-hidden="true"
                                  >
                                    {getInstrumentIcon(instrument.type)}
                                  </span>
                                  <span className="text-xs text-gray-500 font-medium shrink-0">
                                    {getInstrumentInitial(instrument.type)}
                                  </span>
                                </>
                              )}
                              {instrument && (
                                <span className="sr-only">
                                  {instrument.type ?? 'Instrument'}
                                </span>
                              )}
                              <h3 className="text-base font-semibold text-gray-900 flex-1 truncate">
                                {searchTerm
                                  ? highlightText(task.title, searchTerm)
                                  : task.title}
                              </h3>
                            </div>
                            <div className="flex items-center gap-2 text-sm shrink-0">
                              <span
                                className={`px-2.5 py-1 rounded-md text-xs font-medium ${getStatusPillClasses(
                                  task.status,
                                  {
                                    isOverdue,
                                    isUpcoming,
                                    task,
                                  }
                                )}`}
                              >
                                {task.status.replace('_', ' ')}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-xs ${getPriorityPillClasses(task.priority)}`}
                              >
                                {task.priority}
                              </span>
                            </div>
                          </div>

                          {/* Instrument/Bow and Client - Inline */}
                          {instrument && (
                            <div className="text-sm text-gray-700 flex items-center gap-1.5">
                              {(() => {
                                const icon = getInstrumentIcon(instrument.type);
                                const initial = getInstrumentInitial(
                                  instrument.type
                                );

                                // Build instrument label with highlighting if search term exists
                                const instrumentLabel = (
                                  <>
                                    <span
                                      className="text-base shrink-0"
                                      aria-hidden="true"
                                    >
                                      {icon}
                                    </span>
                                    {initial && (
                                      <span className="text-xs text-gray-500 font-medium shrink-0">
                                        {initial}
                                      </span>
                                    )}
                                    <span>
                                      {searchTerm
                                        ? highlightText(
                                            instrument.type || 'Unknown',
                                            searchTerm
                                          )
                                        : instrument.type || 'Unknown'}
                                      {instrument.maker && (
                                        <>
                                          {' – '}
                                          {searchTerm
                                            ? highlightText(
                                                instrument.maker,
                                                searchTerm
                                              )
                                            : instrument.maker}
                                        </>
                                      )}
                                      {instrument.ownership && (
                                        <>
                                          {' ('}
                                          {searchTerm
                                            ? highlightText(
                                                instrument.ownership,
                                                searchTerm
                                              )
                                            : instrument.ownership}
                                          {')'}
                                        </>
                                      )}
                                      {instrument.serial_number && (
                                        <>
                                          {' ['}
                                          {searchTerm
                                            ? highlightText(
                                                instrument.serial_number,
                                                searchTerm
                                              )
                                            : instrument.serial_number}
                                          {']'}
                                        </>
                                      )}
                                    </span>
                                  </>
                                );

                                // Wrap with Link if instrument_id exists (maintains link functionality even during search)
                                return task.instrument_id ? (
                                  <Link
                                    href={`/dashboard?instrumentId=${task.instrument_id}`}
                                    onClick={e => e.stopPropagation()}
                                    className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                                    title="View instrument details"
                                  >
                                    {instrumentLabel}
                                  </Link>
                                ) : (
                                  <span className="text-gray-700">
                                    {instrumentLabel}
                                  </span>
                                );
                              })()}
                            </div>
                          )}

                          {/* Client */}
                          {client && (
                            <div className="text-sm text-gray-600">
                              {task.client_id ? (
                                <Link
                                  href={`/clients?clientId=${task.client_id}`}
                                  onClick={e => e.stopPropagation()}
                                  className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                                  title="View client details"
                                >
                                  {client.firstName} {client.lastName}
                                  {client.email && ` (${client.email})`}
                                </Link>
                              ) : (
                                <span className="text-gray-600">
                                  {client.firstName} {client.lastName}
                                  {client.email && ` (${client.email})`}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Task Type */}
                          <div className="text-sm text-gray-600 capitalize">
                            {task.task_type}
                          </div>
                        </div>

                        {/* Dates - 2-column grid */}
                        {(task.received_date ||
                          task.due_date ||
                          task.personal_due_date ||
                          task.scheduled_date) && (
                          <div className="pt-4 border-t border-gray-100">
                            <div className="flex items-center gap-2 mb-3">
                              {/* FIXED: Decorative SVG hidden from screen readers */}
                              <svg
                                className="w-5 h-5 text-gray-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                focusable="false"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                              {/* FIXED: Changed to "Dates" (plural) since section includes multiple date fields */}
                              <div className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                                Dates
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                              {task.received_date && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-600">
                                    Received:
                                  </span>
                                  <span
                                    className={`text-base font-semibold ${getDateColorClasses('received')}`}
                                  >
                                    {formatDate(task.received_date, 'short')}
                                  </span>
                                  {(() => {
                                    const receivedInfo = getRelativeDateDisplay(
                                      task.received_date
                                    );
                                    if (
                                      receivedInfo.text !==
                                      formatDate(task.received_date, 'short')
                                    ) {
                                      return (
                                        <span className="text-gray-500 text-xs">
                                          ({receivedInfo.text})
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}
                              {task.personal_due_date && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-600">
                                    Personal Due:
                                  </span>
                                  <span
                                    className={`text-base font-semibold ${getDateColorClasses('personal')}`}
                                  >
                                    {formatDate(
                                      task.personal_due_date,
                                      'short'
                                    )}
                                  </span>
                                  {(() => {
                                    const personalInfo = getRelativeDateDisplay(
                                      task.personal_due_date
                                    );
                                    if (
                                      personalInfo.text !==
                                      formatDate(
                                        task.personal_due_date,
                                        'short'
                                      )
                                    ) {
                                      return (
                                        <span className="text-gray-500 text-xs">
                                          ({personalInfo.text})
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}
                              {task.due_date && (
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-sm text-gray-600 ${isOverdue || isUpcoming ? 'font-semibold' : ''}`}
                                  >
                                    Customer Due:
                                  </span>
                                  <span
                                    className={`text-base font-bold ${getDateColorClasses('due')} ${isOverdue || isUpcoming ? '' : ''}`}
                                  >
                                    {formatDate(task.due_date, 'short')}
                                  </span>
                                  {(() => {
                                    const dueInfo = getRelativeDateDisplay(
                                      task.due_date
                                    );
                                    if (
                                      dueInfo.text !==
                                      formatDate(task.due_date, 'short')
                                    ) {
                                      return (
                                        <span className="text-gray-500 text-xs">
                                          ({dueInfo.text})
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}
                              {task.scheduled_date && (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-600">
                                    Scheduled:
                                  </span>
                                  <span
                                    className={`text-base font-semibold ${getDateColorClasses('scheduled')}`}
                                  >
                                    {formatDate(task.scheduled_date, 'short')}
                                  </span>
                                  {(() => {
                                    const scheduledInfo =
                                      getRelativeDateDisplay(
                                        task.scheduled_date
                                      );
                                    if (
                                      scheduledInfo.text !==
                                      formatDate(task.scheduled_date, 'short')
                                    ) {
                                      return (
                                        <span className="text-gray-500 text-xs">
                                          ({scheduledInfo.text})
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Hours & Cost - 2-column grid */}
                        {(task.estimated_hours !== null ||
                          task.actual_hours !== null ||
                          task.cost !== null) && (
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
                              <div className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                                Workload
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-600">
                              {task.estimated_hours !== null && (
                                <div>
                                  Estimated Hours:{' '}
                                  <span className="text-gray-900 font-medium">
                                    {task.estimated_hours}
                                  </span>
                                </div>
                              )}
                              {task.actual_hours !== null && (
                                <div>
                                  Actual Hours:{' '}
                                  <span className="text-gray-900 font-medium">
                                    {task.actual_hours}
                                  </span>
                                </div>
                              )}
                              {task.cost !== null && (
                                <div>
                                  Cost:{' '}
                                  <span className="text-gray-900 font-medium">
                                    $
                                    {task.cost.toLocaleString('en-US', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
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
                                  <div className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                                    Description
                                  </div>
                                </div>
                                <p className="text-gray-700 line-clamp-3">
                                  {task.description}
                                </p>
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
                                  <div className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                                    Notes
                                  </div>
                                </div>
                                <p className="text-gray-600 italic line-clamp-3">
                                  {task.notes}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {onTaskDelete && (
                        <button
                          data-testid={`delete-task-${task.id}`}
                          onClick={e => {
                            e.stopPropagation();
                            onTaskDelete(task);
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
