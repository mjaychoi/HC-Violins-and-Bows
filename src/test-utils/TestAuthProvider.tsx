/**
 * TestAuthProvider — deterministic, synchronous auth context for Jest/RTL tests.
 *
 * Why this exists instead of using real AuthProvider:
 *   - Real AuthProvider calls getSupabaseClient() + getSession() on mount (async/network)
 *   - Real AuthProvider starts loading: true, causing skeleton flicker and timing sensitivity
 *   - Real AuthProvider subscribes to onAuthStateChange per test (subscription leak risk)
 *
 * This wrapper:
 *   - Is synchronous — no effects, no network, no Supabase
 *   - Sets loading: false immediately so providers downstream see a stable tenant key
 *   - Provides a real-shaped User/Session so getTenantIdentityKey() returns a non-null key
 *   - Is overridable per-test via the `value` prop for auth-specific test scenarios
 *
 * Tenant identity key produced by defaults:
 *   'test-user-id:test-org-id:test-refresh-token'
 */
import React from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { AuthContext, type AuthContextType } from '@/contexts/AuthContext';

export const TEST_USER_ID = 'test-user-id';
export const TEST_ORG_ID = 'test-org-id';

const testUser = {
  id: TEST_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  app_metadata: { org_id: TEST_ORG_ID, role: 'admin' },
  user_metadata: {},
} as User;

const testSession = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: testUser,
} as Session;

export const defaultTestAuthValue: AuthContextType = {
  user: testUser,
  session: testSession,
  orgId: TEST_ORG_ID,
  role: 'admin',
  hasOrgContext: true,
  loading: false,
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signOut: async () => undefined,
  refreshSession: async () => undefined,
};

interface TestAuthProviderProps {
  children: React.ReactNode;
  /**
   * Override specific fields for tests that need a different auth state.
   *
   * Examples:
   *   value={{ loading: true }}             — test loading skeleton behavior
   *   value={{ user: null, orgId: null }}   — test unauthenticated state
   *   value={{ role: 'member' }}            — test member-only permission gates
   */
  value?: Partial<AuthContextType>;
}

export function TestAuthProvider({ children, value }: TestAuthProviderProps) {
  const merged: AuthContextType = value
    ? { ...defaultTestAuthValue, ...value }
    : defaultTestAuthValue;

  return <AuthContext.Provider value={merged}>{children}</AuthContext.Provider>;
}
