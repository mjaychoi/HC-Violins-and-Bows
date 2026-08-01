import {
  buildLoginRedirectUrl,
  isApiPath,
  isExcludedAssetPath,
  isPublicPagePath,
  requiresAuthSession,
} from '@/lib/protectedRoutePolicy';

describe('protectedRoutePolicy', () => {
  describe('isPublicPagePath', () => {
    it('treats / as the public login entry', () => {
      expect(isPublicPagePath('/')).toBe(true);
    });

    it('allows signup, customer, and onboarding prefixes', () => {
      expect(isPublicPagePath('/signup')).toBe(true);
      expect(isPublicPagePath('/customer/portal')).toBe(true);
      expect(isPublicPagePath('/onboarding/org')).toBe(true);
    });

    it('does not treat protected app pages as public', () => {
      expect(isPublicPagePath('/dashboard')).toBe(false);
      expect(isPublicPagePath('/invoices')).toBe(false);
      expect(isPublicPagePath('/sales')).toBe(false);
    });
  });

  describe('isExcludedAssetPath', () => {
    it('excludes Next internals and favicon', () => {
      expect(isExcludedAssetPath('/_next/static/chunks/main.js')).toBe(true);
      expect(isExcludedAssetPath('/favicon.ico')).toBe(true);
    });

    it('excludes common static extensions', () => {
      expect(isExcludedAssetPath('/brand/logo.svg')).toBe(true);
      expect(isExcludedAssetPath('/robots.txt')).toBe(true);
    });

    it('does not exclude HTML app routes', () => {
      expect(isExcludedAssetPath('/dashboard')).toBe(false);
    });
  });

  describe('isApiPath / requiresAuthSession', () => {
    it('leaves API routes to withAuthRoute', () => {
      expect(isApiPath('/api/invoices')).toBe(true);
      expect(requiresAuthSession('/api/invoices')).toBe(false);
    });

    it('requires auth for protected pages', () => {
      expect(requiresAuthSession('/dashboard')).toBe(true);
      expect(requiresAuthSession('/invoices')).toBe(true);
      expect(requiresAuthSession('/sales')).toBe(true);
      expect(requiresAuthSession('/settings/invoice')).toBe(true);
    });

    it('does not require auth for public and asset routes', () => {
      expect(requiresAuthSession('/')).toBe(false);
      expect(requiresAuthSession('/signup')).toBe(false);
      expect(requiresAuthSession('/_next/static/x.js')).toBe(false);
    });
  });

  describe('buildLoginRedirectUrl', () => {
    it('redirects to / and preserves an internal next path', () => {
      const url = buildLoginRedirectUrl(
        new URL('http://127.0.0.1:3000/dashboard?tab=1'),
        '/dashboard',
        '?tab=1'
      );
      expect(url.pathname).toBe('/');
      expect(url.searchParams.get('next')).toBe(
        encodeURIComponent('/dashboard?tab=1')
      );
    });

    it('blocks open redirects via protocol-relative paths', () => {
      const url = buildLoginRedirectUrl(
        new URL('http://127.0.0.1:3000/dashboard'),
        '//evil.example',
        ''
      );
      expect(url.pathname).toBe('/');
      expect(url.searchParams.get('next')).toBeNull();
    });
  });
});
