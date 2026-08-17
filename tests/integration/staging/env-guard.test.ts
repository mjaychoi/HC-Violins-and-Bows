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
import {
  DEFAULT_SCAN_TARGETS,
  assertGuardCalledBeforeCreateClient,
  assertHostedStagingWorkflowContract,
  scanFilesForHardcodedProjectRefs,
  scanSourceForHardcodedProjectRefs,
} from '../../../scripts/staging/assert-no-hardcoded-project-refs';

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

  it('blocks production ref appearing in database URL', () => {
    expect(() =>
      assertStagingEnvironment({
        ...baseStaging,
        databaseUrl: `postgresql://postgres.${productionRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      })
    ).toThrow(/production|match/i);
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
});

describe('generic active-code project-ref hard-code scan', () => {
  it('flags bare project-ref-shaped literals without knowing a real ref', () => {
    const findings = scanSourceForHardcodedProjectRefs(
      `if (projectRef === '${productionRef}') {\n  throw new Error('blocked');\n}\n`,
      'synthetic.ts',
      { bareLiteralMode: 'contextual' }
    );
    expect(findings.some(f => f.kind === 'bare_project_ref_literal')).toBe(
      true
    );
  });

  it('does not flag unrelated shaped words outside project-ref bindings', () => {
    const findings = scanSourceForHardcodedProjectRefs(
      `await supabase.from('organizations').delete();\nif (process.env.NODE_ENV === 'production') {}\n`,
      'synthetic.ts',
      { bareLiteralMode: 'contextual' }
    );
    expect(findings.filter(f => f.kind === 'bare_project_ref_literal')).toEqual(
      []
    );
  });

  it('flags fragment-join reconstruction without knowing a real ref', () => {
    const findings = scanSourceForHardcodedProjectRefs(
      "const former = ['aaaa', 'bbbb', 'cccc', 'dddd'].join('');\n",
      'synthetic.ts'
    );
    expect(findings.some(f => f.kind === 'fragment_join_reconstruction')).toBe(
      true
    );
  });

  it('finds no hard-coded or reconstructed refs in active guard/workflow files', () => {
    const findings = scanFilesForHardcodedProjectRefs(
      process.cwd(),
      DEFAULT_SCAN_TARGETS
    );
    expect(findings).toEqual([]);
  });
});

describe('hosted-staging-integration workflow contract', () => {
  const workflowPath = path.join(
    process.cwd(),
    '.github/workflows/hosted-staging-integration.yml'
  );
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  it('satisfies the variable/configuration contract without embedding a real ref', () => {
    expect(assertHostedStagingWorkflowContract(workflow)).toEqual([]);
  });

  it('passes PRODUCTION_SUPABASE_PROJECT_REF through env: from vars', () => {
    expect(workflow).toMatch(
      /PRODUCTION_SUPABASE_PROJECT_REF:\s*\$\{\{\s*vars\.PRODUCTION_SUPABASE_PROJECT_REF\s*\}\}/
    );
  });

  it('does not source production ref from secrets or define a static fallback', () => {
    expect(workflow).not.toMatch(
      /PRODUCTION_SUPABASE_PROJECT_REF:\s*\$\{\{\s*secrets\./
    );
    expect(workflow).not.toMatch(
      /\$\{PRODUCTION_SUPABASE_PROJECT_REF:-[^}]+\}/
    );
  });

  it('does not interpolate production ref into a shell command string', () => {
    expect(workflow).not.toMatch(
      /run:[\s\S]{0,200}\$\{\{\s*vars\.PRODUCTION_SUPABASE_PROJECT_REF/
    );
  });

  it('gates hosted database work on workflow_dispatch and hosted-staging', () => {
    expect(workflow).toMatch(/on:\s*\n\s*workflow_dispatch:/);
    expect(workflow).toMatch(/pull_request:/);
    expect(workflow).toMatch(/github\.event_name\s*==\s*'workflow_dispatch'/);
    expect(workflow).toMatch(/environment:\s*hosted-staging/);
  });

  it('runs env-guard-cli before hosted SQL/HTTP steps', () => {
    const hostedJob = workflow.match(
      /hosted-db-validation:[\s\S]*?(?=\n  [a-z0-9_-]+:|\n*$)/
    )?.[0];
    expect(hostedJob).toBeTruthy();
    const guardIdx = hostedJob!.indexOf('scripts/staging/env-guard-cli.ts');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(hostedJob!.indexOf('verify-migration-set.ts')).toBeGreaterThan(
      guardIdx
    );
    expect(hostedJob!.indexOf('run-pr58-audits.sh')).toBeGreaterThan(guardIdx);
    expect(hostedJob!.indexOf('/api/health')).toBeGreaterThan(guardIdx);
  });

  it('remains staging-only without production secrets or workflow_call', () => {
    expect(workflow).not.toMatch(/workflow_call/);
    expect(workflow).not.toMatch(/secrets\.PRODUCTION_/);
    expect(workflow).not.toMatch(/secrets\.AUTH_MATRIX_/);
    expect(workflow).not.toMatch(
      /SUPABASE_SERVICE_ROLE_KEY:\s*\$\{\{\s*secrets\.(?!STAGING_)/
    );
  });

  it('contains no project-ref-shaped literals or fragment-join reconstructions', () => {
    expect(scanSourceForHardcodedProjectRefs(workflow, workflowPath)).toEqual(
      []
    );
  });
});

describe('auth-matrix seed/cleanup guard ordering', () => {
  it('seed-fixtures calls the shared guard before createClient', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'scripts/auth-matrix/seed-fixtures.ts'),
      'utf8'
    );
    expect(
      assertGuardCalledBeforeCreateClient(
        source,
        'assertUrlIsNotConfiguredProduction'
      )
    ).toBeNull();
  });

  it('cleanup-fixtures calls the shared guard before createClient', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'scripts/auth-matrix/cleanup-fixtures.ts'),
      'utf8'
    );
    expect(
      assertGuardCalledBeforeCreateClient(
        source,
        'assertUrlIsNotConfiguredProduction'
      )
    ).toBeNull();
  });

  it('run-hosted-matrix calls the shared guard before createClient', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'scripts/auth-matrix/run-hosted-matrix.ts'),
      'utf8'
    );
    expect(
      assertGuardCalledBeforeCreateClient(
        source,
        'assertUrlIsNotConfiguredProduction'
      )
    ).toBeNull();
    expect(source).not.toMatch(/AUTH_MATRIX_JWT_/);
    expect(source).not.toMatch(/Authorization/);
  });
});
