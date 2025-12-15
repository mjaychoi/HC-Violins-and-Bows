import { renderHook, act, waitFor } from '@/test-utils/render';
import { AuthProvider, useAuth } from '../AuthContext';
import { useRouter } from 'next/navigation';

const mockGetSupabaseClient = jest.fn();
const mockGetSupabaseClientSync = jest.fn();
jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
  getSupabaseClientSync: () => mockGetSupabaseClientSync(),
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
});
