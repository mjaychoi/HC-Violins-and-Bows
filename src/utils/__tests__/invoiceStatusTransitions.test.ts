import type { InvoiceStatus } from '@/types';
import {
  ALLOWED_INVOICE_STATUS_TRANSITIONS,
  getAllowedInvoiceNextStatuses,
  isAllowedInvoiceStatusTransition,
} from '../invoiceStatusTransitions';
import { validateInvoiceStatusTransition } from '@/app/api/_utils/stateTransitions';
import { ALLOWED_INITIAL_INVOICE_STATUSES } from '../invoiceLifecycle';

describe('invoiceStatusTransitions (canonical graph)', () => {
  const cases: Array<{
    status: InvoiceStatus;
    expected: readonly InvoiceStatus[];
  }> = [
    { status: 'draft', expected: ['draft', 'sent', 'cancelled'] },
    { status: 'sent', expected: ['sent', 'paid', 'overdue', 'cancelled'] },
    { status: 'overdue', expected: ['overdue', 'paid', 'cancelled'] },
    { status: 'paid', expected: ['paid'] },
    { status: 'cancelled', expected: ['cancelled'] },
  ];

  it.each(cases)(
    'edit options for $status match the canonical transition graph',
    ({ status, expected }) => {
      expect(getAllowedInvoiceNextStatuses(status)).toEqual(expected);
      expect(ALLOWED_INVOICE_STATUS_TRANSITIONS[status]).toEqual(expected);
    }
  );

  it.each(cases)(
    'current status $status remains visible in its own option list',
    ({ status, expected }) => {
      expect(expected).toContain(status);
    }
  );

  it('paid → draft is absent', () => {
    expect(getAllowedInvoiceNextStatuses('paid')).not.toContain('draft');
    expect(isAllowedInvoiceStatusTransition('paid', 'draft')).toBe(false);
  });

  it('cancelled → draft is absent', () => {
    expect(getAllowedInvoiceNextStatuses('cancelled')).not.toContain('draft');
    expect(isAllowedInvoiceStatusTransition('cancelled', 'draft')).toBe(false);
  });

  it('create mode exposes only draft and sent (PR #72 initial-status contract)', () => {
    expect([...ALLOWED_INITIAL_INVOICE_STATUSES]).toEqual(['draft', 'sent']);
    expect(ALLOWED_INITIAL_INVOICE_STATUSES).not.toContain('paid');
    expect(ALLOWED_INITIAL_INVOICE_STATUSES).not.toContain('overdue');
    expect(ALLOWED_INITIAL_INVOICE_STATUSES).not.toContain('cancelled');
  });

  it('API validator stays backed by the same canonical graph', () => {
    expect(validateInvoiceStatusTransition('paid', 'draft')).toBe(
      'Invalid invoice status transition: paid -> draft'
    );
    expect(validateInvoiceStatusTransition('sent', 'paid')).toBeNull();
    expect(validateInvoiceStatusTransition('draft', 'cancelled')).toBeNull();
  });

  it('UI option lists cannot drift from API validation', () => {
    (
      Object.entries(ALLOWED_INVOICE_STATUS_TRANSITIONS) as Array<
        [InvoiceStatus, readonly InvoiceStatus[]]
      >
    ).forEach(([from, allowed]) => {
      allowed.forEach(to => {
        expect(validateInvoiceStatusTransition(from, to)).toBeNull();
      });

      (
        Object.keys(ALLOWED_INVOICE_STATUS_TRANSITIONS) as InvoiceStatus[]
      ).forEach(to => {
        if (!allowed.includes(to)) {
          expect(validateInvoiceStatusTransition(from, to)).toContain(
            'Invalid invoice status transition'
          );
        }
      });
    });
  });
});
