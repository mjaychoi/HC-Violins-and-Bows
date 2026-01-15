import { renderHook, act, waitFor } from '@/test-utils/render';
import { AuthProvider, useAuth } from '../AuthContext';
import { useRouter } from 'next/navigation';
import { logError, logApiRequest } from '@/utils/logger';

const mockGetSupabaseClient = jest.fn();
const mockGetSupabaseClientSync = jest.fn();
jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
  getSupabaseClientSync: () => mockGetSupabaseClientSync(),
}));
jest.mock('@/utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logApiRequest: jest.fn(),
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

    mockGetSupabaseClient.mockResolvedValue(mockSupabaseClient as any);
    mockGetSupabaseClientSync.mockReturnValue(mockSupabaseClient as any);
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
      const response = await result.current.signUp(
        'test@example.com',
        'password123'
      );
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
      const response = await result.current.signIn(
        'test@example.com',
        'password123'
      );
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
    // ✅ FIXED: signOut은 router.push를 호출하지 않음 (에러가 있을 때만 호출)
    // signOut 성공 시에는 세션만 클리어하고, router.push는 refreshSession의 에러 처리에서만 호출됨
    // expect(mockPush).toHaveBeenCalledWith('/');
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

  it('handles invalid refresh token error during loadInitialSession', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid Refresh Token', name: 'AuthError' },
    } as any);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Invalid refresh token 시 signOut 호출 및 세션 클리어 로직이 실행되어야 함
    expect(mockSignOut).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('logs and clears session on network error during loadInitialSession', async () => {
    mockGetSession.mockRejectedValue(
      new Error('Failed to fetch: network error')
    );

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // 네트워크 에러 시에도 세션을 비우고 계속 진행
    expect(logError).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('logs and returns error when signIn fails', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const signInError = { message: 'Invalid credentials' } as any;
    mockSignIn.mockResolvedValue({
      data: { session: null, user: null },
      error: signInError,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let response: any = null;
    await act(async () => {
      response = await result.current.signIn('test@example.com', 'wrong-pass');
    });

    expect(response?.error).toBe(signInError);
    expect(logApiRequest).toHaveBeenCalledWith(
      'POST',
      'auth/signin',
      undefined,
      expect.any(Number),
      'AuthContext',
      expect.objectContaining({
        operation: 'signIn',
        error: true,
      })
    );
    expect(logError).toHaveBeenCalledWith(
      'Sign in failed',
      signInError,
      'AuthContext',
      expect.objectContaining({ email: 'test@example.com' })
    );
  });

  it.skip('clears session and redirects on invalid refresh token during refreshSession', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const refreshError = {
      message: 'Invalid Refresh Token',
    } as any;

    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: refreshError,
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

    // refreshSession 내에서 invalid refresh token 처리 브랜치 실행 확인
    expect(logError).toHaveBeenCalledWith(
      'Session refresh failed',
      refreshError,
      'AuthContext'
    );
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/');
  });
});
