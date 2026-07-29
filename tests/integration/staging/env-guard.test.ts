/** @jest-environment node */

import {
  PRODUCTION_PROJECT_REF,
  assertStagingEnvironment,
  extractProjectRefFromDatabaseUrl,
  extractProjectRefFromSupabaseUrl,
  loadStagingEnvironmentFromProcessEnv,
} from '../../../scripts/staging/env-guard';

const stagingRef = 'stagingexample1234';

const baseStaging = {
  approvedProjectRef: stagingRef,
  supabaseUrl: `https://${stagingRef}.supabase.co`,
  supabaseAnonKey: 'anon-key',
  serviceRoleKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0YWdpbmdleGFtcGxlMTIzNCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTk1NzM0NTIwMH0.signature',
  databaseUrl: `postgresql://postgres.${stagingRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  appBaseUrl: 'http://127.0.0.1:3000',
};

describe('staging env guard', () => {
  it('allows approved staging target', () => {
    const env = assertStagingEnvironment(baseStaging);
    expect(env.approvedProjectRef).toBe(stagingRef);
    expect(env.environment).toBe('staging');
  });

  it('blocks production project ref in approved ref', () => {
    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        approvedProjectRef: PRODUCTION_PROJECT_REF,
      })
    ).toThrow(/production/i);
  });

  it('blocks production Supabase URL', () => {
    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        supabaseUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
      })
    ).toThrow(/production/i);
  });

  it('blocks production DATABASE_URL', () => {
    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        databaseUrl: `postgresql://postgres:${PRODUCTION_PROJECT_REF}@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`,
      })
    ).toThrow(/production/i);
  });

  it('blocks missing project identity', () => {
    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        supabaseUrl: 'https://not-supabase.example.com',
        databaseUrl:
          'postgresql://postgres:password@unknown.example.com:5432/postgres',
        serviceRoleKey: 'not-a-jwt-token',
      })
    ).toThrow(/missing or ambiguous/i);
  });

  it('blocks mismatched URL and DB project refs', () => {
    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        databaseUrl:
          'postgresql://postgres.otherstaging9999:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      })
    ).toThrow(/match/i);
  });

  it('accepts STAGING_PROJECT_REF env alias for approved project ref', () => {
    const touched = [
      'STAGING_PROJECT_REF',
      'STAGING_SUPABASE_URL',
      'STAGING_SUPABASE_ANON_KEY',
      'STAGING_SUPABASE_SERVICE_ROLE_KEY',
      'STAGING_DATABASE_URL',
      'STAGING_APP_BASE_URL',
      'STAGING_SUPABASE_PROJECT_REF',
    ] as const;
    const previous = Object.fromEntries(
      touched.map(key => [key, process.env[key]])
    );

    process.env.STAGING_PROJECT_REF = stagingRef;
    process.env.STAGING_SUPABASE_URL = baseStaging.supabaseUrl;
    process.env.STAGING_SUPABASE_ANON_KEY = baseStaging.supabaseAnonKey;
    process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY = baseStaging.serviceRoleKey;
    process.env.STAGING_DATABASE_URL = baseStaging.databaseUrl;
    process.env.STAGING_APP_BASE_URL = baseStaging.appBaseUrl;
    delete process.env.STAGING_SUPABASE_PROJECT_REF;

    try {
      const env = loadStagingEnvironmentFromProcessEnv();
      expect(env.approvedProjectRef).toBe(stagingRef);
    } finally {
      for (const key of touched) {
        const value = previous[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it('extracts project refs from Supabase and database URLs', () => {
    expect(
      extractProjectRefFromSupabaseUrl(`https://${stagingRef}.supabase.co`)
    ).toBe(stagingRef);
    expect(
      extractProjectRefFromDatabaseUrl(
        `postgresql://postgres.${stagingRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
      )
    ).toBe(stagingRef);
  });
});
