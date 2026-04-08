import type { Instrument } from '@/types';

export function buildReservedStateUpdate(
  currentStatus: Instrument['status'],
  currentReservedReason: string | null,
  currentReservedByUserId: string | null,
  currentReservedConnectionId: string | null,
  nextUpdates: Partial<Instrument>,
  userId: string
): { update: Partial<Instrument>; error?: string } {
  const update = { ...nextUpdates };
  const nextStatus = nextUpdates.status;
  const hasReservedReasonPatch = Object.prototype.hasOwnProperty.call(
    nextUpdates,
    'reserved_reason'
  );
  const nextReservedReason = nextUpdates.reserved_reason;

  if (nextStatus === 'Reserved') {
    const normalizedReason =
      typeof nextReservedReason === 'string'
        ? nextReservedReason.trim()
        : currentStatus === 'Reserved'
          ? (currentReservedReason ?? '').trim()
          : '';

    if (!normalizedReason) {
      return {
        update,
        error: 'Reserved status requires a reserved_reason.',
      };
    }

    update.reserved_reason = normalizedReason;
    update.reserved_by_user_id = userId;
    update.reserved_connection_id = null;
    return { update };
  }

  if (hasReservedReasonPatch) {
    if (currentStatus !== 'Reserved' && nextStatus === undefined) {
      return {
        update,
        error:
          'reserved_reason can only be changed while the instrument is Reserved.',
      };
    }

    const normalizedReason =
      typeof nextReservedReason === 'string' ? nextReservedReason.trim() : '';
    if (!normalizedReason) {
      return {
        update,
        error: 'Reserved status requires a reserved_reason.',
      };
    }

    update.reserved_reason = normalizedReason;
    update.reserved_by_user_id = userId;
    update.reserved_connection_id = null;
    return { update };
  }

  if (
    nextStatus === 'Available' ||
    nextStatus === 'Maintenance' ||
    nextStatus === 'Sold'
  ) {
    update.reserved_reason = null;
    update.reserved_by_user_id = null;
    update.reserved_connection_id = null;
    return { update };
  }

  if (currentStatus === 'Reserved' && nextStatus === 'Booked') {
    update.reserved_reason = currentReservedReason;
    update.reserved_by_user_id = currentReservedByUserId;
    update.reserved_connection_id = currentReservedConnectionId;
  }

  return { update };
}
