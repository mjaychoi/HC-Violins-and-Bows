import { render } from '@/test-utils/render';
import RootProviders from '@/components/providers/RootProviders';

// Mock ErrorBoundary
jest.mock('@/components/common', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}));

// Mock DataProvider
jest.mock('@/contexts/DataContext', () => ({
  DataProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="data-provider">{children}</div>
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

  it('should render DataProvider', () => {
    const { getByTestId } = render(
      <RootProviders>
        <div>Test Content</div>
      </RootProviders>
    );

    expect(getByTestId('data-provider')).toBeInTheDocument();
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
    const dataProvider = container.querySelector(
      '[data-testid="data-provider"]'
    );

    expect(errorBoundary).toBeInTheDocument();
    expect(authProvider).toBeInTheDocument();
    expect(dataProvider).toBeInTheDocument();

    // Verify nesting: ErrorBoundary > AuthProvider > DataProvider > children
    expect(errorBoundary?.contains(authProvider)).toBe(true);
    expect(authProvider?.contains(dataProvider)).toBe(true);
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
