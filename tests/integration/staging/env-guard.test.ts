/** @jest-environment node */

import * as fs from 'fs';
import * as path from 'path';
import {
  PRODUCTION_SUPABASE_PROJECT_REF_ENV,
  assertStagingEnvironment,
  extractProjectRefFromDatabaseUrl,
  extractProjectRefFromSupabaseUrl,
  loadStagingEnvironmentFromProcessEnv,
  resolveProductionProjectRef,
} from '../../../scripts/staging/env-guard';

/** Synthetic refs only — never use a real project identifier in fixtures. */
const stagingRef = 'stagingexample1234';
const productionRef = 'prodrefexample9999';

const baseStaging = {
  approvedProjectRef: stagingRef,
  productionProjectRef: productionRef,
  supabaseUrl: `https://${stagingRef}.supabase.co`,
  supabaseAnonKey: 'anon-key',
  serviceRoleKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0YWdpbmdleGFtcGxlMTIzNCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTk1NzM0NTIwMH0.signature',
  databaseUrl: `postgresql://postgres.${stagingRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  appBaseUrl: 'http://127.0.0.1:3000',
};

describe('staging env guard', () => {
  it('allows approved staging target with distinct production ref', () => {
    const env = assertStagingEnvironment(baseStaging);
    expect(env.approvedProjectRef).toBe(stagingRef);
    expect(env.productionProjectRef).toBe(productionRef);
    expect(env.environment).toBe('staging');
  });

  it('blocks when staging and production refs are equal', () => {
    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        approvedProjectRef: productionRef,
        productionProjectRef: productionRef,
      })
    ).toThrow(/distinct|equal/i);
  });

  it('blocks missing production project ref', () => {
    expect(() =>
      assertStagingEnvironment(
        {
          ...baseStaging,
          productionProjectRef: undefined,
        },
        { requireProductionProjectRef: true }
      )
    ).toThrow(new RegExp(PRODUCTION_SUPABASE_PROJECT_REF_ENV));
  });

  it('blocks missing staging project ref', () => {
    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        approvedProjectRef: undefined,
      })
    ).toThrow(/incomplete|missing/i);
  });

  it('blocks malformed project ref', () => {
    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        productionProjectRef: 'NOT_VALID!!!',
      })
    ).toThrow(/malformed|corruption|quote/i);

    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        approvedProjectRef: 'short',
      })
    ).toThrow(/malformed/i);
  });

  it('blocks staging URL/ref mismatch', () => {
    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        supabaseUrl: 'https://otherstaging9999.supabase.co',
      })
    ).toThrow(/does not match approved staging/i);
  });

  it('blocks public URL/ref mismatch against staging', () => {
    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        publicSupabaseUrl: 'https://otherstaging9999.supabase.co',
      })
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/i);
  });

  it('blocks production ref appearing in staging URL', () => {
    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        supabaseUrl: `https://${productionRef}.supabase.co`,
      })
    ).toThrow(/production/i);
  });

  it('blocks newline/quote corruption on production ref', () => {
    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        productionProjectRef: `${productionRef}\n`,
      })
    ).toThrow(/quote or newline corruption/i);

    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        productionProjectRef: `"${productionRef}"`,
      })
    ).toThrow(/quote or newline corruption/i);
  });

  it('blocks empty or whitespace-only production ref', () => {
    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        productionProjectRef: '   ',
      })
    ).toThrow(/empty or whitespace/i);
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

  it('resolveProductionProjectRef fails closed when required and missing', () => {
    expect(() =>
      resolveProductionProjectRef({
        value: null,
        required: true,
        env: {},
      })
    ).toThrow(new RegExp(PRODUCTION_SUPABASE_PROJECT_REF_ENV));
  });

  it('loadStagingEnvironmentFromProcessEnv cross-checks public URL', () => {
    expect(() =>
      loadStagingEnvironmentFromProcessEnv({
        STAGING_SUPABASE_PROJECT_REF: stagingRef,
        [PRODUCTION_SUPABASE_PROJECT_REF_ENV]: productionRef,
        STAGING_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
        NEXT_PUBLIC_SUPABASE_URL: 'https://otherstaging9999.supabase.co',
        STAGING_SUPABASE_ANON_KEY: 'anon',
        STAGING_SUPABASE_SERVICE_ROLE_KEY: baseStaging.serviceRoleKey,
        STAGING_DATABASE_URL: baseStaging.databaseUrl,
        STAGING_APP_BASE_URL: baseStaging.appBaseUrl,
      })
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/i);
  });

  it('does not embed a real production project ref in this test module', () => {
    const source = fs.readFileSync(__filename, 'utf8');
    const formerHardCodedRef = [
      'dmi',
      'lml',
      'hqu',
      'ttc',
      'ozx',
      'lpf',
      'xw',
    ].join('');
    expect(source).not.toContain(formerHardCodedRef);
    expect(source).toContain(stagingRef);
    expect(source).toContain(productionRef);
  });
});

describe('hosted-staging-integration workflow contract', () => {
  const workflowPath = path.join(
    process.cwd(),
    '.github/workflows/hosted-staging-integration.yml'
  );
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const formerHardCodedRef = [
    'dmi',
    'lml',
    'hqu',
    'ttc',
    'ozx',
    'lpf',
    'xw',
  ].join('');

  it('passes PRODUCTION_SUPABASE_PROJECT_REF through env: from vars', () => {
    expect(workflow).toMatch(
      /PRODUCTION_SUPABASE_PROJECT_REF:\s*\$\{\{\s*vars\.PRODUCTION_SUPABASE_PROJECT_REF\s*\}\}/
    );
  });

  it('does not hard-code a production project ref literal', () => {
    expect(workflow).not.toContain(formerHardCodedRef);
  });

  it('does not interpolate production ref into a shell command string', () => {
    expect(workflow).not.toMatch(
      /run:[\s\S]{0,200}\$\{\{\s*vars\.PRODUCTION_SUPABASE_PROJECT_REF/
    );
  });

  it('remains staging-only without production secrets or workflow_call', () => {
    expect(workflow).not.toMatch(/workflow_call/);
    expect(workflow).not.toMatch(/secrets\.PRODUCTION_/);
    expect(workflow).not.toMatch(
      /SUPABASE_SERVICE_ROLE_KEY:\s*\$\{\{\s*secrets\.(?!STAGING_)/
    );
  });
});
