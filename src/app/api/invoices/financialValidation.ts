import type {
  CreateInvoiceInput,
  InvoiceFinancialSnapshot,
  InvoiceItemInput,
} from './types';

const MAX_INVOICE_ITEMS = 200;
const MAX_QTY = 1_000_000;
const MAX_MONEY_AMOUNT = 1_000_000_000;

function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

function roundMoney(value: number): number {
  return toCents(value) / 100;
}

function moneyEquals(left: number, right: number): boolean {
  return toCents(left) === toCents(right);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateNonNegativeMoney(
  label: string,
  value: unknown
): string | null {
  if (!isFiniteNumber(value)) {
    return `${label} must be a finite number`;
  }

  if (value < 0) {
    return `${label} cannot be negative`;
  }

  if (value > MAX_MONEY_AMOUNT) {
    return `${label} exceeds the maximum allowed amount`;
  }

  return null;
}

function validatePositiveQty(label: string, value: unknown): string | null {
  if (!isFiniteNumber(value)) {
    return `${label} must be a finite number`;
  }

  if (value <= 0) {
    return `${label} must be greater than 0`;
  }

  if (value > MAX_QTY) {
    return `${label} exceeds the maximum allowed quantity`;
  }

  return null;
}

export function validateInvoiceFinancials(
  input: InvoiceFinancialSnapshot
): string | null {
  const items = Array.isArray(input.items) ? input.items : [];

  if (items.length > MAX_INVOICE_ITEMS) {
    return `Invoice cannot contain more than ${MAX_INVOICE_ITEMS} items`;
  }

  const subtotalError = validateNonNegativeMoney(
    'Invoice subtotal',
    input.subtotal
  );
  if (subtotalError) return subtotalError;

  const totalError = validateNonNegativeMoney('Invoice total', input.total);
  if (totalError) return totalError;

  const tax = input.tax ?? 0;
  const taxError = validateNonNegativeMoney('Invoice tax', tax);
  if (taxError) return taxError;

  for (const [index, item] of items.entries()) {
    const itemNumber = index + 1;

    const qtyError = validatePositiveQty(
      `Invoice item ${itemNumber} quantity`,
      item.qty
    );
    if (qtyError) return qtyError;

    const rateError = validateNonNegativeMoney(
      `Invoice item ${itemNumber} rate`,
      item.rate
    );
    if (rateError) return rateError;

    const amountError = validateNonNegativeMoney(
      `Invoice item ${itemNumber} amount`,
      item.amount
    );
    if (amountError) return amountError;

    const expectedAmount = roundMoney(item.qty * item.rate);

    if (!moneyEquals(item.amount, expectedAmount)) {
      return `Invoice item ${itemNumber} amount must equal qty * rate`;
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
