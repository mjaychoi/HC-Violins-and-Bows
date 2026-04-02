import type {
  CreateInvoiceInput,
  InvoiceFinancialSnapshot,
  InvoiceItemInput,
} from './types';

const MONEY_EPSILON = 0.01;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function moneyEquals(left: number, right: number): boolean {
  return Math.abs(roundMoney(left) - roundMoney(right)) < MONEY_EPSILON;
}

export function validateInvoiceFinancials(
  input: InvoiceFinancialSnapshot
): string | null {
  const items = Array.isArray(input.items) ? input.items : [];
  const tax = input.tax ?? 0;

  for (const [index, item] of items.entries()) {
    const expectedAmount = roundMoney(item.qty * item.rate);
    if (!moneyEquals(item.amount, expectedAmount)) {
      return `Invoice item ${index + 1} amount must equal qty * rate`;
    }
  }

  const computedSubtotal = roundMoney(
    items.reduce((sum, item) => sum + item.amount, 0)
  );
  if (!moneyEquals(input.subtotal, computedSubtotal)) {
    return 'Invoice subtotal must equal the sum of item amounts';
  }

  const computedTotal = roundMoney(computedSubtotal + tax);
  if (!moneyEquals(input.total, computedTotal)) {
    return 'Invoice total must equal subtotal + tax';
  }

  return null;
}

export function toFinancialSnapshot(
  input: CreateInvoiceInput
): InvoiceFinancialSnapshot {
  return {
    subtotal: input.subtotal,
    tax: input.tax ?? null,
    total: input.total,
    items: (input.items ?? []) as InvoiceItemInput[],
  };
}
