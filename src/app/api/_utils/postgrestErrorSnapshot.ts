/**
 * Extract PostgREST / Supabase-js error fields for operator logs.
 * Intentionally excludes raw payloads and PII-heavy fields.
 */
export function extractPostgrestLikeErrorSnapshot(
  error: unknown
): Record<string, unknown> | undefined {
  if (error == null) return undefined;

  if (typeof error !== 'object') return undefined;

  const snapshot = pickPostgrestFields(error as Record<string, unknown>);
  if (snapshot) return snapshot;

  const cause = (error as { cause?: unknown }).cause;
  return cause !== undefined
    ? extractPostgrestLikeErrorSnapshot(cause)
    : undefined;
}

function pickPostgrestFields(
  value: Record<string, unknown>
): Record<string, unknown> | undefined {
  const keys = ['code', 'message', 'details', 'hint', 'status'] as const;
  const out: Record<string, unknown> = {};

  for (const key of keys) {
    if (value[key] !== undefined) {
      out[key] = value[key];
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}
