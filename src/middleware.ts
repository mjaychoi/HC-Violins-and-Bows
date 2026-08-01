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

// ---------------------------------------------------------------------------
// RATE LIMITING
// ---------------------------------------------------------------------------
// NOTE: This is an in-process sliding-window rate limiter.
// In a distributed / multi-instance deployment (Vercel, etc.) each function
// instance has its own map, so limits are per-instance, not global.
// For global rate limiting replace this with @upstash/ratelimit backed by
// a Redis / Upstash KV store.

interface RateEntry {
  count: number;
  resetAt: number;
}

const _rateLimitMap = new Map<string, RateEntry>();

function checkRateLimit(
  key: string,
  windowMs: number,
  max: number
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();

  // Evict expired entries when the map exceeds a threshold to prevent unbounded growth.
  if (_rateLimitMap.size > 5_000) {
    for (const [k, v] of _rateLimitMap) {
      if (now > v.resetAt) _rateLimitMap.delete(k);
    }
  }

  const entry = _rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    _rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (entry.count >= max) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSec };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

// ---------------------------------------------------------------------------
// ROUTE PROTECTION
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ------------------------------------------------------------------
  // 1. Rate-limit the sales export endpoint (admin-only but expensive)
  // ------------------------------------------------------------------
  if (
    pathname === '/api/sales' &&
    request.nextUrl.searchParams.get('export') === 'true'
  ) {
    const ip = getClientIp(request);
    const { allowed, retryAfterSec } = checkRateLimit(
      `export:${ip}`,
      60_000, // 1 minute window
      5 // max 5 export requests per minute per IP
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: retryAfterSec },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSec) },
        }
      );
    }
  }

  // ------------------------------------------------------------------
  // 2. Let API routes through — withAuthRoute handles their auth
  // ------------------------------------------------------------------
  if (isApiPath(pathname)) {
    return NextResponse.next();
  }

  // ------------------------------------------------------------------
  // 3. Static assets and Next.js internals — always allow
  // ------------------------------------------------------------------
  if (isExcludedAssetPath(pathname)) {
    return NextResponse.next();
  }

  // ------------------------------------------------------------------
  // 4. Public pages — no auth required
  // ------------------------------------------------------------------
  if (isPublicPagePath(pathname)) {
    return NextResponse.next();
  }

  // ------------------------------------------------------------------
  // 5. Protected pages — require a valid cookie-backed Supabase session
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
