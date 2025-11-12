import '@testing-library/jest-dom';

// jsdom에서 WebSocket/polyfill
if (typeof global.WebSocket === 'undefined') {
  class DummyWS {
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
  }
  // @ts-ignore
  global.WebSocket = DummyWS;
}

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: jest.fn(),
      pop: jest.fn(),
      reload: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn().mockResolvedValue(undefined),
      beforePopState: jest.fn(),
      events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
      },
      isFallback: false,
    };
  },
}));

// Mock Next.js Link component
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }) => <a href={href}>{children}</a>,
}));

// Mock next/dynamic to return the wrapped component directly
jest.mock('next/dynamic', () => {
  return {
    __esModule: true,
    default: importer => {
      const mod = importer();
      // Handle promise or direct
      if (mod && typeof mod.then === 'function') {
        // Not awaiting; return a placeholder that renders nothing until resolved
        // For unit tests, it's fine to render empty div
        return () => <div data-testid="dynamic" />;
      }
      const Comp = mod.default || mod;
      return Comp || (() => null);
    },
  };
});

// Mock ErrorBoundary to render children directly in tests
jest.mock('@/components/common', () => {
  return {
    __esModule: true,
    ErrorBoundary: ({ children }) => children,
  };
});

// Mock App Layout components to simple containers
jest.mock('@/components/layout', () => {
  return {
    __esModule: true,
    AppLayout: ({ title, actionButton, children }) => (
      <div data-testid="app-layout">
        {title ? <h1>{title}</h1> : null}
        {actionButton ? (
          <button className="bg-blue-600" onClick={actionButton.onClick}>
            {actionButton.icon}
            {actionButton.label}
          </button>
        ) : null}
        {children}
      </div>
    ),
    AppHeader: () => <div data-testid="app-header" />,
    AppSidebar: () => <div data-testid="app-sidebar" />,
  };
});

// Mock DataContext hooks to avoid provider requirement in unit tests
jest.mock('@/contexts/DataContext', () => {
  const empty = [];
  const noop = async () => {};
  return {
    __esModule: true,
    useClients: () => ({
      clients: empty,
      loading: false,
      submitting: false,
      fetchClients: noop,
      createClient: async () => null,
      updateClient: async () => null,
      deleteClient: async () => true,
    }),
    useInstruments: () => ({
      instruments: empty,
      loading: false,
      submitting: false,
      fetchInstruments: noop,
      createInstrument: async () => null,
      updateInstrument: async () => null,
      deleteInstrument: async () => true,
    }),
    useConnections: () => ({
      connections: empty,
      loading: false,
      submitting: false,
      fetchConnections: noop,
      createConnection: async () => null,
      updateConnection: async () => null,
      deleteConnection: async () => true,
    }),
  };
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock performance.now() for Node.js environment
if (typeof global.performance === 'undefined') {
  global.performance = {
    now: jest.fn(() => Date.now()),
  };
} else if (!global.performance.now) {
  global.performance.now = jest.fn(() => Date.now());
}

// Mock Supabase to avoid ESM issues
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: [],
          error: null,
        })),
        or: jest.fn(() => ({
          limit: jest.fn(() => ({
            data: [],
            error: null,
          })),
        })),
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => ({
            data: null,
            error: null,
          })),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: null,
          error: null,
        })),
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: null,
          error: null,
        })),
      })),
    })),
  },
}));

// Note: Supabase helpers are mocked per-test where needed
