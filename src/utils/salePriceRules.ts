/**
 * Canonical sale-price validation rules, shared by every entrypoint that
 * accepts a sale amount: `PATCH /api/instruments` (sale_transition.sale_price),
 * `POST /api/sales`, `PATCH /api/sales`, the dashboard sale/edit form, and the
 * sales "New Sale" form.
 *
 * Pure and isomorphic on purpose: no server-only or client-only imports, so it
 * is safe to import from both API route handlers and browser components
 * without pulling server/database code into the client bundle.
 *
 * Maximum precedent: MAX_SALE_PRICE_ABS in src/app/api/sales/route.ts and
 * MAX_MONEY_AMOUNT in src/app/api/invoices/financialValidation.ts both use
 * 1_000_000_000 independently — that is the strongest existing intentional
 * limit in the repo, well under the sales_history.sale_price NUMERIC(12,2)
 * capacity (~9.99B) and far under Number.MAX_SAFE_INTEGER at cent precision.
 *
 * Sign carve-out: POST /api/sales intentionally allows negative amounts to
 * record a standalone refund-style entry (SaleForm.tsx: "Amount (negative for
 * refund)"; permanent test "should allow negative sale_price for refunds").
 * That is a pre-existing, documented product decision, not a bug, so it is
 * modeled here as an explicit `requirePositive: false` mode rather than
 * silently unified away. /api/instruments sale_transition.sale_price has no
 * such carve-out: it always means "the amount to sell for" and is always
 * requirePositive: true.
 */

export const SALE_PRICE_MAX_MAGNITUDE = 1_000_000_000;

export type SalePriceErrorCode =
  | 'SALE_PRICE_REQUIRED'
  | 'SALE_PRICE_INVALID_TYPE'
  | 'SALE_PRICE_NOT_FINITE'
  | 'SALE_PRICE_MUST_BE_POSITIVE'
  | 'SALE_PRICE_ZERO_NOT_ALLOWED'
  | 'SALE_PRICE_PRECISION_EXCEEDED'
  | 'SALE_PRICE_EXCEEDS_MAXIMUM'
  | 'SALE_PRICE_OUT_OF_RANGE';

export type SalePriceOk = {
  ok: true;
  /** Signed integer number of cents. Always Number.isSafeInteger. */
  amountCents: number;
  /** Signed exact decimal string with exactly two fraction digits, e.g. "-500.00". */
  amountDecimal: string;
};

export type SalePriceErr = {
  ok: false;
  code: SalePriceErrorCode;
  message: string;
};

export type SalePriceValidationResult = SalePriceOk | SalePriceErr;

export interface SalePriceValidationOptions {
  /**
   * Default true. When false, zero is still rejected but negative values are
   * allowed (the POST /api/sales standalone-refund-entry carve-out).
   */
  requirePositive?: boolean;
}

// Tolerance for float representation error (e.g. 19.99 * 100 === 1998.9999999999998)
// while still catching genuine 3+ decimal input (e.g. 19.999 * 100 diffs by 0.1).
const CENTS_EPSILON = 1e-6;

function err(code: SalePriceErrorCode, message: string): SalePriceErr {
  return { ok: false, code, message };
}

/**
 * Validates an already-numeric value against the shared numeric rules
 * (finiteness, sign, precision, safe range, maximum). Does not perform type
 * coercion or presence checks — callers that need to reject non-number JSON
 * values or missing values should use `validateSalePrice` (server-strict) or
 * their own presence/type gate before calling this.
 */
export function evaluateSalePriceNumber(
  value: number,
  options: SalePriceValidationOptions = {}
): SalePriceValidationResult {
  const requirePositive = options.requirePositive ?? true;

  if (!Number.isFinite(value)) {
    return err('SALE_PRICE_NOT_FINITE', 'Sale price must be a finite number.');
  }

  if (requirePositive) {
    if (value <= 0) {
      return err(
        'SALE_PRICE_MUST_BE_POSITIVE',
        'Sale price must be greater than zero.'
      );
    }
  } else if (value === 0) {
    // Also catches -0, since -0 === 0.
    return err('SALE_PRICE_ZERO_NOT_ALLOWED', 'Sale price cannot be zero.');
  }

  const scaledCents = value * 100;
  const roundedCents = Math.round(scaledCents);

  if (Math.abs(scaledCents - roundedCents) > CENTS_EPSILON) {
    return err(
      'SALE_PRICE_PRECISION_EXCEEDED',
      'Sale price cannot have more than two decimal places.'
    );
  }

  if (!Number.isSafeInteger(roundedCents)) {
    return err(
      'SALE_PRICE_OUT_OF_RANGE',
      'Sale price is too large to represent safely at cent precision.'
    );
  }

  if (Math.abs(value) > SALE_PRICE_MAX_MAGNITUDE) {
    return err(
      'SALE_PRICE_EXCEEDS_MAXIMUM',
      `Sale price cannot exceed ${SALE_PRICE_MAX_MAGNITUDE.toLocaleString('en-US')}.`
    );
  }

  const amountDecimal = (roundedCents / 100).toFixed(2);

  return { ok: true, amountCents: roundedCents, amountDecimal };
}

/**
 * Canonical server-side validator. The API accepts a JSON number only —
 * numeric strings, null, empty/whitespace strings, booleans, arrays, and
 * objects are all rejected as an invalid type. Exponential notation is
 * accepted only insofar as JSON.parse already turned it into a JS number
 * before this function ever sees it; the original text is never inspected.
 */
export function validateSalePrice(
  value: unknown,
  options: SalePriceValidationOptions = {}
): SalePriceValidationResult {
  if (value === undefined || value === null) {
    return err('SALE_PRICE_REQUIRED', 'Sale price is required.');
  }

  if (typeof value !== 'number') {
    return err(
      'SALE_PRICE_INVALID_TYPE',
      'Sale price must be a number, not a string or other type.'
    );
  }

  return evaluateSalePriceNumber(value, options);
}

/**
 * Client-side early-feedback validator. Parses a raw form-input string the
 * same way the server ultimately interprets the resulting JSON number — it
 * does not perform any rounding of its own, so precision/sign/max rejections
 * mirror the server exactly for any string that would parse to a finite
 * number. Empty/whitespace input is treated as "required" (matches server
 * behavior for omitted/null).
 */
export function validateSalePriceInput(
  raw: string,
  options: SalePriceValidationOptions = {}
): SalePriceValidationResult {
  const trimmed = raw.trim();

  if (trimmed === '') {
    return err('SALE_PRICE_REQUIRED', 'Sale price is required.');
  }

  const parsed = Number(trimmed);

  if (Number.isNaN(parsed)) {
    return err('SALE_PRICE_INVALID_TYPE', 'Sale price must be a number.');
  }

  return evaluateSalePriceNumber(parsed, options);
}
