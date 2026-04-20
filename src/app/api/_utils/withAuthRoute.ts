import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';

import {
  getCookieBackedAuth,
  type CookieBackedAuthResult,
} from '@/lib/supabase-server';
import { createApiErrorResponse } from '@/app/api/_utils/apiErrors';
import { ErrorSeverity } from '@/types/errors';
import { captureException } from '@/utils/monitoring';

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

type AuthResult = {
  user: User | null;
  accessToken: string | null;
  orgId: string | null;
  role: 'admin' | 'member';
  error: Error | null;
  userSupabase: AuthContext['userSupabase'] | null;
};

function extractOrgId(user: User): string | null {
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;

  for (const value of [appMeta.org_id, appMeta.orgId]) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function extractRole(user: User): 'admin' | 'member' {
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;

  for (const value of [appMeta.role, appMeta.app_role]) {
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
    console.error('[withAuthRoute] getUserFromRequest failed', {
      path: request.nextUrl.pathname,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      user: null,
      accessToken: null,
      orgId: null,
      role: 'member',
      error: error instanceof Error ? error : new Error(String(error)),
      userSupabase: null,
    };
  }
}

function isBenignAuthError(error: Error): boolean {
  const msg = error.message || '';
  const lower = msg.toLowerCase();

  return (
    msg === 'Missing cookie-backed session' ||
    lower.includes('jwt') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid token') ||
    lower.includes('auth session missing')
  );
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

export function getRequiredOrgId(auth: AuthContext): string {
  if (!auth.orgId) {
    throw new Error('Organization context required');
  }

  return auth.orgId;
}

export function requireOrgContext(auth: AuthContext): NextResponse | null {
  return auth.orgId ? null : createOrgContextRequiredResponse();
}

export function requireAdmin(auth: AuthContext): NextResponse | null {
  return auth.role === 'admin' ? null : createAdminRequiredResponse();
}

export function withAuthRoute(
  handler: AuthedHandler
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest): Promise<Response> => {
    const { user, accessToken, orgId, role, error, userSupabase } =
      await getUserFromRequest(request);

    if (!user || !accessToken || !userSupabase || error) {
      if (error && !isBenignAuthError(error)) {
        captureException(
          error,
          'API_AUTH_MIDDLEWARE',
          {
            path: request.nextUrl.pathname,
          },
          ErrorSeverity.LOW
        );
      }

      return createApiErrorResponse(
        {
          message: 'Valid Supabase session is required',
          error_code: 'UNAUTHORIZED',
        },
        401
      );
    }

    return handler(request, {
      user,
      accessToken,
      orgId,
      role,
      userSupabase,
      isTestBypass: false,
    });
  };
}
