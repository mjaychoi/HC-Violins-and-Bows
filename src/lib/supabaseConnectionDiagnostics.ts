/**
 * Server-side Supabase endpoint identity for logs (no secrets).
 * Matches how `getUserSupabase` resolves URL: SUPABASE_URL ?? NEXT_PUBLIC_SUPABASE_URL.
 */
export type SupabaseUrlSource =
  | 'SUPABASE_URL'
  | 'NEXT_PUBLIC_SUPABASE_URL'
  | 'missing';

export function getSupabaseConnectionDiagnostics(): {
  host: string | null;
  projectRef: string | null;
  urlSource: SupabaseUrlSource;
} {
  const prefer = process.env.SUPABASE_URL?.trim();
  const pub = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const url = prefer || pub;
  const urlSource: SupabaseUrlSource = prefer
    ? 'SUPABASE_URL'
    : pub
      ? 'NEXT_PUBLIC_SUPABASE_URL'
      : 'missing';

  if (!url) {
    return { host: null, projectRef: null, urlSource: 'missing' };
  }

  try {
    const u = new URL(url);
    const m = /^([a-z0-9-]+)\.supabase\.co$/i.exec(u.hostname);
    return {
      host: u.host,
      projectRef: m ? m[1] : null,
      urlSource,
    };
  } catch {
    return { host: null, projectRef: null, urlSource };
  }
}
