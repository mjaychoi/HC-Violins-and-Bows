/**
 * Pure route-protection policy used by middleware.
 * Keep this module free of Next.js request types and Node-only APIs
 * so unit tests and the Edge middleware share one source of truth.
 */

/** Path prefixes accessible without authentication (login page `/` handled separately). */
export const PUBLIC_PAGE_PREFIXES = [
  '/signup',
  '/customer',
  '/onboarding',
] as const;

/** API routes have their own auth via withAuthRoute — no middleware redirect. */
export const API_PREFIX = '/api';

export const STATIC_EXTENSIONS = [
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.js',
  '.css',
  '.map',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.json',
  '.txt',
  '.xml',
] as const;

export function isApiPath(pathname: string): boolean {
  return pathname.startsWith(API_PREFIX);
}

export function isExcludedAssetPath(pathname: string): boolean {
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return true;
  }
  return STATIC_EXTENSIONS.some(ext => pathname.endsWith(ext));
}

export function isPublicPagePath(pathname: string): boolean {
  if (pathname === '/') {
    return true;
  }
  return PUBLIC_PAGE_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

/**
 * True when middleware should require a cookie-backed session.
 * API / static / public paths are excluded.
 */
export function requiresAuthSession(pathname: string): boolean {
  if (isApiPath(pathname)) return false;
  if (isExcludedAssetPath(pathname)) return false;
  if (isPublicPagePath(pathname)) return false;
  return true;
}

/**
 * Build the unauthenticated redirect target (public login entry `/`).
 * Preserves an internal return path via `?next=` and blocks open redirects.
 */
export function buildLoginRedirectUrl(
  requestUrl: URL,
  pathname: string,
  search: string
): URL {
  const url = new URL(requestUrl.toString());
  url.pathname = '/';
  url.search = '';

  const next = pathname + search;
  if (next.startsWith('/') && !next.startsWith('//')) {
    url.searchParams.set('next', encodeURIComponent(next));
  }

  return url;
}
