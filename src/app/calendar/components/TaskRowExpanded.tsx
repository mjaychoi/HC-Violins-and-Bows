'use client';

import React from 'react';
import type { MaintenanceTask } from '@/types';
import { formatDate } from '@/utils/formatUtils';
import { parseYMDLocal } from '@/utils/dateParsing';
import { differenceInDays, isToday, isTomorrow, isYesterday } from 'date-fns';
import StatusPill from './StatusPill';
import PriorityPill from './PriorityPill';
import { getDateStatus } from '@/utils/tasks/style';

interface TaskRowExpandedProps {
  task: MaintenanceTask;
  instrument?: {
    type: string | null;
    maker: string | null;
    serial_number?: string | null;
    ownership?: string | null;
    clientName?: string | null;
  } | null;
  client?: {
    firstName: string;
    lastName: string;
    email?: string | null;
  } | null;
  onTaskClick?: (task: MaintenanceTask) => void;
}

// Instrument icon helper
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

const getRelativeDateDisplay = (date: string): string => {
  const dateObj = parseYMDLocal(date);
  if (!dateObj) return formatDate(date, 'short');

  const now = new Date();
  const daysDiff = differenceInDays(dateObj, now);

  if (isToday(dateObj)) return 'Today';
  if (isTomorrow(dateObj)) return 'Tomorrow';
  if (isYesterday(dateObj)) return 'Yesterday';
  if (daysDiff > 0 && daysDiff <= 7) return `In ${daysDiff} days`;
  if (daysDiff < 0 && daysDiff >= -7) return `${Math.abs(daysDiff)} days ago`;
  return formatDate(date, 'short');
};

export default function TaskRowExpanded({
  task,
  instrument,
  client,
  onTaskClick,
}: TaskRowExpandedProps) {
  const dateStatus = getDateStatus(task);
  const isOverdue = dateStatus.status === 'overdue';
  const isUpcoming = dateStatus.status === 'upcoming';

  const icon = getInstrumentIcon(instrument?.type);

  return (
    <div className="bg-white border-b border-gray-200">
      {/* Collapsed Header (same as TaskRowCollapsed) */}
      <div
        className="flex items-center gap-4 py-3 px-4 hover:bg-gray-50 transition-colors cursor-pointer pr-12 relative"
        onClick={() => onTaskClick?.(task)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onTaskClick?.(task);
          }
        }}
        role="button"
        tabIndex={0}
      >
        {/* Left: Icon + Title */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-base shrink-0" aria-hidden="true">
            {icon}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-900 truncate">
                {task.title}
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600 mt-0.5">
              {instrument && (
                <span className="truncate">
                  {instrument.maker || 'Unknown'}
                  {instrument.serial_number && ` (${instrument.serial_number})`}
                </span>
              )}
              {instrument && (client || instrument.ownership) && <span>·</span>}
              {(client || instrument?.ownership) && (
                <span className="truncate">
                  {client
                    ? `${client.firstName} ${client.lastName}`
                    : instrument?.ownership}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Workload */}
        <div className="text-xs text-gray-600 whitespace-nowrap shrink-0">
          {(() => {
            const parts: string[] = [];
            if (task.estimated_hours !== null || task.actual_hours !== null) {
              const est = task.estimated_hours ?? '?';
              const act = task.actual_hours ?? '?';
              parts.push(`⏱ ${est}h → ${act}h`);
            }
            if (task.cost !== null) {
              parts.push(
                `💲 $${task.cost.toLocaleString('en-US', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}`
              );
            }
            return parts.join('  ');
          })()}
        </div>

        {/* Right: Status + Priority */}
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill
            task={task}
            isOverdue={isOverdue}
            isUpcoming={isUpcoming}
          />
          <PriorityPill priority={task.priority} />
        </div>
      </div>

      {/* Expanded Content */}
      <div className="px-4 pb-4 pt-2 space-y-4 border-t border-gray-100">
        {/* Dates */}
        {(task.received_date ||
          task.due_date ||
          task.personal_due_date ||
          task.scheduled_date) && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-4 h-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <div className="text-xs font-semibold text-gray-900 uppercase tracking-wide">
                Dates
              </div>
            </div>
            <div className="space-y-1.5 text-sm text-gray-700">
              {task.received_date && (
                <div>
                  <span className="font-medium">Received:</span>{' '}
                  <span>{formatDate(task.received_date, 'short')}</span>
                  <span className="text-gray-500 text-xs ml-1">
                    ({getRelativeDateDisplay(task.received_date)})
                  </span>
                </div>
              )}
              {task.due_date && (
                <div>
                  <span className="font-medium">Customer Due:</span>{' '}
                  <span
                    className={isOverdue ? 'text-red-700 font-semibold' : ''}
                  >
                    {formatDate(task.due_date, 'short')}
                  </span>
                  <span className="text-gray-500 text-xs ml-1">
                    ({getRelativeDateDisplay(task.due_date)})
                  </span>
                </div>
              )}
              {task.personal_due_date && (
                <div>
                  <span className="font-medium">Personal Due:</span>{' '}
                  <span>{formatDate(task.personal_due_date, 'short')}</span>
                  <span className="text-gray-500 text-xs ml-1">
                    ({getRelativeDateDisplay(task.personal_due_date)})
                  </span>
                </div>
              )}
              {task.scheduled_date && (
                <div>
                  <span className="font-medium">Scheduled:</span>{' '}
                  <span>{formatDate(task.scheduled_date, 'short')}</span>
                  <span className="text-gray-500 text-xs ml-1">
                    ({getRelativeDateDisplay(task.scheduled_date)})
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Workload */}
        {(task.estimated_hours !== null ||
          task.actual_hours !== null ||
          task.cost !== null) && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-4 h-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-xs font-semibold text-gray-900 uppercase tracking-wide">
                Workload
              </div>
            </div>
            <div className="space-y-1.5 text-sm text-gray-700">
              {task.estimated_hours !== null && (
                <div>
                  <span className="font-medium">Estimated:</span>{' '}
                  {task.estimated_hours}h
                </div>
              )}
              {task.actual_hours !== null && (
                <div>
                  <span className="font-medium">Actual:</span>{' '}
                  {task.actual_hours}h
                </div>
              )}
              {task.cost !== null && (
                <div>
                  <span className="font-medium">Cost:</span> $
                  {task.cost.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Description */}
        {task.description && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-4 h-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <div className="text-xs font-semibold text-gray-900 uppercase tracking-wide">
                Description
              </div>
            </div>
            <p className="text-sm text-gray-700">{task.description}</p>
          </div>
        )}

        {/* Notes */}
        {task.notes && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-4 h-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              <div className="text-xs font-semibold text-gray-900 uppercase tracking-wide">
                Notes
              </div>
            </div>
            <p className="text-sm text-gray-600 italic">{task.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
