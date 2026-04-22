import type { TaskStatus } from '@/types';

const allowedMaintenanceTaskTransitions: Record<
  TaskStatus,
  readonly TaskStatus[]
> = {
  pending: ['pending', 'in_progress', 'cancelled'],
  in_progress: ['in_progress', 'completed', 'cancelled'],
  completed: ['completed'],
  cancelled: ['cancelled'],
};

export function getAllowedMaintenanceTaskNextStatuses(
  currentStatus: TaskStatus
): readonly TaskStatus[] {
  return allowedMaintenanceTaskTransitions[currentStatus] ?? [];
}

export function validateMaintenanceTaskStatusTransition(
  currentStatus: TaskStatus,
  nextStatus: TaskStatus
): string | null {
  const allowedNextStatuses = allowedMaintenanceTaskTransitions[currentStatus];
  if (!allowedNextStatuses) {
    return `Invalid maintenance task status transition: ${currentStatus} -> ${nextStatus}`;
  }

  if (allowedNextStatuses.includes(nextStatus)) {
    return null;
  }

  return `Invalid maintenance task status transition: ${currentStatus} -> ${nextStatus}`;
}
