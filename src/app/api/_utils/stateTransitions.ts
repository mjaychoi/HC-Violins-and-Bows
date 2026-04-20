import type { Instrument } from '@/types';
import type { InvoiceStatus, TaskStatus } from '@/types';

type InstrumentStatus = Instrument['status'];

/**
 * Sold is treated as a terminal business state.
 * Transitions into Sold are allowed from active inventory states.
 */
const allowedInstrumentTransitions: Record<
  InstrumentStatus,
  readonly InstrumentStatus[]
> = {
  Available: ['Available', 'Booked', 'Reserved', 'Maintenance', 'Sold'],
  Booked: ['Booked', 'Available', 'Reserved', 'Sold'],
  Reserved: ['Reserved', 'Available', 'Booked', 'Sold'],
  Maintenance: ['Maintenance', 'Available', 'Sold'],
  Sold: ['Sold'],
};

export function validateInstrumentStatusTransition(
  currentStatus: InstrumentStatus,
  nextStatus: InstrumentStatus
): string | null {
  const allowedNextStatuses = allowedInstrumentTransitions[currentStatus];

  if (allowedNextStatuses.includes(nextStatus)) {
    return null;
  }

  return `Invalid instrument status transition: ${currentStatus} -> ${nextStatus}`;
}

const allowedInvoiceTransitions: Record<
  InvoiceStatus,
  readonly InvoiceStatus[]
> = {
  draft: ['draft', 'sent', 'cancelled'],
  sent: ['sent', 'paid', 'overdue', 'cancelled'],
  overdue: ['overdue', 'paid', 'cancelled'],
  paid: ['paid'],
  cancelled: ['cancelled'],
};

export function validateInvoiceStatusTransition(
  currentStatus: InvoiceStatus,
  nextStatus: InvoiceStatus
): string | null {
  const allowedNextStatuses = allowedInvoiceTransitions[currentStatus];
  if (!allowedNextStatuses) {
    return `Invalid invoice status transition: ${currentStatus} -> ${nextStatus}`;
  }

  if (allowedNextStatuses.includes(nextStatus)) {
    return null;
  }

  return `Invalid invoice status transition: ${currentStatus} -> ${nextStatus}`;
}

const allowedMaintenanceTaskTransitions: Record<
  TaskStatus,
  readonly TaskStatus[]
> = {
  pending: ['pending', 'in_progress', 'cancelled'],
  in_progress: ['in_progress', 'completed', 'cancelled'],
  completed: ['completed'],
  cancelled: ['cancelled'],
};

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
