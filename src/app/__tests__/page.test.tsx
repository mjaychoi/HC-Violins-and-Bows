import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import LoginPage from '../page';
import { useAuth } from '@/contexts/AuthContext';

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(() => mockSearchParams),
}));

// Mock AuthContext
jest.mock('@/contexts/AuthContext', () => {
  const actual = jest.requireActual('@/contexts/AuthContext');
  return { ...actual, useAuth: jest.fn() };
});

// Mock useLoadingState
jest.mock('@/hooks/useLoadingState', () => ({
  useLoadingState: jest.fn(() => ({
    loading: false,
    withLoading: jest.fn(fn => fn()),
  })),
}));

const mockPush = jest.fn();
const mockSignIn = jest.fn();
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const mockReplace = jest.fn();

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams.delete('next');
    mockUseRouter.mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      prefetch: jest.fn(),
      back: jest.fn(),
      refresh: jest.fn(),
      forward: jest.fn(),
    } as any);

    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      role: 'member',
      orgId: null,
      hasOrgContext: false,
      loading: false,
      signIn: mockSignIn,
      signUp: jest.fn(),
      signOut: jest.fn(),
      refreshSession: jest.fn(),
    } as any);
  });

  it('should render login form', () => {
    render(<LoginPage />);

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign in/i })
    ).toBeInTheDocument();
  });

  it('should render company logo', () => {
    const { container } = render(<LoginPage />);

    const logo = container.querySelector('svg');
    expect(logo).toBeInTheDocument();
  });

  it('should render page title', () => {
    render(<LoginPage />);

    expect(screen.getByText(/Instrument Inventory App/i)).toBeInTheDocument();
    expect(screen.getByText(/Sign in to your account/i)).toBeInTheDocument();
  });

  it('should render signup link', () => {
    render(<LoginPage />);

    const signupLink = screen.getByRole('link', { name: /create an account/i });
    expect(signupLink).toBeInTheDocument();
    expect(signupLink).toHaveAttribute('href', '/signup');
  });

  it('should update email input', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 'test@example.com');

    expect(emailInput).toHaveValue('test@example.com');
  });

  it('should update password input', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(passwordInput, 'password123');

    expect(passwordInput).toHaveValue('password123');
  });

  it('should handle form submission', async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValue({ error: null });

    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith(
        'test@example.com',
        'password123'
      );
    });
  });

  it('should display error message on login failure', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Invalid credentials';
    mockSignIn.mockResolvedValue({
      error: { message: errorMessage } as any,
    });

    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'wrongpassword');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('should show loading state while checking auth', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      role: 'member',
      orgId: null,
      hasOrgContext: false,
      loading: true,
      signIn: mockSignIn,
      signUp: jest.fn(),
      signOut: jest.fn(),
      refreshSession: jest.fn(),
    } as any);

    render(<LoginPage />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('should redirect to dashboard if user is already logged in', async () => {
    const mockUser = { id: '1', email: 'test@example.com' } as any;
    mockUseAuth.mockReturnValue({
      user: mockUser,
      session: {} as any,
      role: 'member',
      orgId: 'org-1',
      hasOrgContext: true,
      loading: false,
      signIn: mockSignIn,
      signUp: jest.fn(),
      signOut: jest.fn(),
      refreshSession: jest.fn(),
    } as any);

    render(<LoginPage />);

    // LoginRedirect uses useEffect with router.replace, so wait for it to execute
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('should redirect logged-in users without org context to onboarding', async () => {
    const mockUser = { id: '1', email: 'test@example.com' } as any;
    mockUseAuth.mockReturnValue({
      user: mockUser,
      session: {} as any,
      role: 'member',
      orgId: null,
      hasOrgContext: false,
      loading: false,
      signIn: mockSignIn,
      signUp: jest.fn(),
      signOut: jest.fn(),
      refreshSession: jest.fn(),
    } as any);

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        '/onboarding/organization?next=%2Fdashboard'
      );
    });
  });

  it('should preserve next parameter when redirecting logged-in users without org context', async () => {
    mockSearchParams.set('next', '/sales');
    const mockUser = { id: '1', email: 'test@example.com' } as any;
    mockUseAuth.mockReturnValue({
      user: mockUser,
      session: {} as any,
      role: 'member',
      orgId: null,
      hasOrgContext: false,
      loading: false,
      signIn: mockSignIn,
      signUp: jest.fn(),
      signOut: jest.fn(),
      refreshSession: jest.fn(),
    } as any);

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        '/onboarding/organization?next=%2Fsales'
      );
    });
  });

  it('should disable submit button while loading', () => {
    const { useLoadingState } = require('@/hooks/useLoadingState');
    useLoadingState.mockReturnValue({
      loading: true,
      withLoading: jest.fn(fn => fn()),
    });

    render(<LoginPage />);

    const submitButton = screen.getByRole('button', { name: /signing in/i });
    expect(submitButton).toBeDisabled();
  });

  it('should show "Signing in..." text when loading', () => {
    const { useLoadingState } = require('@/hooks/useLoadingState');
    useLoadingState.mockReturnValue({
      loading: true,
      withLoading: jest.fn(fn => fn()),
    });

    render(<LoginPage />);

    expect(screen.getByText(/signing in/i)).toBeInTheDocument();
  });

  it('should handle form input changes', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');

    expect(emailInput).toHaveValue('test@example.com');
    expect(passwordInput).toHaveValue('password123');
  });

  it('should have required attributes on inputs', () => {
    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);

    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toHaveAttribute('required');
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput).toHaveAttribute('required');
  });

  it('should have proper autocomplete attributes', () => {
    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);

    expect(emailInput).toHaveAttribute('autoComplete', 'email');
    expect(passwordInput).toHaveAttribute('autoComplete', 'current-password');
  });
});
