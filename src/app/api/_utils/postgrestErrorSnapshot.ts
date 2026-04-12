/**
 * Extract PostgREST / Supabase-js error fields for operator logs (no PII by design).
 */
export function extractPostgrestLikeErrorSnapshot(
  error: unknown
): Record<string, unknown> | undefined {
  if (error == null) return undefined;

  const pick = (o: Record<string, unknown>) => {
    const keys = ['code', 'message', 'details', 'hint', 'status'] as const;
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      if (k in o && o[k] !== undefined) out[k] = o[k];
    }
    return Object.keys(out).length ? out : undefined;
  };

  if (typeof error === 'object') {
    const direct = pick(error as Record<string, unknown>);
    if (direct) return direct;
    const cause = (error as { cause?: unknown }).cause;
    if (cause !== undefined) {
      return extractPostgrestLikeErrorSnapshot(cause);
    }
  }

  return undefined;
}
