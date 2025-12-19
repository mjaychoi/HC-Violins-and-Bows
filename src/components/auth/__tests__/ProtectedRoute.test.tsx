import { render, screen } from '@/test-utils/render';
import ProtectedRoute from '../ProtectedRoute';

// Mock next/navigation
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  usePathname: () => '/protected',
}));

// Mock AuthContext
const mockUseAuth = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('ProtectedRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render children when user is authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', email: 'test@example.com' },
      loading: false,
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should show loading state when checking auth', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: true,
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should redirect to home when user is not authenticated', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    // ProtectedRoute no longer handles redirects (moved to AppLayout)
    // It only shows "Redirecting..." UI
    expect(screen.getByText('Redirecting...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    // Redirect is handled by AppLayout, not ProtectedRoute
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should not redirect while loading', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: true,
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should not render children when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Redirecting...')).toBeInTheDocument();
  });

  it('should handle user state changes', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
    });

    const { rerender } = render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    // ProtectedRoute no longer handles redirects (moved to AppLayout)
    expect(screen.getByText('Redirecting...')).toBeInTheDocument();

    mockUseAuth.mockReturnValue({
      user: { id: '1', email: 'test@example.com' },
      loading: false,
    });

    rerender(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
