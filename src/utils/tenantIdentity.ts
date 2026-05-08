import type { Session, User } from '@supabase/supabase-js';
import { ApiFetchAuthError, ApiFetchError } from '@/utils/apiFetch';

type TenantIdentityInput = {
  user: User | null;
  orgId: string | null;
  session: Session | null;
  loading: boolean;
};

function getSessionIdentity(session: Session | null): string | null {
  if (!session) return null;

  if (
    typeof session.user?.last_sign_in_at === 'string' &&
    session.user.last_sign_in_at.trim().length > 0
  ) {
    return session.user.last_sign_in_at.trim();
  }

  if (typeof session.expires_at === 'number' && session.expires_at > 0) {
    return String(session.expires_at);
  }

  return 'session-present';
}

export function getTenantIdentityKey({
  user,
  orgId,
  session,
  loading,
}: TenantIdentityInput): string | null {
  const sessionIdentity = getSessionIdentity(session);

  if (loading || !user?.id || !orgId || !sessionIdentity) {
    return null;
  }

  return `${user.id}:${orgId}:${sessionIdentity}`;
}

export function isAuthLikeTenantError(error: unknown): boolean {
  if (
    typeof ApiFetchAuthError === 'function' &&
    error instanceof ApiFetchAuthError
  ) {
    return true;
  }

  if (
    typeof ApiFetchError === 'function' &&
    error instanceof ApiFetchError &&
    error.code === 'AUTH'
  ) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  if (code === 'SESSION_EXPIRED' || code === 'UNAUTHORIZED') {
    return true;
  }

  const lower = message.toLowerCase();
  return (
    lower.includes('invalid refresh token') ||
    lower.includes('refresh token not found') ||
    lower.includes('session expired') ||
    lower.includes('unauthorized') ||
    lower.includes('authentication required') ||
    lower.includes('forbidden')
  );
}
