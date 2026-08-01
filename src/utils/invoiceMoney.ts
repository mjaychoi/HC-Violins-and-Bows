/**
 * F7: one canonical money-display contract for invoices.
 *
 * Before this module every invoice surface formatted money differently:
 *   * invoice list      - Intl currency, minimumFractionDigits 0  -> "$1,234.5"
 *   * invoice detail    - Intl currency, minimumFractionDigits 2  -> "$1,234.50"
 *   * PDF document      - toLocaleString, minimumFractionDigits 0 -> "1,234.5 USD"
 * so the same stored amount rendered three different ways and cents were
 * silently dropped in two of them.
 *
 * Formatting is display only. It never changes a persisted amount: every
 * function here takes a number and returns a string.
 *
 * The number of fraction digits is derived from the invoice's own currency
 * code (the current product contract - see the currency select in
 * src/app/invoices/components/InvoiceForm.tsx). No FX conversion is performed
 * and no multi-currency arithmetic is introduced.
 */

export const DEFAULT_INVOICE_CURRENCY = 'USD';

/**
 * ISO-4217 currencies with no minor unit that this product currently offers or
 * is likely to encounter. Everything else uses two decimal places.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

export function normalizeInvoiceCurrency(
  currency: string | null | undefined
): string {
  const trimmed = (currency ?? '').trim().toUpperCase();
  return trimmed || DEFAULT_INVOICE_CURRENCY;
}

/**
 * Canonical fraction-digit count for a currency. Two-decimal currencies always
 * render both cents; zero-decimal currencies never render a fractional part.
 */
export function getInvoiceCurrencyFractionDigits(
  currency: string | null | undefined
): number {
  return ZERO_DECIMAL_CURRENCIES.has(normalizeInvoiceCurrency(currency))
    ? 0
    : 2;
}

function toFiniteAmount(amount: number | string | null | undefined): number {
  const value = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Canonical invoice money rendering for interactive surfaces (list, detail):
 * a currency-symbol formatted string such as `$1,234.50`.
 */
export function formatInvoiceMoney(
  amount: number | string | null | undefined,
  currency?: string | null,
  locale: string = 'en-US'
): string {
  const code = normalizeInvoiceCurrency(currency);
  const fractionDigits = getInvoiceCurrencyFractionDigits(code);

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(toFiniteAmount(amount));
  } catch {
    // Unknown/invalid ISO code: fall back to the code-suffixed form rather
    // than throwing inside a render.
    return formatInvoiceMoneyWithCurrencyCode(amount, code, locale);
  }
}

/**
 * Same numeric contract as {@link formatInvoiceMoney}, rendered as
 * `1,234.50 USD`. Used by the PDF/document renderer, whose established layout
 * places the currency code after the amount and which cannot rely on symbol
 * glyphs being present in the embedded font.
 */
export function formatInvoiceMoneyWithCurrencyCode(
  amount: number | string | null | undefined,
  currency?: string | null,
  locale: string = 'en-US'
): string {
  const code = normalizeInvoiceCurrency(currency);
  const fractionDigits = getInvoiceCurrencyFractionDigits(code);

  const rendered = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(toFiniteAmount(amount));

  return `${rendered} ${code}`;
}
