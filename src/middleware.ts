import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/', '/signup', '/onboarding', '/customer', '/api'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    p => pathname === p || pathname.startsWith(p + '/')
  );

  if (isPublic) return NextResponse.next();

  const token =
    request.cookies.get('sb-access-token')?.value ||
    request.cookies.get('sb:access-token')?.value;

  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('next', encodeURIComponent(pathname));
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
