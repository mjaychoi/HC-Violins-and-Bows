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

  // Workload summary: Estimated → Actual, Cost
  const workloadParts: string[] = [];
  if (task.estimated_hours !== null || task.actual_hours !== null) {
    const est = task.estimated_hours ?? '?';
    const act = task.actual_hours ?? '?';
    workloadParts.push(`⏱ ${est}h → ${act}h`);
  }
  if (task.cost !== null) {
    workloadParts.push(
      `💲 $${task.cost.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`
    );
  }
  const workloadText = workloadParts.join('  ');

  return (
    <div
      className="flex items-center gap-4 py-3 px-4 bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer pr-12"
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
            {instrumentLabel && (
              <span className="truncate">{instrumentLabel}</span>
            )}
            {instrumentLabel && clientLabel && <span>·</span>}
            {clientLabel && <span className="truncate">{clientLabel}</span>}
          </div>
        </div>
      </div>

      {/* Center: Workload */}
      {workloadText && (
        <div className="text-xs text-gray-600 whitespace-nowrap shrink-0">
          {workloadText}
        </div>
      )}

      {/* Right: Status + Priority */}
      <div className="flex items-center gap-2 shrink-0">
        <StatusPill task={task} isOverdue={isOverdue} isUpcoming={isUpcoming} />
        <PriorityPill priority={task.priority} />
      </div>
    </div>
  );
}
