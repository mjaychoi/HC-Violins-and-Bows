'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { User, Session, AuthError } from '@supabase/supabase-js';
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Initialize auth state
  useEffect(() => {
    let isCancelled = false;

    const loadInitialSession = async () => {
      try {
        // Try to get client synchronously first (faster, avoids webpack issues)
        let supabase = getSupabaseClientSync();
        if (!supabase) {
          // Fallback to async if sync fails
          supabase = await getSupabaseClient();
        }

        if (!supabase) {
          throw new Error('Failed to initialize Supabase client');
        }

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (isCancelled) return;

        if (error) {
          if (
            error.message?.includes('Invalid Refresh Token') ||
            error.message?.includes('Refresh Token Not Found')
          ) {
            logInfo(
              'Invalid refresh token detected, clearing session',
              'AuthContext'
            );
            let supabase = getSupabaseClientSync();
            if (!supabase) {
              supabase = await getSupabaseClient();
            }
            await supabase.auth.signOut().catch(() => {
              // Ignore - already logged out or token missing
            });
            setSession(null);
            setUser(null);
          } else {
            logError('Failed to get initial session', error, 'AuthContext');
          }
        } else {
          logInfo('Initial session loaded', 'AuthContext', {
            hasSession: !!session,
            userId: session?.user?.id,
          });
        }

        setSession(session);
        setUser(session?.user ?? null);
      } catch (error) {
        if (isCancelled) return;

        const message = error instanceof Error ? error.message : String(error);

        // Handle network errors gracefully
        if (
          message.includes('Failed to fetch') ||
          message.includes('NetworkError') ||
          message.includes('Network request failed')
        ) {
          logError(
            'Network error while loading session. This may be due to: 1) No internet connection, 2) Supabase service unavailable, 3) Incorrect Supabase URL. Continuing without session.',
            error,
            'AuthContext'
          );
          // Continue without session - app can work in offline mode
          setSession(null);
          setUser(null);
        } else if (
          message.includes('Invalid Refresh Token') ||
          message.includes('Refresh Token Not Found')
        ) {
          logInfo(
            'Invalid refresh token detected during initial load',
            'AuthContext'
          );
          const supabase = await getSupabaseClient();
          await supabase.auth.signOut().catch(() => undefined);
          setSession(null);
          setUser(null);
          // ✅ FIXED: redirect는 AppLayout에서 처리 (상태만 관리)
        } else {
          logError('Failed to get initial session', error, 'AuthContext');
          // Continue without session on other errors
          setSession(null);
          setUser(null);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    loadInitialSession();

    // Listen for auth changes
    let subscription: { unsubscribe: () => void } | null = null;
    (async () => {
      let supabase = getSupabaseClientSync();
      if (!supabase) {
        supabase = await getSupabaseClient();
      }
      const {
        data: { subscription: sub },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        logInfo('Auth state changed', 'AuthContext', {
          event: _event,
          hasSession: !!session,
          userId: session?.user?.id,
        });

        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // ✅ FIXED: redirect는 AppLayout에서 처리 (상태만 관리)
        // 토큰 오류나 로그아웃 시 상태만 업데이트
        if (
          !session &&
          (_event === 'SIGNED_OUT' || _event === 'TOKEN_REFRESHED')
        ) {
          if (_event === 'TOKEN_REFRESHED' && !session) {
            logInfo('Token refresh failed, clearing session', 'AuthContext');
          }
          // 상태만 업데이트, redirect는 AppLayout에서 처리
        }
      });
      subscription = sub;
    })();

    return () => {
      isCancelled = true;
      subscription?.unsubscribe();
    };
  }, [router]);

  const signUp = async (email: string, password: string) => {
    const startTime = performance.now();

    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
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

      if (data.session) {
        setSession(data.session);
        setUser(data.user);
        logApiRequest('POST', 'auth/signup', 200, duration, 'AuthContext', {
          operation: 'signUp',
          userId: data.user?.id,
        });
        logInfo('User signed up successfully', 'AuthContext', {
          userId: data.user?.id,
          email,
        });
      }

      return { error: null };
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      logError('Sign up exception', error, 'AuthContext', { email, duration });
      return { error: error as AuthError };
    }
  };

  const signIn = async (email: string, password: string) => {
    const startTime = performance.now();

    try {
      let supabase = getSupabaseClientSync();
      if (!supabase) {
        supabase = await getSupabaseClient();
      }
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

      if (data.session) {
        setSession(data.session);
        setUser(data.user);
        // ✅ FIXED: redirect는 AppLayout에서 처리 (상태만 관리)
        // 로그인 성공 시 AppLayout이 자동으로 리다이렉트 처리
        logApiRequest('POST', 'auth/signin', 200, duration, 'AuthContext', {
          operation: 'signIn',
          userId: data.user?.id,
        });
        logInfo('User signed in successfully', 'AuthContext', {
          userId: data.user?.id,
          email,
        });
      }

      return { error: null };
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      logError('Sign in exception', error, 'AuthContext', { email, duration });
      return { error: error as AuthError };
    }
  };

  const signOut = async () => {
    const startTime = performance.now();
    const userId = user?.id;

    try {
      const supabase = await getSupabaseClient();
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

      setSession(null);
      setUser(null);
      // ✅ FIXED: redirect는 AppLayout에서 처리 (상태만 관리)
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      logError('Sign out exception', error, 'AuthContext', {
        userId,
        duration,
      });
      setSession(null);
      setUser(null);
      // ✅ FIXED: redirect는 AppLayout에서 처리 (상태만 관리)
    }
  };

  const refreshSession = async () => {
    const startTime = performance.now();

    try {
      let supabase = getSupabaseClientSync();
      if (!supabase) {
        supabase = await getSupabaseClient();
      }
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

        // Invalid refresh token 오류 처리
        if (
          error.message?.includes('Invalid Refresh Token') ||
          error.message?.includes('Refresh Token Not Found')
        ) {
          logInfo(
            'Invalid refresh token, clearing session and redirecting to login',
            'AuthContext'
          );
          // 세션 클리어
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
          router.push('/');
        }
        return;
      }

      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        logApiRequest('POST', 'auth/refresh', 200, duration, 'AuthContext', {
          operation: 'refreshSession',
          userId: data.session.user?.id,
        });
        logInfo('Session refreshed successfully', 'AuthContext', {
          userId: data.session.user?.id,
        });
      } else {
        // 세션이 없으면 로그아웃 처리
        logInfo('No session after refresh, clearing auth state', 'AuthContext');
        setSession(null);
        setUser(null);
        // ✅ FIXED: redirect는 AppLayout에서 처리 (상태만 관리)
      }
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      logError('Session refresh exception', error, 'AuthContext', { duration });

      // 예외 발생 시에도 세션 클리어
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes('Invalid Refresh Token') ||
        errorMessage.includes('Refresh Token Not Found')
      ) {
        setSession(null);
        setUser(null);
        // ✅ FIXED: redirect는 AppLayout에서 처리 (상태만 관리)
      }
    }
  };

  const value: AuthContextType = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
