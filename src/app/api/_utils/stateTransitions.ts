import type { Instrument } from '@/types';

type InstrumentStatus = Instrument['status'];

const allowedInstrumentTransitions: Record<
  InstrumentStatus,
  readonly InstrumentStatus[]
> = {
  Available: ['Available', 'Booked', 'Reserved', 'Maintenance'],
  Booked: ['Booked', 'Available', 'Reserved'],
  Reserved: ['Reserved', 'Available', 'Booked'],
  Maintenance: ['Maintenance', 'Available'],
  Sold: ['Sold'],
};

export function validateInstrumentStatusTransition(
  currentStatus: InstrumentStatus,
  nextStatus: InstrumentStatus
): string | null {
  const allowedNext = allowedInstrumentTransitions[currentStatus];
  if (allowedNext.includes(nextStatus)) {
    return null;
  }

  return `Invalid instrument status transition: ${currentStatus} -> ${nextStatus}`;
}
