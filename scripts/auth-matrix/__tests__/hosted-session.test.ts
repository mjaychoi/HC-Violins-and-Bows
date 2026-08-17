/** @jest-environment node */

import type { Session, User } from '@supabase/supabase-js';

import {
  readSupabaseAuthSession,
  SUPABASE_AUTH_STORAGE_KEY,
} from '../../../src/lib/supabase-auth-cookie';
import {
  assertSessionMatchesActor,
  buildCookieHeaderFromSession,
  buildHostedRequestHeaders,
} from '../hosted-session';

function cookieStoreFromHeader(header: string) {
  return {
    getAll: () =>
      header.split('; ').map(part => {
        const separator = part.indexOf('=');
        return {
          name: part.slice(0, separator),
          value: part.slice(separator + 1),
        };
      }),
  };
}

function sessionWithAccessToken(accessToken: string): Session {
  return {
    access_token: accessToken,
    refresh_token: 'refresh-token',
    expires_in: 3600,
    expires_at: 1_700_000_000,
    token_type: 'bearer',
    user: { id: 'user-1' },
  } as unknown as Session;
}

describe('hosted cookie session', () => {
  it('builds Cookie headers and never Authorization', () => {
    const header = buildCookieHeaderFromSession(
      sessionWithAccessToken('short-token')
    );
    const headers = buildHostedRequestHeaders({ cookieHeader: header });

    expect(headers.Cookie).toContain(`${SUPABASE_AUTH_STORAGE_KEY}=`);
    expect(Object.keys(headers)).toEqual(['Cookie']);
    expect(headers).not.toHaveProperty('Authorization');
    expect(JSON.stringify(headers)).not.toMatch(/Bearer /i);
  });

  it('round-trips a single-chunk session cookie', () => {
    const session = sessionWithAccessToken('short-token');
    const header = buildCookieHeaderFromSession(session);

    expect(header).toContain(`${SUPABASE_AUTH_STORAGE_KEY}=`);
    expect(header).not.toContain(`${SUPABASE_AUTH_STORAGE_KEY}.0=`);

    const restored = readSupabaseAuthSession(cookieStoreFromHeader(header));
    expect(restored?.access_token).toBe('short-token');
    expect(restored?.refresh_token).toBe('refresh-token');
  });

  it('round-trips a chunked session cookie past the chunk threshold', () => {
    const session = sessionWithAccessToken(`tok-${'a'.repeat(4000)}`);
    const header = buildCookieHeaderFromSession(session);

    expect(header).toContain(`${SUPABASE_AUTH_STORAGE_KEY}.0=`);
    expect(header).toContain(`${SUPABASE_AUTH_STORAGE_KEY}.1=`);

    const restored = readSupabaseAuthSession(cookieStoreFromHeader(header));
    expect(restored?.access_token).toBe(session.access_token);
  });

  it('does not include cookie values in thrown errors', () => {
    expect(() => buildHostedRequestHeaders({ cookieHeader: '' })).toThrow(
      /missing a cookie-backed session/i
    );

    try {
      buildHostedRequestHeaders({ cookieHeader: '' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toMatch(/hcv-sb-auth=/);
      expect(message).not.toContain('Cookie:');
    }
  });

  it('rejects a minted session that belongs to production', () => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' })
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ ref: 'prodrefexample9999', sub: 'user-1' })
    ).toString('base64url');
    const accessToken = `${header}.${payload}.sig`;

    expect(() =>
      assertSessionMatchesActor({
        session: sessionWithAccessToken(accessToken),
        user: { id: 'user-1' } as User,
        expectedUserId: 'user-1',
        expectedProjectRef: 'stagingexample1234',
        productionProjectRef: 'prodrefexample9999',
      })
    ).toThrow(/production project/i);
  });
});
