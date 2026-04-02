import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';

import { getUserSupabase } from '@/lib/supabase-server';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity } from '@/types/errors';

export interface AuthContext {
  user: User;
  accessToken: string;
  orgId: string | null;
  clientId: string | null;
  role: 'admin' | 'member';
  userSupabase: ReturnType<typeof getUserSupabase>;
  isTestBypass: boolean;
}

type AuthedHandler = (
  request: NextRequest,
  auth: AuthContext
) => Promise<Response>;

interface AuthResult {
  user: User | null;
  accessToken: string | null;
  orgId: string | null;
  clientId: string | null;
  role: 'admin' | 'member';
  error: Error | null;
}

/**
 * Extract bearer token from Authorization header ("Bearer <token>")
 */
function extractBearerToken(authHeader: string | null): string {
  if (!authHeader) return '';
  const match = authHeader.match(/^bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

function getHeaderValue(request: NextRequest, key: string): string | null {
  try {
    const headers = request.headers as
      | Headers
      | Record<string, string | undefined>
      | undefined;

    if (!headers) return null;

    if (typeof headers.get === 'function') {
      return headers.get(key) ?? null;
    }

    const normalizedKey = key.toLowerCase();
    const record = headers as Record<string, string | undefined>;
    return record[key] ?? record[normalizedKey] ?? null;
  } catch {
    return null;
  }
}

function getCookieValue(request: NextRequest, key: string): string | null {
  try {
    const cookies = request.cookies;
    if (!cookies || typeof cookies.get !== 'function') return null;
    return cookies.get(key)?.value ?? null;
  } catch {
    return null;
  }
}

function hasValidE2EBypassSecret(request: NextRequest): boolean {
  const expectedSecret = process.env.E2E_BYPASS_SECRET?.trim();
  if (!expectedSecret) return false;

  const providedSecret =
    getHeaderValue(request, 'x-e2e-bypass-secret') ??
    getHeaderValue(request, 'X-E2E-BYPASS-SECRET') ??
    '';

  return providedSecret.trim() === expectedSecret;
}

/**
 * Pull org/client scope from known places.
 *
 * Keep this tolerant because projects often move these between
 * app_metadata, user_metadata, and custom claims.
 */
function extractOrgId(user: User): string | null {
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;

  const candidates = [
    appMeta.org_id,
    appMeta.orgId,
    userMeta.org_id,
    userMeta.orgId,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function extractClientId(user: User): string | null {
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;

  const candidates = [
    appMeta.client_id,
    appMeta.clientId,
    userMeta.client_id,
    userMeta.clientId,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function extractRole(user: User): 'admin' | 'member' {
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;

  const candidates = [
    appMeta.role,
    appMeta.app_role,
    userMeta.role,
    userMeta.app_role,
  ];

  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'admin') return 'admin';
    if (normalized === 'member') return 'member';
  }

  return 'member';
}

async function getUserFromRequest(request: NextRequest): Promise<AuthResult> {
  try {
    const rawHeader =
      getHeaderValue(request, 'authorization') ??
      getHeaderValue(request, 'Authorization') ??
      '';

    const bearerToken = extractBearerToken(rawHeader);

    const cookieToken =
      getCookieValue(request, 'sb-access-token') ||
      getCookieValue(request, 'sb:access-token') ||
      getCookieValue(request, 'sb-token') ||
      '';

    const token = (bearerToken || cookieToken).trim();

    if (!token) {
      return {
        user: null,
        accessToken: null,
        orgId: null,
        clientId: null,
        role: 'member',
        error: new Error('Missing authorization token'),
      };
    }

    const userSupabase = getUserSupabase(token);
    const {
      data: { user },
      error,
    } = await userSupabase.auth.getUser();

    if (error || !user) {
      return {
        user: null,
        accessToken: null,
        orgId: null,
        clientId: null,
        role: 'member',
        error: new Error(error?.message || 'Invalid token'),
      };
    }

    return {
      user,
      accessToken: token,
      orgId: extractOrgId(user),
      clientId: extractClientId(user),
      role: extractRole(user),
      error: null,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      user: null,
      accessToken: null,
      orgId: null,
      clientId: null,
      role: 'member',
      error: err,
    };
  }
}

const TEST_USER: User = {
  id: 'test-user',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'test@example.com',
  created_at: new Date(0).toISOString(),
  app_metadata: {
    org_id: 'test-org',
    client_id: 'test-client',
  },
  user_metadata: {},
} as User;

function buildTestAuthContext(): AuthContext {
  const accessToken = 'test-access-token';

  return {
    user: TEST_USER,
    accessToken,
    orgId: 'test-org',
    clientId: 'test-client',
    role: 'admin',
    userSupabase: getUserSupabase(accessToken),
    isTestBypass: true,
  };
}

export function createOrgContextRequiredResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Organization context required' },
    { status: 403 }
  );
}

export function createAdminRequiredResponse(): NextResponse {
  return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
}

export function requireOrgContext(auth: AuthContext): NextResponse | null {
  if (auth.orgId) return null;
  return createOrgContextRequiredResponse();
}

export function requireAdmin(auth: AuthContext): NextResponse | null {
  if (auth.role === 'admin') return null;
  return createAdminRequiredResponse();
}

/**
 * API route auth middleware
 *
 * What it guarantees:
 * - valid Supabase user session is required
 * - auth context is passed to the route
 * - route gets a USER-SCOPED Supabase client by default
 *
 * What it does NOT guarantee:
 * - resource ownership checks
 * - domain-specific authorization rules
 *
 * Route handlers must still verify that requested resources
 * belong to the authenticated user's allowed scope.
 */
export function withAuthRoute(
  handler: AuthedHandler
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest) => {
    const isProd = process.env.NODE_ENV === 'production';

    if (process.env.NODE_ENV === 'test') {
      return handler(request, buildTestAuthContext());
    }

    if (
      !isProd &&
      process.env.E2E_BYPASS_AUTH === 'true' &&
      hasValidE2EBypassSecret(request)
    ) {
      return handler(request, buildTestAuthContext());
    }

    if (
      !isProd &&
      getHeaderValue(request, 'x-e2e-bypass') === '1' &&
      hasValidE2EBypassSecret(request)
    ) {
      return handler(request, buildTestAuthContext());
    }

    const { user, accessToken, orgId, clientId, role, error } =
      await getUserFromRequest(request);

    if (!user || !accessToken || error) {
      if (error) {
        const msg = error.message || '';
        const lower = msg.toLowerCase();

        const isBenignAuthError =
          msg === 'Missing authorization token' ||
          msg === 'Invalid token' ||
          lower.includes('jwt') ||
          lower.includes('unauthorized') ||
          lower.includes('invalid token') ||
          lower.includes('auth session missing');

        if (!isBenignAuthError) {
          captureException(
            error,
            'API_AUTH_MIDDLEWARE',
            {
              path: request.nextUrl.pathname,
            },
            ErrorSeverity.LOW
          );
        }
      }

      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Valid Supabase session is required',
        },
        { status: 401 }
      );
    }

    const auth: AuthContext = {
      user,
      accessToken,
      orgId,
      clientId,
      role,
      userSupabase: getUserSupabase(accessToken),
      isTestBypass: false,
    };

    return handler(request, auth);
  };
}
