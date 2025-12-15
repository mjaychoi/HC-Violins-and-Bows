'use client';

import React, { useMemo, useState } from 'react';
import type { MaintenanceTask } from '@/types';
import { parseYMDLocal } from '@/utils/dateParsing';
import { getDateStatus } from '@/utils/tasks/style';
import EmptyState from '@/components/common/empty-state/EmptyState';
import DateGroupHeader from './DateGroupHeader';
import TaskRowCollapsed from './TaskRowCollapsed';
import TaskRowExpanded from './TaskRowExpanded';
import TaskActionMenu from './TaskActionMenu';

// Normalize date string to YYYY-MM-DD format
// Handles cases like "2025-12-14T00:00:00Z" -> "2025-12-14"
function normalizeYMD(dateStr: string): string | null {
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

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
  onTaskEdit?: (task: MaintenanceTask) => void;
  /** 필터 활성 여부 (빈 상태 문구/버튼 제어) */
  hasActiveFilters?: boolean;
  /** 필터 리셋 핸들러 */
  onResetFilters?: () => void;
  /** 작업 추가 CTA가 필요할 때 */
  onAddTask?: () => void;
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
  onTaskEdit,
  hasActiveFilters = false,
  onResetFilters,
  onAddTask,
}: GroupedTaskListProps) {
  // onTaskEdit is optional, default to onTaskClick if not provided
  const handleTaskEdit = onTaskEdit || onTaskClick;
  // Track expanded tasks
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Group tasks by due_date (or personal_due_date or scheduled_date if due_date is not available)
  const groupedTasks: GroupedTasks[] = useMemo(() => {
    const groups = new Map<string, MaintenanceTask[]>();

    tasks.forEach(task => {
      // FIXED: Use correct date priority: due_date > personal_due_date > scheduled_date
      const rawKey =
        task.due_date ||
        task.personal_due_date ||
        task.scheduled_date ||
        task.received_date;
      if (!rawKey) return;

      // Normalize date string to YYYY-MM-DD format
      const dateKey = normalizeYMD(rawKey);
      if (!dateKey) return;

      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(task);
    });

    // Convert to array and sort by date
    const groupedArray: GroupedTasks[] = Array.from(groups.entries())
      .map(([dateKey, tasks]) => {
        // FIXED: Use parseYMDLocal for consistent date parsing strategy
        const dateObj = parseYMDLocal(dateKey);
        if (!dateObj) return null;

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
          displayDate: dateKey, // Will be formatted in DateGroupHeader
          tasks: sortedTasks,
        };
      })
      .filter((group): group is GroupedTasks => group !== null)
      // FIXED: Sort with overdue first, then by date (ascending)
      .sort((a, b) => {
        const dateA = parseYMDLocal(a.date);
        const dateB = parseYMDLocal(b.date);
        if (!dateA || !dateB) return 0;

        // Check if either group has overdue tasks
        const aHasOverdue = a.tasks.some(task => {
          const dateStatus = getDateStatus(task);
          return dateStatus.status === 'overdue';
        });
        const bHasOverdue = b.tasks.some(task => {
          const dateStatus = getDateStatus(task);
          return dateStatus.status === 'overdue';
        });

        // Overdue groups come first
        if (aHasOverdue && !bHasOverdue) return -1;
        if (!aHasOverdue && bHasOverdue) return 1;

        // Within same category (overdue or not), sort by date ascending
        return dateA.getTime() - dateB.getTime();
      });

    return groupedArray;
  }, [tasks]);

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  if (tasks.length === 0) {
    return (
      <EmptyState
        title={
          hasActiveFilters
            ? 'No tasks found matching your filters'
            : 'No tasks yet'
        }
        description={
          hasActiveFilters
            ? 'Try adjusting your filters or clearing them to see all tasks.'
            : 'Create a maintenance task to start tracking your workflow.'
        }
        hasActiveFilters={hasActiveFilters}
        onResetFilters={hasActiveFilters ? onResetFilters : undefined}
        actionButton={
          !hasActiveFilters && onAddTask
            ? { label: 'Add task', onClick: onAddTask }
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="task-list">
      {groupedTasks.map((group: GroupedTasks) => {
        const dateObj = parseYMDLocal(group.date);
        if (!dateObj) return null;

        return (
          <div key={group.date} className="space-y-0 mb-6">
            {/* Date Header - Section bar style */}
            <DateGroupHeader date={group.date} tasks={group.tasks} />

            {/* Tasks */}
            {/* ✅ FIXED: overflow-hidden 제거하여 드롭다운 메뉴가 잘리지 않도록 수정 */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm divide-y divide-gray-100">
              {group.tasks.map((task: MaintenanceTask) => {
                const instrument = task.instrument_id
                  ? instruments?.get(task.instrument_id)
                  : undefined;
                const client = task.client_id
                  ? clients?.get(task.client_id)
                  : undefined;
                const isExpanded = expandedTasks.has(task.id);
                // Show menu if at least one action is available
                const hasMenu = Boolean(handleTaskEdit || onTaskDelete);

                return (
                  <div key={task.id} data-testid={`task-${task.id}`}>
                    {isExpanded ? (
                      <div className="relative">
                        <TaskRowExpanded
                          task={task}
                          instrument={instrument}
                          client={client}
                          onTaskClick={() => toggleTaskExpanded(task.id)}
                        />
                        {hasMenu && (
                          <div className="absolute right-4 top-3 z-20">
                            <TaskActionMenu
                              task={task}
                              onViewDetails={() => {
                                toggleTaskExpanded(task.id);
                              }}
                              onEdit={handleTaskEdit}
                              onDelete={onTaskDelete}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="relative">
                        <TaskRowCollapsed
                          task={task}
                          instrument={instrument}
                          client={client}
                          onTaskClick={() => toggleTaskExpanded(task.id)}
                        />
                        {hasMenu && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20">
                            <TaskActionMenu
                              task={task}
                              onViewDetails={() => {
                                toggleTaskExpanded(task.id);
                              }}
                              onEdit={handleTaskEdit}
                              onDelete={onTaskDelete}
                            />
                          </div>
                        )}
                      </div>
                    )}
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
