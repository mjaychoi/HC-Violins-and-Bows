'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';
import type {
  User,
  Session,
  AuthError,
  SupabaseClient,
} from '@supabase/supabase-js';
import { logError, logInfo, logApiRequest } from '@/utils/logger';
import {
  getSupabaseClient,
  getSupabaseClientSync,
} from '@/lib/supabase-client';

export type AuthRole = 'admin' | 'member';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AuthRole;
  orgId: string | null;
  hasOrgContext: boolean;
  loading: boolean;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error: AuthError | null }>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

export const defaultAuthContextValue: AuthContextType = {
  user: null,
  session: null,
  role: 'member',
  orgId: null,
  hasOrgContext: false,
  loading: true,
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signOut: async () => undefined,
  refreshSession: async () => undefined,
};

function extractOrgId(user: User | null): string | null {
  if (!user) return null;

  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;

  const candidates = [appMeta.org_id, appMeta.orgId];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function extractRole(user: User | null): AuthRole {
  if (!user) return 'member';

  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;

  const candidates = [appMeta.role, appMeta.app_role];

  for (const value of candidates) {
    if (typeof value !== 'string') continue;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'admin') return 'admin';
    if (normalized === 'member') return 'member';
  }

  return 'member';
}

function isInvalidRefreshTokenError(message?: string) {
  if (!message) return false;
  return (
    message.includes('Invalid Refresh Token') ||
    message.includes('Refresh Token Not Found')
  );
}

