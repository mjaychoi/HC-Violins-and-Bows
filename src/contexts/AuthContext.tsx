'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { logError, logInfo, logApiRequest } from '@/utils/logger';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
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
    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        logError('Failed to get initial session', error, 'AuthContext');
      } else {
        logInfo('Initial session loaded', 'AuthContext', { 
          hasSession: !!session,
          userId: session?.user?.id 
        });
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      logInfo('Auth state changed', 'AuthContext', {
        event: _event,
        hasSession: !!session,
        userId: session?.user?.id,
      });

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Redirect to login if signed out
      if (!session && _event === 'SIGNED_OUT') {
        router.push('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const signUp = async (email: string, password: string) => {
    const startTime = performance.now();
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      const duration = Math.round(performance.now() - startTime);

      if (error) {
        logApiRequest('POST', 'auth/signup', undefined, duration, 'AuthContext', {
          operation: 'signUp',
          error: true,
          errorCode: error.message,
        });
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
        logInfo('User signed up successfully', 'AuthContext', { userId: data.user?.id, email });
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      const duration = Math.round(performance.now() - startTime);

      if (error) {
        logApiRequest('POST', 'auth/signin', undefined, duration, 'AuthContext', {
          operation: 'signIn',
          error: true,
          errorCode: error.message,
        });
        logError('Sign in failed', error, 'AuthContext', { email });
        return { error };
      }

      if (data.session) {
        setSession(data.session);
        setUser(data.user);
        router.push('/dashboard');
        logApiRequest('POST', 'auth/signin', 200, duration, 'AuthContext', {
          operation: 'signIn',
          userId: data.user?.id,
        });
        logInfo('User signed in successfully', 'AuthContext', { userId: data.user?.id, email });
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
      const { error } = await supabase.auth.signOut();
      const duration = Math.round(performance.now() - startTime);

      if (error) {
        logApiRequest('POST', 'auth/signout', undefined, duration, 'AuthContext', {
          operation: 'signOut',
          error: true,
        });
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
      router.push('/');
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      logError('Sign out exception', error, 'AuthContext', { userId, duration });
      setSession(null);
      setUser(null);
      router.push('/');
    }
  };

  const refreshSession = async () => {
    const startTime = performance.now();
    
    try {
      const { data, error } = await supabase.auth.refreshSession();
      const duration = Math.round(performance.now() - startTime);

      if (error) {
        logApiRequest('POST', 'auth/refresh', undefined, duration, 'AuthContext', {
          operation: 'refreshSession',
          error: true,
        });
        logError('Session refresh failed', error, 'AuthContext');
        return;
      }

      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        logApiRequest('POST', 'auth/refresh', 200, duration, 'AuthContext', {
          operation: 'refreshSession',
          userId: data.session.user?.id,
        });
        logInfo('Session refreshed successfully', 'AuthContext', { userId: data.session.user?.id });
      }
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      logError('Session refresh exception', error, 'AuthContext', { duration });
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

