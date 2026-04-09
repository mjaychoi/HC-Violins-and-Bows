import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';

import {
  getCookieBackedAuth,
  type CookieBackedAuthResult,
} from '@/lib/supabase-server';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity } from '@/types/errors';
import { createApiErrorResponse } from '@/app/api/_utils/apiErrors';

export interface AuthContext {
  user: User;
  accessToken: string;
  orgId: string | null;
  role: 'admin' | 'member';
  userSupabase: CookieBackedAuthResult['userSupabase'];
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
  role: 'admin' | 'member';
  error: Error | null;
  userSupabase: AuthContext['userSupabase'] | null;
}

/**
 * Pull auth claims only from trusted server-controlled metadata.
 *
 * Do not read user_metadata here. In Supabase, users can mutate their own
 * user_metadata, so using it for org or role decisions is a privilege-
 * escalation risk.
 */
function extractOrgId(user: User): string | null {
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;

  const candidates = [appMeta.org_id, appMeta.orgId];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function extractRole(user: User): 'admin' | 'member' {
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;

  const candidates = [appMeta.role, appMeta.app_role];

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
    const cookieAuth = await getCookieBackedAuth(request.cookies);

    if (!cookieAuth) {
      return {
        user: null,
        accessToken: null,
        orgId: null,
        role: 'member',
        error: new Error('Missing cookie-backed session'),
        userSupabase: null,
      };
    }

    return {
      user: cookieAuth.user,
      accessToken: cookieAuth.accessToken,
      orgId: extractOrgId(cookieAuth.user),
      role: extractRole(cookieAuth.user),
      error: null,
      userSupabase: cookieAuth.userSupabase,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      user: null,
      accessToken: null,
      orgId: null,
      role: 'member',
      error: err,
      userSupabase: null,
    };
  }
}

export function createOrgContextRequiredResponse(): NextResponse {
  return createApiErrorResponse(
    { message: 'Organization context required' },
    403
  );
}

export function createAdminRequiredResponse(): NextResponse {
  return createApiErrorResponse(
    {
      message: 'Admin role required',
      error_code: 'ADMIN_REQUIRED',
    },
    403
  );
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
    const { user, accessToken, orgId, role, error, userSupabase } =
      await getUserFromRequest(request);

    if (!user || !accessToken || !userSupabase || error) {
      if (error) {
        const msg = error.message || '';
        const lower = msg.toLowerCase();

        const isBenignAuthError =
          msg === 'Missing cookie-backed session' ||
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

      return createApiErrorResponse(
        {
          message: 'Valid Supabase session is required',
          error_code: 'UNAUTHORIZED',
        },
        401
      );
    }

    const auth: AuthContext = {
      user,
      accessToken,
      orgId,
      role,
      userSupabase,
      isTestBypass: false,
    };

    return handler(request, auth);
  };
}
