/**
 * Stable mapping from database-enforced invoice invariants to API responses.
 *
 * The invoice RPCs and triggers raise exceptions whose message is prefixed with
 * a fixed machine-readable code and which additionally carry that code in
 * DETAIL (as JSON) and HINT. See:
 *   supabase/migrations/20260801200000_enforce_invoice_financial_invariants.sql
 *   supabase/migrations/20260801200100_enforce_invoice_initial_status.sql
 *   supabase/migrations/20260801200200_protect_issued_invoice_deletion.sql
 *
 * Raw PostgreSQL text is never forwarded to clients: only the code and a fixed
 * human message defined here are returned.
 */

export const INVOICE_DB_ERROR_CODES = [
  'INVOICE_ITEM_AMOUNT_MISMATCH',
  'INVOICE_SUBTOTAL_MISMATCH',
  'INVOICE_TOTAL_MISMATCH',
  'INVOICE_NEGATIVE_AMOUNT',
  'INVOICE_NON_FINITE_AMOUNT',
  'INVALID_INITIAL_INVOICE_STATUS',
  'INVOICE_IMMUTABLE',
] as const;

export type InvoiceDbErrorCode = (typeof INVOICE_DB_ERROR_CODES)[number];

const CODE_SET = new Set<string>(INVOICE_DB_ERROR_CODES);

const ERROR_CONTRACT: Record<
  InvoiceDbErrorCode,
  { status: 400 | 409 | 422; error: string }
> = {
  INVOICE_ITEM_AMOUNT_MISMATCH: {
    status: 422,
    error:
      'Each invoice item amount must equal its quantity multiplied by its rate.',
  },
  INVOICE_SUBTOTAL_MISMATCH: {
    status: 422,
    error: 'Invoice subtotal must equal the sum of the invoice item amounts.',
  },
  INVOICE_TOTAL_MISMATCH: {
    status: 422,
    error: 'Invoice total must equal subtotal plus tax.',
  },
  INVOICE_NEGATIVE_AMOUNT: {
    status: 422,
    error: 'Invoice amounts cannot be negative.',
  },
  INVOICE_NON_FINITE_AMOUNT: {
    status: 422,
    error: 'Invoice amounts must be finite numbers.',
  },
  INVALID_INITIAL_INVOICE_STATUS: {
    status: 400,
    error:
      'An invoice cannot be created with this status. Create it as a draft (or send it on create) and use the status workflow afterwards.',
  },
  INVOICE_IMMUTABLE: {
    status: 409,
    error:
      'This invoice has been issued and cannot be permanently deleted. Cancel it using the invoice status workflow instead.',
  },
};

function readString(source: unknown, key: string): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function parseDetailsObject(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object') return details as Record<string, unknown>;
  if (typeof details !== 'string') return null;

  try {
    const parsed: unknown = JSON.parse(details);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function firstKnownCode(
  ...candidates: Array<string | undefined>
): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;

    if (CODE_SET.has(candidate)) return candidate;

    // Messages are formatted as `CODE: human readable text`.
    const prefix = candidate.split(':', 1)[0]?.trim();
    if (prefix && CODE_SET.has(prefix)) return prefix;
  }

  return null;
}

/**
 * Extracts a known invoice invariant code from a PostgREST/Postgres error.
 * Returns null when the error is unrelated, so callers can rethrow.
 */
export function extractInvoiceDbErrorCode(
  err: unknown
): InvoiceDbErrorCode | null {
  if (!err || typeof err !== 'object') return null;

  const details = parseDetailsObject(
    (err as { details?: unknown }).details ?? null
  );

  const code = firstKnownCode(
    readString(err, 'error_code'),
    readString(details, 'error_code'),
    readString(err, 'hint'),
    readString(err, 'message')
  );

  return (code as InvoiceDbErrorCode | null) ?? null;
}

export type InvoiceDbErrorResult = {
  payload: {
    error: string;
    error_code: InvoiceDbErrorCode;
    success: false;
  };
  status: 400 | 409 | 422;
};

/**
 * Maps a database invariant violation to a stable API result.
 * Returns null when the error is not one of the known invariants.
 */
export function mapInvoiceDbError(err: unknown): InvoiceDbErrorResult | null {
  const code = extractInvoiceDbErrorCode(err);
  if (!code) return null;

  const contract = ERROR_CONTRACT[code];

  return {
    payload: {
      error: contract.error,
      error_code: code,
      success: false,
    },
    status: contract.status,
  };
}
