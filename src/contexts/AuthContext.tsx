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

interface AuthContextType {
  user: User | null;
  session: Session | null;
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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

  const clearAuthState = useCallback(() => {
    setSession(null);
    setUser(null);
  }, []);

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

            setSession(newSession);
            setUser(newSession?.user ?? null);
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

        setSession(initialSession);
        setUser(initialSession?.user ?? null);
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
  }, [ensureSupabase, handleInvalidRefreshToken, clearAuthState]);

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
          setSession(data.session);
          setUser(data.user);
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
    [ensureSupabase]
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
          setSession(data.session);
          setUser(data.user);
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
    [ensureSupabase]
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
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

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
  }, [ensureSupabase, handleInvalidRefreshToken]);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      signUp,
      signIn,
      signOut,
      refreshSession,
    }),
    [user, session, loading, signUp, signIn, signOut, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
