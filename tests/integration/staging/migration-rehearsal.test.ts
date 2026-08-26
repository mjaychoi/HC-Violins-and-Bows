/** @jest-environment node */

import * as fs from 'fs';
import * as path from 'path';
import {
  PRODUCTION_SUPABASE_PROJECT_REF_ENV,
  loadHostedStagingRehearsalEnvironmentFromProcessEnv,
} from '../../../scripts/staging/env-guard';
import {
  evaluateApplyEligibility,
  isDbPushEligible,
  classifyInspectResult,
  assertStagingDatabaseUrlPresent,
  classifyTargetVerification,
  classifyPredeployAudit,
  productionTargetRejectedFromVerification,
  targetClassificationFromVerification,
} from '../../../scripts/staging/rehearsal-gates';
import { assertHostedStagingWorkflowContract } from '../../../scripts/staging/assert-no-hardcoded-project-refs';

const stagingRef = 'stagingexample1234';
const productionRef = 'prodrefexample9999';

const hostedEnv = {
  STAGING_SUPABASE_PROJECT_REF: stagingRef,
  [PRODUCTION_SUPABASE_PROJECT_REF_ENV]: productionRef,
  STAGING_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
  STAGING_SUPABASE_ANON_KEY: 'anon-key',
  STAGING_SUPABASE_SERVICE_ROLE_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0YWdpbmdleGFtcGxlMTIzNCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTk1NzM0NTIwMH0.signature',
  STAGING_DATABASE_URL: `postgresql://postgres.${stagingRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  STAGING_APP_BASE_URL: 'https://staging.example.com',
};

const matchingConfirm = {
  confirmedSha: 'abc123def',
  actualSha: 'abc123def',
  confirmedPendingCount: '2',
  actualPendingCount: '2',
  confirmedPendingDigest:
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  actualPendingDigest:
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  stagingMutationConfirmed: 'yes',
  remoteOnlyCount: 0,
};

describe('hosted rehearsal environment loader', () => {
  it('blocks production ref equal to staging ref', () => {
    expect(() =>
      loadHostedStagingRehearsalEnvironmentFromProcessEnv({
        ...hostedEnv,
        STAGING_SUPABASE_PROJECT_REF: productionRef,
      })
    ).toThrow(/distinct|equal/i);
  });

  it('blocks staging URL that resolves to production', () => {
    expect(() =>
      loadHostedStagingRehearsalEnvironmentFromProcessEnv({
        ...hostedEnv,
        STAGING_SUPABASE_URL: `https://${productionRef}.supabase.co`,
      })
    ).toThrow(/production/i);
  });

  it('blocks staging DATABASE_URL that resolves to production', () => {
    expect(() =>
      loadHostedStagingRehearsalEnvironmentFromProcessEnv({
        ...hostedEnv,
        STAGING_DATABASE_URL: `postgresql://postgres.${productionRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      })
    ).toThrow(/production|match/i);
  });

  it('blocks staging URL / DB ref mismatch', () => {
    expect(() =>
      loadHostedStagingRehearsalEnvironmentFromProcessEnv({
        ...hostedEnv,
        STAGING_DATABASE_URL:
          'postgresql://postgres.otherstaging9999:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      })
    ).toThrow(/match/i);
  });

  it('blocks missing production ref', () => {
    expect(() =>
      loadHostedStagingRehearsalEnvironmentFromProcessEnv({
        ...hostedEnv,
        [PRODUCTION_SUPABASE_PROJECT_REF_ENV]: undefined,
      })
    ).toThrow(new RegExp(PRODUCTION_SUPABASE_PROJECT_REF_ENV));
  });

  it('blocks missing STAGING_DATABASE_URL before mutation and does not use DATABASE_URL', () => {
    expect(() =>
      loadHostedStagingRehearsalEnvironmentFromProcessEnv({
        ...hostedEnv,
        STAGING_DATABASE_URL: undefined,
        DATABASE_URL: hostedEnv.STAGING_DATABASE_URL,
      })
    ).toThrow(/STAGING_DATABASE_URL/);

    expect(() => assertStagingDatabaseUrlPresent(undefined)).toThrow(
      /STAGING_DATABASE_URL/
    );
  });

  it('blocks local database fallback for hosted rehearsal', () => {
    expect(() =>
      loadHostedStagingRehearsalEnvironmentFromProcessEnv({
        ...hostedEnv,
        STAGING_DATABASE_URL:
          'postgresql://postgres:password@127.0.0.1:54322/postgres',
      })
    ).toThrow(/local/i);
  });

  it('blocks local application URL for hosted rehearsal', () => {
    expect(() =>
      loadHostedStagingRehearsalEnvironmentFromProcessEnv({
        ...hostedEnv,
        STAGING_APP_BASE_URL: 'http://127.0.0.1:3000',
      })
    ).toThrow(/local/i);
  });

  it('accepts an approved hosted staging target', () => {
    const env = loadHostedStagingRehearsalEnvironmentFromProcessEnv(hostedEnv);
    expect(env.environment).toBe('staging');
  });
});

describe('hosted rehearsal apply confirmation', () => {
  it('blocks wrong SHA with no mutation eligibility', () => {
    const result = evaluateApplyEligibility({
      ...matchingConfirm,
      confirmedSha: 'deadbeef',
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.classification).toBe('FAILED_PREFLIGHT');
    }
  });

  it('blocks wrong pending count', () => {
    const result = evaluateApplyEligibility({
      ...matchingConfirm,
      confirmedPendingCount: '9',
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.classification).toBe('FAILED_PREFLIGHT');
    }
  });

  it('blocks wrong pending digest', () => {
    const result = evaluateApplyEligibility({
      ...matchingConfirm,
      confirmedPendingDigest:
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.classification).toBe('FAILED_PREFLIGHT');
    }
  });

  it('blocks mutation acknowledgement other than yes', () => {
    const result = evaluateApplyEligibility({
      ...matchingConfirm,
      stagingMutationConfirmed: 'no',
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.classification).toBe('FAILED_PREFLIGHT');
    }
  });

  it('blocks remote-only migrations', () => {
    const result = evaluateApplyEligibility({
      ...matchingConfirm,
      remoteOnlyCount: 1,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.classification).toBe('BLOCKED_SAFETY_GUARD');
    }
  });

  it('classifies zero pending as NO_PENDING_MIGRATIONS and not db-push eligible', () => {
    const result = evaluateApplyEligibility({
      ...matchingConfirm,
      confirmedPendingCount: '0',
      actualPendingCount: '0',
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.classification).toBe('NO_PENDING_MIGRATIONS');
    }
    expect(isDbPushEligible(0)).toBe(false);
    expect(classifyInspectResult(0).classification).toBe(
      'NO_PENDING_MIGRATIONS'
    );
  });

  it('allows apply when pending is positive and confirmations match', () => {
    const result = evaluateApplyEligibility(matchingConfirm);
    expect(result).toEqual({ eligible: true, pendingCount: 2 });
    expect(isDbPushEligible(2)).toBe(true);
    expect(classifyInspectResult(2).classification).toBe('INSPECT_ONLY');
  });
});

describe('hosted rehearsal evidence truthfulness', () => {
  it('does not claim production was rejected when env is missing', () => {
    const verification = classifyTargetVerification('skipped');
    expect(verification).toBe('NOT_RUN');
    expect(productionTargetRejectedFromVerification(verification)).not.toBe(
      true
    );
    expect(targetClassificationFromVerification(verification)).toBe(
      'unverified'
    );
  });

  it('marks predeploy audits NOT_EVALUATED when history did not run', () => {
    expect(
      classifyPredeployAudit({
        historyOutcome: 'skipped',
        migrationPending: '',
        auditOutcome: 'skipped',
      })
    ).toBe('NOT_EVALUATED');
    expect(classifyPredeployAudit({ historyOutcome: undefined })).toBe(
      'NOT_EVALUATED'
    );
  });
});

describe('hosted staging migration rehearsal workflow contract', () => {
  const workflowPath = path.join(
    process.cwd(),
    '.github/workflows/hosted-staging-integration.yml'
  );
  const productionWorkflowPath = path.join(
    process.cwd(),
    '.github/workflows/production-db-deploy.yml'
  );
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const productionWorkflow = fs.readFileSync(productionWorkflowPath, 'utf8');

  const rehearsalJob = workflow.match(
    /migration-rehearsal:[\s\S]*?(?=\n  [a-z0-9_-]+:|\n*$)/
  )?.[0];
  const hostedJob = workflow.match(
    /hosted-db-validation:[\s\S]*?(?=\n  [a-z0-9_-]+:|\n*$)/
  )?.[0];

  it('keeps the existing workflow contract', () => {
    expect(assertHostedStagingWorkflowContract(workflow)).toEqual([]);
  });

  it('exposes inspect/apply only via workflow_dispatch inputs', () => {
    expect(workflow).toMatch(/migration_rehearsal_mode:/);
    expect(workflow).toMatch(/default:\s*off/);
    expect(rehearsalJob).toMatch(
      /github\.event_name\s*==\s*'workflow_dispatch'/
    );
    expect(rehearsalJob).toMatch(/migration_rehearsal_mode == 'inspect'/);
    expect(rehearsalJob).toMatch(/migration_rehearsal_mode == 'apply'/);
  });

  it('uses hosted-staging Environment only and never production', () => {
    expect(workflow).toMatch(/environment:\s*hosted-staging/);
    expect(workflow).not.toMatch(/\benvironment:\s*production\b/);
    expect(rehearsalJob).toMatch(/environment:\s*hosted-staging/);
  });

  it('pins the same Supabase CLI version as production', () => {
    const prodPin = productionWorkflow.match(/version:\s*([0-9.]+)/)?.[1];
    expect(prodPin).toBe('2.111.0');
    expect(rehearsalJob).toContain(`version: ${prodPin}`);
  });

  it('pushes with STAGING_DATABASE_URL after the staging guard', () => {
    expect(rehearsalJob).toContain('env-guard-cli.ts --hosted-rehearsal');
    const guardIdx = rehearsalJob!.indexOf(
      'env-guard-cli.ts --hosted-rehearsal'
    );
    const pushIdx = rehearsalJob!.indexOf(
      'supabase db push --db-url "$STAGING_DATABASE_URL" --include-all --yes'
    );
    expect(guardIdx).toBeGreaterThan(-1);
    expect(pushIdx).toBeGreaterThan(guardIdx);
    expect(rehearsalJob).not.toMatch(/secrets\.DATABASE_URL/);
  });

  it('has no db reset / DROP / TRUNCATE path and keeps postflight blocking', () => {
    expect(rehearsalJob).not.toMatch(/supabase\s+db\s+reset/i);
    expect(rehearsalJob).not.toMatch(/DROP\s+SCHEMA/i);
    expect(rehearsalJob).not.toMatch(/TRUNCATE\s+/i);
    const postflightBlock = rehearsalJob!.slice(
      rehearsalJob!.indexOf('Post-deploy catalog postflight')
    );
    expect(postflightBlock).toContain('postflight-catalog.ts');
    expect(postflightBlock).not.toMatch(
      /postflight-catalog[\s\S]{0,400}continue-on-error:\s*true/
    );
  });

  it('keeps rehearsal_mode=off hosted validation usable when rehearsal is skipped', () => {
    expect(hostedJob).toMatch(/migration_rehearsal_mode != 'inspect'/);
    expect(hostedJob).toMatch(/migration_rehearsal_mode != 'apply'/);
    expect(workflow).toMatch(
      /needs:\s*\[hosted-db-validation, migration-rehearsal\]/
    );
    expect(workflow).toMatch(/always\(\)/);
    expect(hostedJob).toContain('scripts/staging/env-guard-cli.ts');
    expect(hostedJob).toContain('/api/health');
    expect(hostedJob).toContain('/api/ready');
  });

  it('does not treat unevaluated predeploy audits as not-pending skips', () => {
    expect(rehearsalJob).toMatch(
      /history\.outcome == 'success' && steps\.history\.outputs\.sale_price_pending != 'true'/
    );
    expect(rehearsalJob).toMatch(
      /NOT_EVALUATED = history\/audit never reached/
    );
    expect(rehearsalJob).not.toMatch(/skipped = migration not pending/);
  });
});
