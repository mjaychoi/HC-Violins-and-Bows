import type { Instrument } from '@/types';

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
