import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import SignUpPage from '../page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/hooks/useLoadingState', () => ({
  useLoadingState: jest.fn(() => ({
    loading: false,
    withLoading: jest.fn(fn => Promise.resolve(fn())),
  })),
}));

jest.mock('@/components/common', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe('SignUpPage', () => {
  const mockPush = jest.fn();
  const mockSignUp = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: mockPush,
    } as unknown as ReturnType<typeof useRouter>);
    mockUseAuth.mockReturnValue({
      signUp: mockSignUp,
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('should render signup form', () => {
    render(<SignUpPage />);
    expect(screen.getByText('Create your account')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();
  });

  it('should show error when passwords do not match', async () => {
    const user = userEvent.setup();
    render(<SignUpPage />);

    const emailInput = screen.getByLabelText(/Email address/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i);
    const submitButton = screen.getByRole('button', { name: /Sign up/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.type(confirmPasswordInput, 'different');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
  });

  it('should show error when password is too short', async () => {
    const user = userEvent.setup();
    render(<SignUpPage />);

    const emailInput = screen.getByLabelText(/Email address/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i);
    const submitButton = screen.getByRole('button', { name: /Sign up/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, '12345');
    await user.type(confirmPasswordInput, '12345');
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText('Password must be at least 6 characters')
      ).toBeInTheDocument();
    });
  });

  it('should call signUp with correct credentials', async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValue({ error: null });

    render(<SignUpPage />);

    const emailInput = screen.getByLabelText(/Email address/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i);
    const submitButton = screen.getByRole('button', { name: /Sign up/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.type(confirmPasswordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith(
        'test@example.com',
        'password123'
      );
    });
  });

  it('should show error message when signUp fails', async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValue({
      error: { message: 'Email already exists' },
    });

    render(<SignUpPage />);

    const emailInput = screen.getByLabelText(/Email address/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i);
    const submitButton = screen.getByRole('button', { name: /Sign up/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.type(confirmPasswordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Email already exists')).toBeInTheDocument();
    });
  });

  it('should show success message and redirect on successful signup', async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValue({ error: null });

    render(<SignUpPage />);

    const emailInput = screen.getByLabelText(/Email address/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const confirmPasswordInput = screen.getByLabelText(/Confirm Password/i);
    const submitButton = screen.getByRole('button', { name: /Sign up/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.type(confirmPasswordInput, 'password123');
    await user.click(submitButton);

    await waitFor(
      () => {
        expect(
          screen.getByText(/Account created successfully/i)
        ).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await waitFor(
      () => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      },
      { timeout: 3000 }
    );
  }, 10000);

  it('should have link to sign in page', () => {
    render(<SignUpPage />);
    const signInLink = screen.getByRole('link', {
      name: /sign in to your existing account/i,
    });
    expect(signInLink).toHaveAttribute('href', '/');
  });
});
