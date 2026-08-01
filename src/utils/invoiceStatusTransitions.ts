import type { InvoiceStatus } from '@/types';

/**
 * Canonical invoice status transition graph.
 *
 * Single source of truth shared by:
 * - API 409 enforcement (`src/app/api/_utils/stateTransitions.ts`)
 * - edit-form status picker (`InvoiceForm.tsx`)
 *
 * Mirrors the database trigger in
 * `supabase/migrations/00000000000058_enforce_status_transitions.sql`
 * (same-status updates are no-ops at the DB layer; they are listed here so the
 * UI can keep the current status selected without offering unreachable peers).
 */
export const ALLOWED_INVOICE_STATUS_TRANSITIONS: Record<
  InvoiceStatus,
  readonly InvoiceStatus[]
> = {
  draft: ['draft', 'sent', 'cancelled'],
  sent: ['sent', 'paid', 'overdue', 'cancelled'],
  overdue: ['overdue', 'paid', 'cancelled'],
  paid: ['paid'],
  cancelled: ['cancelled'],
};

/** Persisted invoice statuses (no unsupported UI-only values such as void). */
export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'draft',
  'sent',
  'paid',
  'overdue',
  'cancelled',
];

export function getAllowedInvoiceNextStatuses(
  currentStatus: InvoiceStatus
): readonly InvoiceStatus[] {
  return ALLOWED_INVOICE_STATUS_TRANSITIONS[currentStatus] ?? [currentStatus];
}

export function isAllowedInvoiceStatusTransition(
  currentStatus: InvoiceStatus,
  nextStatus: InvoiceStatus
): boolean {
  return getAllowedInvoiceNextStatuses(currentStatus).includes(nextStatus);
}
