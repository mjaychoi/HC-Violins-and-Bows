import { createClient, type Session, type User } from '@supabase/supabase-js';

import {
  serializeSupabaseAuthCookieChunks,
  type PersistedSupabaseSession,
} from '../../src/lib/supabase-auth-cookie';
import type { AuthMatrixActor, AuthMatrixRole } from './constants';
import { safeErrorMessage } from './secret-redact';

export type HostedActor = {
  userId: string;
  orgId: string;
  role: AuthMatrixRole;
  label: AuthMatrixActor;
  cookieHeader: string;
};

export type HostedRequestHeaders = {
  Cookie: string;
};

function extractProjectRefFromAccessToken(accessToken: string): string | null {
  const parts = accessToken.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    ) as { ref?: unknown; iss?: unknown; sub?: unknown };

    if (typeof payload.ref === 'string' && payload.ref.trim()) {
      return payload.ref.trim().toLowerCase();
    }

    if (typeof payload.iss === 'string') {
      const issMatch = payload.iss.match(/\/project\/([a-z0-9]+)$/i);
      if (issMatch?.[1]) {
        return issMatch[1].toLowerCase();
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function toPersistedSupabaseSession(
  session: Session
): PersistedSupabaseSession {
  if (!session.access_token?.trim()) {
    throw new Error('Cannot mint auth cookie without an access token.');
  }

  const persisted: PersistedSupabaseSession = {
    access_token: session.access_token,
    token_type: session.token_type,
    user: session.user,
  };

  if (session.refresh_token) {
    persisted.refresh_token = session.refresh_token;
  }
  if (typeof session.expires_at === 'number') {
    persisted.expires_at = session.expires_at;
  }
  if (typeof session.expires_in === 'number') {
    persisted.expires_in = session.expires_in;
  }

  return persisted;
}

export function buildCookieHeaderFromSession(session: Session): string {
  return serializeSupabaseAuthCookieChunks(
    JSON.stringify(toPersistedSupabaseSession(session))
  )
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

export function buildHostedRequestHeaders(
  actor: Pick<HostedActor, 'cookieHeader'>
): HostedRequestHeaders {
  if (!actor.cookieHeader?.trim()) {
    throw new Error('Hosted actor is missing a cookie-backed session.');
  }

  return { Cookie: actor.cookieHeader };
}

export function assertSessionMatchesActor(options: {
  session: Session;
  user: User | null;
  expectedUserId: string;
  expectedProjectRef: string | null;
  productionProjectRef: string;
}): void {
  const { session, user, expectedUserId, expectedProjectRef } = options;

  if (!session.access_token?.trim()) {
    throw new Error('Minted session is missing an access token.');
  }
  if (!user?.id) {
    throw new Error('Minted session is missing a user.');
  }
  if (user.id !== expectedUserId || session.user?.id !== expectedUserId) {
    throw new Error('Minted session does not belong to the expected user.');
  }

  const tokenProjectRef = extractProjectRefFromAccessToken(
    session.access_token
  );
  if (tokenProjectRef && tokenProjectRef === options.productionProjectRef) {
    throw new Error(
      'Minted session targets the configured production project.'
    );
  }
  if (
    tokenProjectRef &&
    expectedProjectRef &&
    tokenProjectRef !== expectedProjectRef
  ) {
    throw new Error(
      'Minted session project ref does not match the auth-matrix target.'
    );
  }
}

export async function mintHostedActorSession(options: {
  supabaseUrl: string;
  anonKey: string;
  email: string;
  password: string;
  expectedUserId: string;
  expectedProjectRef: string | null;
  productionProjectRef: string;
  actorLabel: AuthMatrixActor;
}): Promise<string> {
  const supabase = createClient(options.supabaseUrl, options.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: options.email,
      password: options.password,
    });

    if (error || !data.session || !data.user) {
      throw new Error(`Auth-matrix sign-in failed for ${options.actorLabel}.`);
    }

    assertSessionMatchesActor({
      session: data.session,
      user: data.user,
      expectedUserId: options.expectedUserId,
      expectedProjectRef: options.expectedProjectRef,
      productionProjectRef: options.productionProjectRef,
    });

    return buildCookieHeaderFromSession(data.session);
  } catch (error) {
    throw new Error(
      `Auth-matrix sign-in failed for ${options.actorLabel}: ${safeErrorMessage(error)}`
    );
  }
}
