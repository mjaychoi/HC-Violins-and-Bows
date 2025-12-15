'use client';

import React from 'react';
import type { MaintenanceTask } from '@/types';
import StatusPill from './StatusPill';
import PriorityPill from './PriorityPill';
import { getDateStatus } from '@/utils/tasks/style';

interface TaskRowCollapsedProps {
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

export default function TaskRowCollapsed({
  task,
  instrument,
  client,
  onTaskClick,
}: TaskRowCollapsedProps) {
  const dateStatus = getDateStatus(task);
  const isOverdue = dateStatus.status === 'overdue';
  const isUpcoming = dateStatus.status === 'upcoming';

  const icon = getInstrumentIcon(instrument?.type);

  // Build instrument label: Maker (Serial)
  const instrumentLabel = instrument
    ? `${instrument.maker || 'Unknown'}${instrument.serial_number ? ` (${instrument.serial_number})` : ''}`
    : null;

  // Build client/owner label
  const clientLabel = client
    ? `${client.firstName} ${client.lastName}`
    : instrument?.ownership || null;

  const isCompleted = task.status === 'completed';
  const isOverdueStatus = isOverdue;
  const isDueSoon = isUpcoming;

  // Format cost for display (compact)
  const formatCost = (cost: number): string => {
    if (cost >= 1000000) return `$${(cost / 1000000).toFixed(1)}M`;
    if (cost >= 1000) return `$${(cost / 1000).toFixed(0)}k`;
    return `$${cost.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };

  // Workload summary (compact format)
  const workloadInfo = (() => {
    const parts: string[] = [];
    if (task.estimated_hours !== null || task.actual_hours !== null) {
      const est = task.estimated_hours ?? '?';
      const act = task.actual_hours ?? '?';
      parts.push(`${est}→${act}h`);
    }
    if (task.cost !== null) {
      parts.push(formatCost(task.cost));
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  })();

  return (
    <div
      className={`flex items-center gap-4 py-3 px-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer pr-12 group ${
        isCompleted ? 'bg-gray-50/50 opacity-75' : 'bg-white'
      }`}
      onClick={() => onTaskClick?.(task)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTaskClick?.(task);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open task ${task.title}`}
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
          <div className="flex items-center gap-1.5 text-xs mt-0.5">
            {instrumentLabel && (
              <span className="font-medium text-gray-700 truncate">
                {instrumentLabel}
              </span>
            )}
            {instrumentLabel && clientLabel && (
              <span className="text-gray-400">·</span>
            )}
            {clientLabel && (
              <span className="text-blue-600 font-medium truncate">
                {clientLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: 2-line layout - Status/Priority (top) + Workload (bottom, subtle) */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {/* Top: Status + Priority (main badges) */}
        <div className="flex items-center gap-2">
          {!isCompleted && (
            <StatusPill
              task={task}
              isOverdue={isOverdueStatus}
              isUpcoming={isDueSoon}
            />
          )}
          {isCompleted && (
            <span className="text-xs text-gray-500 font-normal">Completed</span>
          )}
          <PriorityPill priority={task.priority} />
        </div>
        {/* Bottom: Workload (subtle, smaller) */}
        {workloadInfo && (
          <div className="text-[10px] text-gray-500 font-normal">
            {workloadInfo}
          </div>
        )}
      </div>
    </div>
  );
}
