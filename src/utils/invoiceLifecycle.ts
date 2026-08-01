import type { InvoiceStatus } from '@/app/api/invoices/types';

/**
 * Invoice lifecycle contract shared by the API layer, the UI and the database.
 *
 * F3: an invoice may only be created in a state the transition machine can
 * legitimately reach at creation time. `draft` is always allowed. `sent` is
 * allowed because the shipped create form renders a Status select and
 * POST /api/invoices already accepts a status field, i.e. create-and-send is
 * existing intentional behaviour. `paid`, `overdue` and `cancelled` are not
 * reachable initial states: they must be reached through the status workflow.
 *
 * This is not a claim that `paid` has payment evidence. There is no payment
 * ledger in this system and none is introduced here; this only prevents
 * bypassing the initial-state transition contract.
 *
 * F5: only `draft` invoices may be physically deleted. Everything else is an
 * issued (or previously issued) document and is retired through the
 * cancellation/status workflow. `cancelled` is deliberately NOT disposable:
 * cancellation is reachable from `sent`/`overdue`, so a cancelled invoice may
 * be an issued document, and no documented policy in this repository treats it
 * as a discardable draft.
 *
 * Mirrored in:
 *   supabase/migrations/20260801200100_enforce_invoice_initial_status.sql
 *   supabase/migrations/20260801200200_protect_issued_invoice_deletion.sql
 */

export const ALLOWED_INITIAL_INVOICE_STATUSES = ['draft', 'sent'] as const;

export const DEFAULT_INITIAL_INVOICE_STATUS = 'draft' as const;

export const HARD_DELETABLE_INVOICE_STATUSES = ['draft'] as const;

export const INVALID_INITIAL_INVOICE_STATUS =
  'INVALID_INITIAL_INVOICE_STATUS' as const;

export const INVOICE_IMMUTABLE = 'INVOICE_IMMUTABLE' as const;

export const INVALID_INITIAL_INVOICE_STATUS_MESSAGE =
  'An invoice cannot be created with this status. Create it as a draft (or send it on create) and use the status workflow afterwards.';

export const INVOICE_IMMUTABLE_MESSAGE =
  'This invoice has been issued and cannot be permanently deleted. Cancel it using the invoice status workflow instead.';

export function isAllowedInitialInvoiceStatus(
  status: string | null | undefined
): boolean {
  if (status === null || status === undefined || status === '') return true;

  return (ALLOWED_INITIAL_INVOICE_STATUSES as readonly string[]).includes(
    status
  );
}

export function isInvoiceHardDeletable(
  status: string | null | undefined
): boolean {
  if (!status) return false;

  return (HARD_DELETABLE_INVOICE_STATUSES as readonly string[]).includes(
    status
  );
}

export function normalizeInitialInvoiceStatus(
  status: InvoiceStatus | null | undefined
): InvoiceStatus {
  return status || DEFAULT_INITIAL_INVOICE_STATUS;
}
