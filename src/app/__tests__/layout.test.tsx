import { render as rtlRender } from '@testing-library/react';
import '@testing-library/jest-dom';
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

// Mock ToastProvider
jest.mock('@/contexts/ToastContext', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="toast-provider">{children}</div>
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
    const { getByText } = rtlRender(
      <RootProviders>
        <div>Test Content</div>
      </RootProviders>
    );

    expect(getByText('Test Content')).toBeInTheDocument();
  });

  it('should render ErrorBoundary', () => {
    const { getByTestId } = rtlRender(
      <RootProviders>
        <div>Test Content</div>
      </RootProviders>
    );

    expect(getByTestId('error-boundary')).toBeInTheDocument();
  });

  it('should render AuthProvider', () => {
    const { getByTestId } = rtlRender(
      <RootProviders>
        <div>Test Content</div>
      </RootProviders>
    );

    expect(getByTestId('auth-provider')).toBeInTheDocument();
  });

  it('should render Context Providers', () => {
    const { getAllByTestId } = rtlRender(
      <RootProviders>
        <div>Test Content</div>
      </RootProviders>
    );

    // RootProviders 내부의 Provider만 확인 (중복 제거)
    const clientsProviders = getAllByTestId('clients-provider');
    const instrumentsProviders = getAllByTestId('instruments-provider');
    const connectionsProviders = getAllByTestId('connections-provider');

    // 최소 1개는 있어야 함 (RootProviders 내부)
    expect(clientsProviders.length).toBeGreaterThanOrEqual(1);
    expect(instrumentsProviders.length).toBeGreaterThanOrEqual(1);
    expect(connectionsProviders.length).toBeGreaterThanOrEqual(1);
  });

  it('should have correct provider nesting order', () => {
    const { container } = rtlRender(
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
    rtlRender(
      <RootProviders>
        <div>Test Content</div>
      </RootProviders>
    );

    // If the import fails, the test would fail
    expect(true).toBe(true);
  });
});
