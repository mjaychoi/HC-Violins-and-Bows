// Global Jest setup (CommonJS)
// NOTE: This file is loaded via setupFilesAfterEnv in jest.config.js

const React = require('react');
require('@testing-library/jest-dom');

// Polyfill performance.now in Node test env
if (typeof global.performance === 'undefined') {
  global.performance = {
    now: jest.fn(() => Date.now()),
  };
} else if (!global.performance.now) {
  global.performance.now = jest.fn(() => Date.now());
}

// Polyfill window.matchMedia for components using responsive hooks (e.g. AppLayout)
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = function matchMedia(query) {
    return {
      matches: false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(), // deprecated but included for safety
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
  };
}

// Mock Next.js app router hooks so hooks using next/navigation
// (e.g. useURLState/usePageFilters/useFilters) can run in tests
jest.mock('next/navigation', () => {
  const createSearchParams = urlString => {
    try {
      const url = new URL(urlString || 'http://localhost/');
      return url.searchParams;
    } catch {
      return new URL('http://localhost/').searchParams;
    }
  };

  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
  };

  return {
    __esModule: true,
    useRouter: () => mockRouter,
    usePathname: () => '/test-path',
    useSearchParams: () => createSearchParams('http://localhost/test-path'),
  };
});

// Mock next/server for API route tests so that NextRequest/NextResponse
// work in the Node/Jest environment without relying on the real Web API
jest.mock('next/server', () => {
  class NextRequest {
    constructor(input, init = {}) {
      this.url = input;
      this.method = init.method || 'GET';
      this._body = init.body;
      this.nextUrl = new URL(input);
    }

    get headers() {
      return new Map();
    }

    async json() {
      if (this._body == null) return null;
      if (typeof this._body === 'string') {
        try {
          return JSON.parse(this._body);
        } catch {
          // 테스트에서는 파싱 실패도 허용하고 원본을 그대로 반환
          return this._body;
        }
      }
      return this._body;
    }
  }

  const NextResponse = {
    json(body, init = {}) {
      const status = init.status ?? 200;
      return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => body,
      };
    },
  };

  return {
    __esModule: true,
    NextRequest,
    NextResponse,
  };
});

// Mock ErrorToast / SuccessToasts to keep tests stable
jest.mock('@/components/ErrorToast', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

jest.mock('@/components/common/feedback/SuccessToasts', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

// Make ErrorBoundary render children directly to avoid wrapping error UI in tests
jest.mock('@/components/common', () => {
  const actual = jest.requireActual('@/components/common');
  return {
    __esModule: true,
    ...actual,
    ErrorBoundary: ({ children }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// Mock AppLayout to avoid requiring AuthProvider/useAuth in page tests
jest.mock('@/components/layout', () => {
  return {
    __esModule: true,
    AppLayout: ({ title, actionButton, children }) =>
      React.createElement(
        'div',
        { 'data-testid': 'app-layout' },
        title ? React.createElement('h1', null, title) : null,
        actionButton
          ? React.createElement(
              'button',
              { className: 'bg-blue-600', onClick: actionButton.onClick },
              actionButton.icon,
              actionButton.label
            )
          : null,
        children
      ),
    AppHeader: () =>
      React.createElement('div', { 'data-testid': 'app-header' }),
    AppSidebar: () =>
      React.createElement('div', { 'data-testid': 'app-sidebar' }),
  };
});
