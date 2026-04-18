import type { Instrument } from '@/types';

type ReservedStateUpdateResult = {
  update: Partial<Instrument>;
  error?: string;
};

const RESERVED_STATUS = 'Reserved';
const CLEAR_RESERVED_ON_STATUSES: ReadonlySet<Instrument['status']> = new Set([
  'Available',
  'Maintenance',
  'Sold',
]);

function hasReservedReasonPatch(nextUpdates: Partial<Instrument>): boolean {
  return Object.prototype.hasOwnProperty.call(nextUpdates, 'reserved_reason');
}

function normalizeReservedReason(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildReservedStateUpdate(
  currentStatus: Instrument['status'],
  currentReservedReason: string | null,
  currentReservedByUserId: string | null,
  currentReservedConnectionId: string | null,
  nextUpdates: Partial<Instrument>,
  userId: string
): ReservedStateUpdateResult {
  const update: Partial<Instrument> = { ...nextUpdates };
  const nextStatus = nextUpdates.status ?? currentStatus;
  const reservedReasonWasPatched = hasReservedReasonPatch(nextUpdates);
  const patchedReason = normalizeReservedReason(nextUpdates.reserved_reason);

  if (nextStatus === RESERVED_STATUS) {
    const effectiveReason =
      patchedReason || normalizeReservedReason(currentReservedReason);

    if (!effectiveReason) {
      return {
        update,
        error: 'Reserved status requires a reserved_reason.',
      };
    }

    update.reserved_reason = effectiveReason;
    update.reserved_by_user_id = userId;
    update.reserved_connection_id = null;
    return { update };
  }

  if (reservedReasonWasPatched) {
    return {
      update,
      error:
        'reserved_reason can only be changed while the instrument is Reserved.',
    };
  }

  if (CLEAR_RESERVED_ON_STATUSES.has(nextStatus)) {
    update.reserved_reason = null;
    update.reserved_by_user_id = null;
    update.reserved_connection_id = null;
    return { update };
  }

  if (currentStatus === RESERVED_STATUS && nextStatus === 'Booked') {
    update.reserved_reason = currentReservedReason;
    update.reserved_by_user_id = currentReservedByUserId;
    update.reserved_connection_id = currentReservedConnectionId;
  }

  return { update };
}
