// Cross-tab notification for AuthContext (V7-001). The app persists the
// Supabase session in cookies (see supabase-auth-cookie.ts), not
// localStorage, so the Supabase SDK's built-in multi-tab sync — which relies
// on the browser `storage` event firing for localStorage writes — never
// engages. This module is a dedicated localStorage "ping": it never carries
// identity data, only a signal that the authoritative session should be
// re-read via supabase.auth.getSession().

export const AUTH_CROSS_TAB_SIGNAL_KEY = 'hcv-auth-cross-tab-signal';

export function signalAuthChanged(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(AUTH_CROSS_TAB_SIGNAL_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable (private browsing, disabled storage, etc.);
    // cross-tab reconciliation degrades to same-tab-only, nothing else to do.
  }
}

export function isAuthCrossTabSignalEvent(event: StorageEvent): boolean {
  return event.key === AUTH_CROSS_TAB_SIGNAL_KEY;
}
