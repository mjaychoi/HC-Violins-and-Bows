/**
 * F7 regression: invoice money rendered inconsistently across surfaces.
 *
 * Shared fixture: 1234.50 USD.
 *   * invoice list      used minimumFractionDigits 0 -> "$1,234.5"  (cents lost)
 *   * invoice detail    used minimumFractionDigits 2 -> "$1,234.50"
 *   * PDF document      used minimumFractionDigits 0 -> "1,234.5 USD" (cents lost)
 *
 * Formatting is display only. Nothing here changes a persisted amount.
 */

import {
  DEFAULT_INVOICE_CURRENCY,
  formatInvoiceMoney,
  formatInvoiceMoneyWithCurrencyCode,
  getInvoiceCurrencyFractionDigits,
  normalizeInvoiceCurrency,
} from '../invoiceMoney';

const FIXTURE = 1234.5;

describe('formatInvoiceMoney', () => {
  it('renders the shared 1234.50 fixture with both cents', () => {
    expect(formatInvoiceMoney(FIXTURE, 'USD')).toBe('$1,234.50');
  });

  it('never drops cents for two-decimal currencies', () => {
    expect(formatInvoiceMoney(59.97, 'USD')).toBe('$59.97');
    expect(formatInvoiceMoney(0.5, 'USD')).toBe('$0.50');
    expect(formatInvoiceMoney(1000, 'USD')).toBe('$1,000.00');
  });

  it('uses no fractional part for zero-decimal currencies', () => {
    expect(getInvoiceCurrencyFractionDigits('KRW')).toBe(0);
    expect(formatInvoiceMoney(1234, 'KRW')).toBe('₩1,234');
    expect(formatInvoiceMoney(1234, 'JPY')).toBe('¥1,234');
  });

  it('honours the currency from the invoice record', () => {
    expect(formatInvoiceMoney(FIXTURE, 'EUR')).toBe('€1,234.50');
    expect(formatInvoiceMoney(FIXTURE, 'GBP')).toBe('£1,234.50');
  });

  it('falls back to the default currency for missing/blank codes', () => {
    expect(normalizeInvoiceCurrency(null)).toBe(DEFAULT_INVOICE_CURRENCY);
    expect(formatInvoiceMoney(FIXTURE, null)).toBe('$1,234.50');
    expect(formatInvoiceMoney(FIXTURE, '')).toBe('$1,234.50');
    expect(formatInvoiceMoney(FIXTURE, undefined)).toBe('$1,234.50');
  });

  it('does not throw on non-finite or missing amounts', () => {
    expect(formatInvoiceMoney(Number.NaN, 'USD')).toBe('$0.00');
    expect(formatInvoiceMoney(null, 'USD')).toBe('$0.00');
    expect(formatInvoiceMoney(undefined, 'USD')).toBe('$0.00');
  });

  it('does not mutate the amount it was given', () => {
    const amount = 1234.5;
    formatInvoiceMoney(amount, 'USD');
    expect(amount).toBe(1234.5);
  });
});

describe('formatInvoiceMoneyWithCurrencyCode (PDF/document surface)', () => {
  it('renders the same digits as the interactive surfaces', () => {
    expect(formatInvoiceMoneyWithCurrencyCode(FIXTURE, 'USD')).toBe(
      '1,234.50 USD'
    );
  });

  it('agrees digit-for-digit with formatInvoiceMoney', () => {
    for (const amount of [1234.5, 59.97, 0.5, 1000, 19.99]) {
      const symbolForm = formatInvoiceMoney(amount, 'USD');
      const codeForm = formatInvoiceMoneyWithCurrencyCode(amount, 'USD');

      const symbolDigits = symbolForm.replace(/[^\d.,]/g, '');
      const codeDigits = codeForm.replace(/\s*USD$/, '');

      expect(codeDigits).toBe(symbolDigits);
    }
  });

  it('drops the fractional part for zero-decimal currencies', () => {
    expect(formatInvoiceMoneyWithCurrencyCode(1234, 'KRW')).toBe('1,234 KRW');
  });
});
