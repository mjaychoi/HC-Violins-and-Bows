/** @jest-environment node */

import {
  assertNonProductionAuthMatrixEnv,
  isAuthMatrixEnabled,
  loadAuthMatrixEnvironment,
} from './env-guard';

describe('auth matrix env guard', () => {
  it('is disabled unless AUTH_MATRIX_ENABLED=1', () => {
    expect(isAuthMatrixEnabled()).toBe(false);
  });

  it('aborts when Supabase project ref matches production blocklist', () => {
    expect(() =>
      assertNonProductionAuthMatrixEnv({
        supabaseUrl: 'https://dmilmlhquttcozxlpfxw.supabase.co',
        supabaseAnonKey: 'anon',
        serviceRoleKey: 'service',
        baseUrl: 'http://127.0.0.1:3000',
      })
    ).toThrow(/production blocklist/i);
  });

  it('loads staging environment when enabled and non-production', () => {
    const previous = process.env.AUTH_MATRIX_ENABLED;
    process.env.AUTH_MATRIX_ENABLED = '1';
    process.env.AUTH_MATRIX_SUPABASE_URL = 'https://stagingexample.supabase.co';
    process.env.AUTH_MATRIX_SUPABASE_ANON_KEY = 'anon-key';
    process.env.AUTH_MATRIX_SERVICE_ROLE_KEY = 'service-key';
    process.env.AUTH_MATRIX_BASE_URL = 'http://127.0.0.1:3000';

    const env = loadAuthMatrixEnvironment();
    expect(env?.projectRef).toBe('stagingexample');

    process.env.AUTH_MATRIX_ENABLED = previous;
  });
});
