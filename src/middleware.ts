import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getMiddlewareCookieAuth } from '@/lib/supabase-middleware-auth';
import {
  buildLoginRedirectUrl,
  isApiPath,
  isExcludedAssetPath,
  isPublicPagePath,
  requiresAuthSession,
} from '@/lib/protectedRoutePolicy';

// Rate limiting for sensitive API routes is enforced in the route handlers
// via the shared Upstash Redis helpers in `src/app/api/_utils/rateLimit.ts`.
// Middleware must not keep a process-local request counter: that is not
// distributed across serverless instances and would duplicate route policy.

// ---------------------------------------------------------------------------
// ROUTE PROTECTION
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ------------------------------------------------------------------
  // 1. Let API routes through — withAuthRoute handles their auth, and
  //    sensitive handlers apply distributed rate limits after authorize.
  // ------------------------------------------------------------------
  if (isApiPath(pathname)) {
    return NextResponse.next();
  }

  // ------------------------------------------------------------------
  // 2. Static assets and Next.js internals — always allow
  // ------------------------------------------------------------------
  if (isExcludedAssetPath(pathname)) {
    return NextResponse.next();
  }

  // ------------------------------------------------------------------
  // 3. Public pages — no auth required
  // ------------------------------------------------------------------
  if (isPublicPagePath(pathname)) {
    return NextResponse.next();
  }

  // ------------------------------------------------------------------
  // 4. Protected pages — require a valid cookie-backed Supabase session
  // ------------------------------------------------------------------
  if (!requiresAuthSession(pathname)) {
    return NextResponse.next();
  }

  const auth = await getMiddlewareCookieAuth(request.cookies);

  if (!auth) {
    const redirectUrl = buildLoginRedirectUrl(
      request.nextUrl,
      pathname,
      request.nextUrl.search
    );
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