function isNetworkishError(message: string) {
  return (
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    message.includes('Network request failed')
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AuthRole>('member');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep a single Supabase client instance for the lifetime of this provider.
  const supabaseRef = useRef<SupabaseClient | null>(null);

  // Guards to avoid setState after unmount & to reduce initial-load race issues.
  const mountedRef = useRef(true);
  const initialLoadedRef = useRef(false);

  const ensureSupabase = useCallback(async (): Promise<SupabaseClient> => {
    if (supabaseRef.current) return supabaseRef.current;

    let client = getSupabaseClientSync();
    if (!client) client = await getSupabaseClient();

    if (!client) throw new Error('Failed to initialize Supabase client');
    supabaseRef.current = client;
    return client;
  }, []);

  const applySessionState = useCallback((nextSession: Session | null) => {
    const nextUser = nextSession?.user ?? null;
    const nextOrgId = extractOrgId(nextUser);

    setSession(nextSession);
    setUser(nextUser);
    setRole(extractRole(nextUser));
    setOrgId(nextOrgId);
  }, []);

  const clearAuthState = useCallback(() => {
    applySessionState(null);
  }, [applySessionState]);

  const handleInvalidRefreshToken = useCallback(
    async (where: string, err?: unknown) => {
      logInfo(
        'Invalid refresh token detected, clearing session',
        'AuthContext',
        { where }
      );
      if (err)
        logError('Invalid refresh token error detail', err, 'AuthContext', {
          where,
        });

      try {
        const supabase = await ensureSupabase();
        await supabase.auth.signOut().catch(() => undefined);
      } catch {
        // ignore
      } finally {
        clearAuthState();
      }
    },
    [clearAuthState, ensureSupabase]
  );

  // Initialize auth state + subscribe to changes (once)
  useEffect(() => {
    mountedRef.current = true;

    let subscription: { unsubscribe: () => void } | null = null;

    const init = async () => {
      try {
        const supabase = await ensureSupabase();

        // 1) Subscribe FIRST to reduce race window.
        const { data } = supabase.auth.onAuthStateChange(
          (event, newSession) => {
            if (!mountedRef.current) return;
            // Avoid noisy logs in prod if you want; keeping as-is.
            logInfo('Auth state changed', 'AuthContext', {
              event,
              hasSession: !!newSession,
              userId: newSession?.user?.id,
            });

            // If initial load hasn't finished yet, still accept this as truth.
            // But prevent initial loader from overriding later.
            initialLoadedRef.current = true;

            applySessionState(newSession);
            setLoading(false);
          }
        );

        subscription = data.subscription;

        // 2) Load initial session (once)
        const { data: sessionData, error } = await supabase.auth.getSession();
        if (!mountedRef.current) return;

        if (error) {
          if (isInvalidRefreshTokenError(error.message)) {
            await handleInvalidRefreshToken('getSession', error);
          } else {
            logError('Failed to get initial session', error, 'AuthContext');
            clearAuthState();
          }
          return;
        }

        // If an auth event already set state, don't override it.
        if (initialLoadedRef.current) {
          setLoading(false);
          return;
        }

        const initialSession = sessionData.session ?? null;

        logInfo('Initial session loaded', 'AuthContext', {
          hasSession: !!initialSession,
          userId: initialSession?.user?.id,
        });

        applySessionState(initialSession);
      } catch (err) {
        if (!mountedRef.current) return;

        const message = err instanceof Error ? err.message : String(err);

        if (isNetworkishError(message)) {
          logError(
            'Network error while loading session; continuing without session.',
            err,
            'AuthContext'
          );
          clearAuthState();
        } else if (isInvalidRefreshTokenError(message)) {
          await handleInvalidRefreshToken('init-catch', err);
        } else {
          logError('Failed to initialize auth', err, 'AuthContext');
          clearAuthState();
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    init();

    return () => {
      mountedRef.current = false;
      subscription?.unsubscribe();
    };
  }, [
    ensureSupabase,
    handleInvalidRefreshToken,
    clearAuthState,
    applySessionState,
  ]);

  const signUp: AuthContextType['signUp'] = useCallback(
    async (email, password) => {
      const startTime = performance.now();
      try {
        const supabase = await ensureSupabase();
        const { data, error } = await supabase.auth.signUp({ email, password });
        const duration = Math.round(performance.now() - startTime);

        if (error) {
          logApiRequest(
            'POST',
            'auth/signup',
            undefined,
            duration,
            'AuthContext',
            {
              operation: 'signUp',
              error: true,
              errorCode: error.message,
            }
          );
          logError('Sign up failed', error, 'AuthContext', { email });
          return { error };
        }

        // Note: Supabase signUp may not create a session if email confirmation is required.
        if (data.session) {
          applySessionState(data.session);
        }

        logApiRequest('POST', 'auth/signup', 200, duration, 'AuthContext', {
          operation: 'signUp',
          userId: data.user?.id,
        });

        return { error: null };
      } catch (err) {
        const duration = Math.round(performance.now() - startTime);
        logError('Sign up exception', err, 'AuthContext', { email, duration });
        return { error: err as AuthError };
      }
    },
    [ensureSupabase, applySessionState]
  );

  const signIn = useCallback<AuthContextType['signIn']>(
    async (email, password) => {
      const startTime = performance.now();
      try {
        const supabase = await ensureSupabase();
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        const duration = Math.round(performance.now() - startTime);

        if (error) {
          logApiRequest(
            'POST',
            'auth/signin',
            undefined,
            duration,
            'AuthContext',
            {
              operation: 'signIn',
              error: true,
              errorCode: error.message,
            }
          );
          logError('Sign in failed', error, 'AuthContext', { email });
          return { error };
        }

        // onAuthStateChange will also fire; setting state here is okay but optional.
        if (data.session) {
          applySessionState(data.session);
        }

        logApiRequest('POST', 'auth/signin', 200, duration, 'AuthContext', {
          operation: 'signIn',
          userId: data.user?.id,
        });

        return { error: null };
      } catch (err) {
        const duration = Math.round(performance.now() - startTime);
        logError('Sign in exception', err, 'AuthContext', { email, duration });
        return { error: err as AuthError };
      }
    },
    [ensureSupabase, applySessionState]
  );

  const userId = user?.id;
  const signOut = useCallback(async () => {
    const startTime = performance.now();

    try {
      const supabase = await ensureSupabase();
      const { error } = await supabase.auth.signOut();
      const duration = Math.round(performance.now() - startTime);

      if (error) {
        logApiRequest(
          'POST',
          'auth/signout',
          undefined,
          duration,
          'AuthContext',
          {
            operation: 'signOut',
            error: true,
          }
        );
        logError('Sign out failed', error, 'AuthContext', { userId });
      } else {
        logApiRequest('POST', 'auth/signout', 200, duration, 'AuthContext', {
          operation: 'signOut',
          userId,
        });
        logInfo('User signed out successfully', 'AuthContext', { userId });
      }
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      logError('Sign out exception', err, 'AuthContext', { userId, duration });
    } finally {
      // State-only policy: AppLayout handles redirects.
      clearAuthState();
    }
  }, [ensureSupabase, clearAuthState, userId]);

  const refreshSession = useCallback<
    AuthContextType['refreshSession']
  >(async () => {
    const startTime = performance.now();

    try {
      const supabase = await ensureSupabase();
      const { data, error } = await supabase.auth.refreshSession();
      const duration = Math.round(performance.now() - startTime);

      if (error) {
        logApiRequest(
          'POST',
          'auth/refresh',
          undefined,
          duration,
          'AuthContext',
          {
            operation: 'refreshSession',
            error: true,
          }
        );
        logError('Session refresh failed', error, 'AuthContext');

        if (isInvalidRefreshTokenError(error.message)) {
          await handleInvalidRefreshToken('refreshSession', error);
        }
        return;
      }

      const nextSession = data.session ?? null;
      applySessionState(nextSession);

      logApiRequest('POST', 'auth/refresh', 200, duration, 'AuthContext', {
        operation: 'refreshSession',
        userId: nextSession?.user?.id,
      });

      if (!nextSession) {
        logInfo('No session after refresh; auth state cleared', 'AuthContext');
      }
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      logError('Session refresh exception', err, 'AuthContext', { duration });

      const message = err instanceof Error ? err.message : String(err);
      if (isInvalidRefreshTokenError(message)) {
        await handleInvalidRefreshToken('refreshSession-catch', err);
      }
    }
  }, [ensureSupabase, handleInvalidRefreshToken, applySessionState]);

  const value = useMemo(
    () => ({
      user,
      session,
      role,
      orgId,
      hasOrgContext: Boolean(orgId),
      loading,
      signUp,
      signIn,
      signOut,
      refreshSession,
    }),
    [
      user,
      session,
      role,
      orgId,
      loading,
      signUp,
      signIn,
      signOut,
      refreshSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export function useOptionalAuth() {
  return useContext(AuthContext) ?? defaultAuthContextValue;
}
