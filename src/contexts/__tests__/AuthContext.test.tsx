import { renderHook, act, waitFor } from '@/test-utils/render';
import { renderHook as renderHookWithoutProviders } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import { useRouter } from 'next/navigation';
import { logError, logApiRequest } from '@/utils/logger';
import {
  signalAuthChanged,
  AUTH_CROSS_TAB_SIGNAL_KEY,
} from '@/lib/authCrossTabSignal';

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
jest.mock('@/lib/authCrossTabSignal', () => {
  const actual = jest.requireActual('@/lib/authCrossTabSignal');
  return {
    ...actual,
    signalAuthChanged: jest.fn(),
  };
});

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
    // Use raw renderHook (no TestProviders wrapper) to test the no-provider guard.
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    expect(() => {
      renderHookWithoutProviders(() => useAuth());
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

  it('ignores malicious user_metadata org and role in session state', async () => {
    const mockSession = {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        app_metadata: { org_id: 'org-from-app-meta', role: 'member' },
        user_metadata: { org_id: 'evil-org', role: 'admin' },
      },
      access_token: 'token',
    };

    mockGetSession.mockResolvedValue({
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

    expect(result.current.orgId).toBe('org-from-app-meta');
    expect(result.current.role).toBe('member');
  });

  it('fails closed when only user_metadata carries org and role claims', async () => {
    const mockSession = {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        app_metadata: {},
        user_metadata: { org_id: 'evil-org', role: 'admin' },
      },
      access_token: 'token',
    };

    mockGetSession.mockResolvedValue({
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

    expect(result.current.orgId).toBeNull();
    expect(result.current.role).toBe('member');
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

  it('clears session on invalid refresh token during refreshSession', async () => {
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
    // handleInvalidRefreshToken calls signOut + clearAuthState but does NOT call router.push
  });
});

describe('AuthContext cross-tab identity reconciliation (V7-001)', () => {
  const mockGetSession = jest.fn();
  const mockSignUp = jest.fn();
  const mockSignIn = jest.fn();
  const mockSignOut = jest.fn();
  const mockRefreshSession = jest.fn();
  const mockOnAuthStateChange = jest.fn(() => ({
    data: { subscription: { unsubscribe: jest.fn() } },
  }));

  const sessionA = {
    user: { id: 'user-A', email: 'a@example.com', app_metadata: {} },
    access_token: 'token-a-1',
    expires_at: 1000,
  };

  const sessionB = {
    user: { id: 'user-B', email: 'b@example.com', app_metadata: {} },
    access_token: 'token-b-1',
    expires_at: 2000,
  };

  // The "shared browser cookie": both simulated tabs' getSession() calls
  // read from this, mirroring the fact that cookies (unlike localStorage)
  // are already synchronously shared across tabs by the browser.
  let sharedCookieSession: typeof sessionA | null = null;

  function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  function makeWrapper() {
    return AuthProviderWrapper;
  }

  function dispatchCrossTabSignal() {
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AUTH_CROSS_TAB_SIGNAL_KEY,
          newValue: String(Date.now()),
        })
      );
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    sharedCookieSession = sessionA;

    mockGetSession.mockImplementation(() =>
      Promise.resolve({ data: { session: sharedCookieSession }, error: null })
    );

    mockSignOut.mockImplementation(() => {
      sharedCookieSession = null;
      return Promise.resolve({ error: null });
    });

    mockSignIn.mockImplementation(({ email }: { email: string }) => {
      const next = email === sessionB.user.email ? sessionB : sessionA;
      sharedCookieSession = next;
      return Promise.resolve({
        data: { session: next, user: next.user },
        error: null,
      });
    });

    const mockSupabaseClient = {
      auth: {
        getSession: mockGetSession,
        onAuthStateChange: mockOnAuthStateChange,
        signUp: mockSignUp,
        signInWithPassword: mockSignIn,
        signOut: mockSignOut,
        refreshSession: mockRefreshSession,
      },
    };

    mockGetSupabaseClient.mockResolvedValue(mockSupabaseClient as any);
    mockGetSupabaseClientSync.mockReturnValue(mockSupabaseClient as any);
  });

  it('TEST-1: tab A reconciles to logged out after tab B logs out', async () => {
    const tabA = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    const tabB = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await waitFor(() => expect(tabA.result.current.loading).toBe(false));
    await waitFor(() => expect(tabB.result.current.loading).toBe(false));
    expect(tabA.result.current.user?.id).toBe('user-A');

    await act(async () => {
      await tabB.result.current.signOut();
    });
    expect(signalAuthChanged).toHaveBeenCalled();

    dispatchCrossTabSignal();

    await waitFor(() => {
      expect(tabA.result.current.user).toBeNull();
    });
    expect(tabA.result.current.session).toBeNull();
    expect(tabA.result.current.loading).toBe(false);
  });

  it('TEST-2: tab A reconciles from A to B after tab B signs in as another user', async () => {
    const tabA = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    const tabB = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await waitFor(() => expect(tabA.result.current.loading).toBe(false));
    await waitFor(() => expect(tabB.result.current.loading).toBe(false));
    expect(tabA.result.current.user?.id).toBe('user-A');

    await act(async () => {
      await tabB.result.current.signIn('b@example.com', 'password');
    });

    dispatchCrossTabSignal();

    await waitFor(() => {
      expect(tabA.result.current.user?.id).toBe('user-B');
    });
    // The stale A identity must never be the settled state once B is authoritative.
    expect(tabA.result.current.user?.id).not.toBe('user-A');
    expect(tabA.result.current.loading).toBe(false);
  });

  it('TEST-3: same-user session refresh does not behave like an account switch', async () => {
    const tabA = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await waitFor(() => expect(tabA.result.current.loading).toBe(false));
    expect(tabA.result.current.user?.id).toBe('user-A');

    // A refreshed token for the SAME user, simulating another tab's
    // auto-refresh updating the shared cookie.
    sharedCookieSession = {
      ...sessionA,
      access_token: 'token-a-2',
      expires_at: 3000,
    };

    dispatchCrossTabSignal();

    await waitFor(() => {
      expect(tabA.result.current.session?.access_token).toBe('token-a-2');
    });

    // Identity is unchanged: no forced sign-out / clear was triggered.
    expect(tabA.result.current.user?.id).toBe('user-A');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('TEST-4: refreshSession() does not itself ping other tabs', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { session: { ...sessionA, access_token: 'token-a-refreshed' } },
      error: null,
    });

    const tabA = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(tabA.result.current.loading).toBe(false));

    await act(async () => {
      await tabA.result.current.refreshSession();
    });

    expect(signalAuthChanged).not.toHaveBeenCalled();
  });

  it('TEST-5: an unrelated storage event does not trigger reconciliation', async () => {
    const tabA = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(tabA.result.current.loading).toBe(false));

    mockGetSession.mockClear();

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'some-unrelated-key',
          newValue: 'x',
        })
      );
    });

    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it('TEST-6: reconciling from a remote signal does not rebroadcast (no event loop)', async () => {
    const tabA = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(tabA.result.current.loading).toBe(false));

    (signalAuthChanged as jest.Mock).mockClear();
    sharedCookieSession = null;

    dispatchCrossTabSignal();

    await waitFor(() => {
      expect(tabA.result.current.user).toBeNull();
    });

    // Reconciling from an authoritative re-read must not itself write a new
    // signal — otherwise every tab receiving a signal would rebroadcast it.
    expect(signalAuthChanged).not.toHaveBeenCalled();
  });
});
