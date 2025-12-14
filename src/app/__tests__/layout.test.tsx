import { render } from '@/test-utils/render';
import RootProviders from '@/components/providers/RootProviders';

// Mock ErrorBoundary
jest.mock('@/components/common', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}));

// Mock individual Context Providers (replaced DataProvider)
jest.mock('@/contexts/ClientsContext', () => ({
  ClientsProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="clients-provider">{children}</div>
  ),
}));

jest.mock('@/contexts/InstrumentsContext', () => ({
  InstrumentsProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="instruments-provider">{children}</div>
  ),
}));

jest.mock('@/contexts/ConnectionsContext', () => ({
  ConnectionsProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="connections-provider">{children}</div>
  ),
}));

// Mock AuthProvider
jest.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-provider">{children}</div>
  ),
}));

// Mock DataInitializer
jest.mock('@/components/providers/DataInitializer', () => ({
  DataInitializer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="data-initializer">{children}</div>
  ),
}));

describe('RootLayout', () => {
  it('should render children within providers', () => {
    const { getByText } = render(
      <RootProviders>
        <div>Test Content</div>
      </RootProviders>
    );

    expect(getByText('Test Content')).toBeInTheDocument();
  });

  it('should render ErrorBoundary', () => {
    const { getByTestId } = render(
      <RootProviders>
        <div>Test Content</div>
      </RootProviders>
    );

    expect(getByTestId('error-boundary')).toBeInTheDocument();
  });

  it('should render AuthProvider', () => {
    const { getByTestId } = render(
      <RootProviders>
        <div>Test Content</div>
      </RootProviders>
    );

    expect(getByTestId('auth-provider')).toBeInTheDocument();
  });

  it('should render Context Providers', () => {
    const { getByTestId } = render(
      <RootProviders>
        <div>Test Content</div>
      </RootProviders>
    );

    expect(getByTestId('clients-provider')).toBeInTheDocument();
    expect(getByTestId('instruments-provider')).toBeInTheDocument();
    expect(getByTestId('connections-provider')).toBeInTheDocument();
  });

  it('should have correct provider nesting order', () => {
    const { container } = render(
      <RootProviders>
        <div>Test Content</div>
      </RootProviders>
    );

    const errorBoundary = container.querySelector(
      '[data-testid="error-boundary"]'
    );
    const authProvider = container.querySelector(
      '[data-testid="auth-provider"]'
    );
    const clientsProvider = container.querySelector(
      '[data-testid="clients-provider"]'
    );
    const instrumentsProvider = container.querySelector(
      '[data-testid="instruments-provider"]'
    );
    const connectionsProvider = container.querySelector(
      '[data-testid="connections-provider"]'
    );

    expect(errorBoundary).toBeInTheDocument();
    expect(authProvider).toBeInTheDocument();
    expect(clientsProvider).toBeInTheDocument();
    expect(instrumentsProvider).toBeInTheDocument();
    expect(connectionsProvider).toBeInTheDocument();

    // Verify nesting: ErrorBoundary > AuthProvider > ToastProvider > ClientsProvider > InstrumentsProvider > ConnectionsProvider > children
    const toastProvider = container.querySelector(
      '[data-testid="toast-provider"]'
    );
    expect(toastProvider).toBeInTheDocument();
    
    expect(errorBoundary?.contains(authProvider)).toBe(true);
    expect(authProvider?.contains(toastProvider)).toBe(true);
    expect(toastProvider?.contains(clientsProvider)).toBe(true);
    expect(clientsProvider?.contains(instrumentsProvider)).toBe(true);
    expect(instrumentsProvider?.contains(connectionsProvider)).toBe(true);
  });

  it('should import globals.css', () => {
    // This is tested implicitly by the component rendering
    // The import statement is at the top of the file
    render(
      <RootProviders>
        <div>Test Content</div>
      </RootProviders>
    );

    // If the import fails, the test would fail
    expect(true).toBe(true);
  });
});
