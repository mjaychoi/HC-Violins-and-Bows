import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import { useRouter } from 'next/navigation';

const mockGetSupabase = jest.fn();
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => mockGetSupabase(),
}));
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe('AuthContext', () => {
  const mockPush = jest.fn();
  const mockGetSession = jest.fn();
  const mockSignUp = jest.fn();
  const mockSignIn = jest.fn();
  const mockSignOut = jest.fn();
  const mockRefreshSession = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: mockPush,
    } as unknown as ReturnType<typeof useRouter>);

    const mockAuth = {
      getSession: mockGetSession,
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      signUp: mockSignUp,
      signInWithPassword: mockSignIn,
      signOut: mockSignOut,
      refreshSession: mockRefreshSession,
    };

    const mockSupabaseClient = {
      auth: mockAuth,
    };

    mockGetSupabase.mockReturnValue(mockSupabaseClient as any);
  });

  it('should provide auth context', () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current).toBeDefined();
    expect(result.current).toHaveProperty('user');
    expect(result.current).toHaveProperty('session');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('signUp');
    expect(result.current).toHaveProperty('signIn');
    expect(result.current).toHaveProperty('signOut');
    expect(result.current).toHaveProperty('refreshSession');
  });

  it('should throw error when useAuth is used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');

    consoleSpy.mockRestore();
  });

  it('should handle signUp successfully', async () => {
    const mockSession = {
      user: { id: 'user-1', email: 'test@example.com' },
      access_token: 'token',
    };

    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    mockSignUp.mockResolvedValue({
      data: { session: mockSession, user: mockSession.user },
      error: null,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const response = await result.current.signUp('test@example.com', 'password123');
      expect(response.error).toBeNull();
    });

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('should handle signIn successfully', async () => {
    const mockSession = {
      user: { id: 'user-1', email: 'test@example.com' },
      access_token: 'token',
    };

    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    mockSignIn.mockResolvedValue({
      data: { session: mockSession, user: mockSession.user },
      error: null,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const response = await result.current.signIn('test@example.com', 'password123');
      expect(response.error).toBeNull();
    });

    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('should handle signOut', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    mockSignOut.mockResolvedValue({ error: null });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('should handle refreshSession', async () => {
    const mockSession = {
      user: { id: 'user-1', email: 'test@example.com' },
      access_token: 'token',
    };

    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    mockRefreshSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.refreshSession();
    });

    expect(mockRefreshSession).toHaveBeenCalled();
  });
});
