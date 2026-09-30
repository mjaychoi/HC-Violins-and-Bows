/** @jest-environment node */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  PRODUCTION_SUPABASE_PROJECT_REF_ENV,
  loadHostedStagingRehearsalEnvironmentFromProcessEnv,
  loadStagingEnvironmentFromProcessEnv,
} from '../../../scripts/staging/env-guard';
import {
  evaluateApplyEligibility,
  isDbPushEligible,
  classifyInspectResult,
  classifyRehearsalFinal,
  type RehearsalClassificationInput,
  assertStagingDatabaseUrlPresent,
  classifyTargetVerification,
  classifyPredeployAudit,
  classifyDeployedAppValidation,
  productionTargetRejectedFromVerification,
  targetClassificationFromVerification,
} from '../../../scripts/staging/rehearsal-gates';
import {
  assertHostedStagingWorkflowContract,
  scanSourceForHardcodedProjectRefs,
} from '../../../scripts/staging/assert-no-hardcoded-project-refs';

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

const hostedEnvWithoutAppUrl = {
  ...hostedEnv,
  STAGING_APP_BASE_URL: undefined,
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

  it('accepts database bootstrap without STAGING_APP_BASE_URL', () => {
    const env = loadHostedStagingRehearsalEnvironmentFromProcessEnv(
      hostedEnvWithoutAppUrl
    );
    expect(env.environment).toBe('staging');
    expect(env.appBaseUrl).toBe('');
    expect(env.databaseUrl).toContain(stagingRef);
  });

  it('still requires STAGING_DATABASE_URL when the app URL is absent', () => {
    expect(() =>
      loadHostedStagingRehearsalEnvironmentFromProcessEnv({
        ...hostedEnvWithoutAppUrl,
        STAGING_DATABASE_URL: undefined,
        DATABASE_URL: hostedEnv.STAGING_DATABASE_URL,
      })
    ).toThrow(/STAGING_DATABASE_URL/);
  });

  it('still rejects production identity when the app URL is absent', () => {
    expect(() =>
      loadHostedStagingRehearsalEnvironmentFromProcessEnv({
        ...hostedEnvWithoutAppUrl,
        STAGING_SUPABASE_PROJECT_REF: productionRef,
      })
    ).toThrow(/distinct|equal/i);
    expect(() =>
      loadHostedStagingRehearsalEnvironmentFromProcessEnv({
        ...hostedEnvWithoutAppUrl,
        STAGING_DATABASE_URL: `postgresql://postgres.${productionRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      })
    ).toThrow(/production|match/i);
    expect(() =>
      loadHostedStagingRehearsalEnvironmentFromProcessEnv({
        ...hostedEnvWithoutAppUrl,
        STAGING_SUPABASE_URL: `https://${productionRef}.supabase.co`,
      })
    ).toThrow(/production/i);
  });

  it('still rejects a production application URL when one is supplied', () => {
    expect(() =>
      loadHostedStagingRehearsalEnvironmentFromProcessEnv({
        ...hostedEnv,
        STAGING_APP_BASE_URL: `https://${productionRef}.example.com`,
      })
    ).toThrow(/production/i);
  });

  it('still requires an application URL for deployed-app staging validation', () => {
    expect(() =>
      loadStagingEnvironmentFromProcessEnv(hostedEnvWithoutAppUrl)
    ).toThrow(/app base URL|incomplete/i);
  });
});

describe('deployed app validation evidence', () => {
  it('does not report skipped health or readiness as passed', () => {
    expect(
      classifyDeployedAppValidation({
        appUrlPresent: false,
        health: 'skipped',
        readiness: 'skipped',
        readinessWait: 'skipped',
      })
    ).toBe('not_run');
    expect(
      classifyDeployedAppValidation({
        appUrlPresent: true,
        health: 'skipped',
        readiness: 'skipped',
      })
    ).toBe('not_run');
    expect(
      classifyDeployedAppValidation({
        appUrlPresent: true,
        health: 'success',
        readiness: 'skipped',
      })
    ).toBe('not_run');
    expect(
      classifyDeployedAppValidation({
        appUrlPresent: false,
        health: 'success',
        readiness: 'success',
      })
    ).toBe('not_run');
  });

  it('reports passed only when the app URL exists and both HTTP checks succeeded', () => {
    expect(
      classifyDeployedAppValidation({
        appUrlPresent: true,
        health: 'success',
        readiness: 'success',
        readinessWait: 'success',
      })
    ).toBe('passed');
  });

  it('reports failed when health or readiness fails', () => {
    expect(
      classifyDeployedAppValidation({
        appUrlPresent: true,
        health: 'failure',
        readiness: 'skipped',
      })
    ).toBe('failed');
    expect(
      classifyDeployedAppValidation({
        appUrlPresent: true,
        health: 'success',
        readiness: 'success',
        readinessWait: 'failure',
      })
    ).toBe('failed');
  });

  it('writes skipped HTTP evidence beside a database pass without calling it passed', () => {
    const outputPath = path.join(
      os.tmpdir(),
      `staging-rehearsal-evidence-${process.pid}.json`
    );
    const result = spawnSync(
      path.join(process.cwd(), 'node_modules', '.bin', 'tsx'),
      ['scripts/staging/write-rehearsal-evidence.ts', outputPath],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_OUTPUT: '',
          REHEARSAL_FINAL_CLASSIFICATION: 'REHEARSAL_EXECUTED_PASS',
          REHEARSAL_MODE: 'apply',
          REHEARSAL_APPLY_EXECUTED: 'true',
          REHEARSAL_HEALTH: 'skipped',
          REHEARSAL_READINESS: 'skipped',
          REHEARSAL_READINESS_WAIT: 'skipped',
          REHEARSAL_APP_URL_PRESENT: 'false',
          REHEARSAL_SYNTHETIC: 'not_run',
        },
      }
    );
    expect(result.status).toBe(0);
    const evidence = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    fs.rmSync(outputPath, { force: true });
    expect(evidence.finalClassification).toBe('REHEARSAL_EXECUTED_PASS');
    expect(evidence.health).toBe('skipped');
    expect(evidence.readiness).toBe('skipped');
    expect(evidence.deployedAppValidation).toBe('not_run');
    expect(evidence.synthetic).toBe('not_run');
    expect(evidence.health).not.toBe('success');
    expect(evidence.readiness).not.toBe('success');
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
    expect(
      classifyInspectResult({
        probeOutcome: 'success',
        historyOutcome: 'success',
        pendingCount: 0,
      }).classification
    ).toBe('NO_PENDING_MIGRATIONS');
  });

  it('allows apply when pending is positive and confirmations match', () => {
    const result = evaluateApplyEligibility(matchingConfirm);
    expect(result).toEqual({ eligible: true, pendingCount: 2 });
    expect(isDbPushEligible(2)).toBe(true);
    expect(
      classifyInspectResult({
        probeOutcome: 'success',
        historyOutcome: 'success',
        pendingCount: 2,
      }).classification
    ).toBe('INSPECT_ONLY');
  });
});

function rehearsalClassification(
  overrides: Partial<RehearsalClassificationInput> = {}
): RehearsalClassificationInput {
  return {
    mode: 'inspect',
    requireSecretsOutcome: 'success',
    rehearsalGuardOutcome: 'success',
    probeOutcome: 'success',
    historyOutcome: 'success',
    pendingCount: '2',
    applyGatesOutcome: 'skipped',
    applyGatesClassification: '',
    applyOutcome: 'skipped',
    applyExecuted: false,
    postflightOutcome: 'skipped',
    postflightPassed: false,
    verifySetOutcome: 'skipped',
    sqlAuditsOutcome: 'skipped',
    historyAfterOutcome: 'skipped',
    httpFailure: false,
    httpRequiredAndIncomplete: false,
    ...overrides,
  };
}

describe('hosted rehearsal connectivity classification', () => {
  it('does not classify a failed probe as INSPECT_ONLY when history was skipped', () => {
    expect(
      classifyRehearsalFinal(
        rehearsalClassification({
          probeOutcome: 'failure',
          historyOutcome: 'skipped',
          pendingCount: '',
        })
      )
    ).toBe('FAILED_PREFLIGHT');
    expect(
      classifyInspectResult({
        probeOutcome: 'failure',
        historyOutcome: 'skipped',
        pendingCount: null,
      }).classification
    ).toBe('FAILED_PREFLIGHT');
  });

  it('does not treat a stale zero pending count as NO_PENDING_MIGRATIONS after probe failure', () => {
    expect(
      classifyRehearsalFinal(
        rehearsalClassification({
          probeOutcome: 'failure',
          historyOutcome: 'skipped',
          pendingCount: '0',
        })
      )
    ).toBe('FAILED_PREFLIGHT');
  });

  it('does not classify history failure as INSPECT_ONLY or NO_PENDING_MIGRATIONS', () => {
    expect(
      classifyRehearsalFinal(
        rehearsalClassification({
          historyOutcome: 'failure',
          pendingCount: '',
        })
      )
    ).toBe('FAILED_PREFLIGHT');
    expect(
      classifyRehearsalFinal(
        rehearsalClassification({
          historyOutcome: 'failure',
          pendingCount: '0',
        })
      )
    ).toBe('FAILED_PREFLIGHT');
    expect(
      classifyInspectResult({
        probeOutcome: 'success',
        historyOutcome: 'failure',
        pendingCount: 0,
      }).classification
    ).toBe('FAILED_PREFLIGHT');
  });

  it('classifies a successful history read of zero pending migrations as NO_PENDING_MIGRATIONS', () => {
    expect(
      classifyRehearsalFinal(
        rehearsalClassification({
          pendingCount: '0',
        })
      )
    ).toBe('NO_PENDING_MIGRATIONS');
  });

  it('classifies a successful history read with pending migrations as INSPECT_ONLY', () => {
    expect(classifyRehearsalFinal(rehearsalClassification())).toBe(
      'INSPECT_ONLY'
    );
  });

  it('keeps inspect on a read-only classification', () => {
    expect(classifyRehearsalFinal(rehearsalClassification())).toBe(
      'INSPECT_ONLY'
    );
    expect(classifyRehearsalFinal(rehearsalClassification())).not.toBe(
      'REHEARSAL_EXECUTED_PASS'
    );
    expect(isDbPushEligible(0)).toBe(false);
  });

  it('keeps a missing secret and a failed guard on their blocked classifications', () => {
    expect(
      classifyRehearsalFinal(
        rehearsalClassification({
          requireSecretsOutcome: 'failure',
          probeOutcome: 'skipped',
          historyOutcome: 'skipped',
          pendingCount: '',
        })
      )
    ).toBe('BLOCKED_MISSING_ENV');
    expect(
      classifyRehearsalFinal(
        rehearsalClassification({
          rehearsalGuardOutcome: 'failure',
          probeOutcome: 'skipped',
          historyOutcome: 'skipped',
          pendingCount: '',
        })
      )
    ).toBe('BLOCKED_SAFETY_GUARD');
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

  it('does not require STAGING_APP_BASE_URL to start migration rehearsal', () => {
    const secretsStep = rehearsalJob!.slice(
      rehearsalJob!.indexOf('- name: Require hosted-staging database secrets'),
      rehearsalJob!.indexOf('- name: Deny production project unconditionally')
    );
    const secretList = secretsStep.slice(
      secretsStep.indexOf('for name in'),
      secretsStep.indexOf('\n          do')
    );
    expect(secretList).toContain('STAGING_DATABASE_URL');
    expect(secretList).toContain('STAGING_DATABASE_CA_CERT');
    expect(secretList).toContain('STAGING_SUPABASE_PROJECT_REF');
    expect(secretList).toContain('STAGING_SUPABASE_URL');
    expect(secretList).toContain('STAGING_SUPABASE_SERVICE_ROLE_KEY');
    expect(secretList).not.toContain('STAGING_APP_BASE_URL');
  });

  it('still rejects production project and database identity during rehearsal', () => {
    const denyStep = rehearsalJob!.slice(
      rehearsalJob!.indexOf('- name: Deny production project unconditionally'),
      rehearsalJob!.indexOf('- name: Record deployed app URL presence')
    );
    expect(denyStep).toContain(
      'Production project ref is not allowed for hosted staging rehearsal.'
    );
    expect(denyStep).toContain('Production Supabase URL detected.');
    expect(denyStep).toContain('Production DATABASE_URL detected.');
    expect(denyStep).toContain(
      '"$STAGING_SUPABASE_PROJECT_REF" = "$PRODUCTION_SUPABASE_PROJECT_REF"'
    );
  });

  it('defers rehearsal HTTP checks until a deployed app URL exists', () => {
    expect(rehearsalJob).toContain(
      "steps.apply.outputs.executed == 'true' && steps.app_url.outputs.present == 'true'"
    );
    const postflight = rehearsalJob!.slice(
      rehearsalJob!.indexOf('- name: Post-deploy catalog postflight'),
      rehearsalJob!.indexOf('- name: Exact staging migration-set verification')
    );
    expect(postflight).toContain("steps.apply.outputs.executed == 'true'");
    expect(postflight).not.toContain('app_url');
    expect(rehearsalJob).toContain('scripts/production/db-probe.ts probe');
    expect(rehearsalJob).toContain('scripts/production/db-probe.ts history');
  });

  it('requires STAGING_APP_BASE_URL for hosted app validation', () => {
    const secretsStep = hostedJob!.slice(
      hostedJob!.indexOf('- name: Require hosted-staging secrets'),
      hostedJob!.indexOf('- name: Require production project-ref configuration')
    );
    expect(secretsStep).toContain('STAGING_APP_BASE_URL');
    expect(secretsStep).toContain('STAGING_DATABASE_URL');
    expect(hostedJob).toContain('/api/health');
    expect(hostedJob).toContain('/api/ready');
    expect(hostedJob).toContain('scripts/staging/env-guard-cli.ts');
    expect(hostedJob).not.toContain('--hosted-rehearsal');
  });

  it('requires STAGING_APP_BASE_URL before auth-matrix HTTP checks', () => {
    const authJob = workflow.match(/auth-matrix:[\s\S]*$/)?.[0];
    expect(authJob).toBeTruthy();
    const requireStep = authJob!.slice(
      authJob!.indexOf('- name: Require deployed application URL'),
      authJob!.indexOf('- uses: actions/setup-node@v4')
    );
    expect(requireStep).toContain('STAGING_APP_BASE_URL');
    expect(requireStep).toContain('exit 1');
    expect(authJob).toContain(
      'AUTH_MATRIX_BASE_URL: ${{ secrets.STAGING_APP_BASE_URL }}'
    );
    expect(authJob).toContain('scripts/auth-matrix/run-hosted-matrix.ts');
  });

  it('keeps a database-only apply from failing the synthetic job', () => {
    expect(rehearsalJob).toContain(
      "app_url_present: ${{ steps.app_url.outputs.present || 'false' }}"
    );
    const syntheticJob = workflow.match(
      /postdeploy-synthetic:[\s\S]*?(?=\n  auth-matrix:)/
    )?.[0];
    expect(syntheticJob).toBeTruthy();
    const jobIf = syntheticJob!.slice(
      syntheticJob!.indexOf('if:'),
      syntheticJob!.indexOf('runs-on:')
    );
    const applyClause = jobIf.slice(
      jobIf.indexOf("migration_rehearsal_mode == 'apply'")
    );
    const hostedClause = jobIf.slice(
      0,
      jobIf.indexOf("migration_rehearsal_mode == 'apply'")
    );
    expect(applyClause).toContain(
      "needs.migration-rehearsal.outputs.migration_apply_executed == 'true'"
    );
    expect(applyClause).toContain(
      "needs.migration-rehearsal.outputs.app_url_present == 'true'"
    );
    expect(hostedClause).toContain(
      "needs.hosted-db-validation.result == 'success'"
    );
    expect(hostedClause).not.toContain('app_url_present');
  });

  it('does not classify a missing app URL as a database environment failure', () => {
    expect(rehearsalJob).toContain(
      'scripts/staging/assert-rehearsal-gates.ts classify'
    );
    expect(rehearsalJob).not.toContain('classification="INSPECT_ONLY"');
    expect(
      classifyRehearsalFinal(
        rehearsalClassification({
          pendingCount: '2',
        })
      )
    ).toBe('INSPECT_ONLY');
    expect(
      classifyRehearsalFinal(
        rehearsalClassification({
          requireSecretsOutcome: 'failure',
          probeOutcome: 'skipped',
          historyOutcome: 'skipped',
          pendingCount: '',
        })
      )
    ).toBe('BLOCKED_MISSING_ENV');
    expect(rehearsalJob).not.toMatch(
      /app_url\.outputs\.present[\s\S]{0,200}BLOCKED_MISSING_ENV/
    );
    expect(rehearsalJob).not.toContain('app_http_satisfied');
    expect(rehearsalJob).toContain(
      "REHEARSAL_HEALTH: ${{ steps.health.outcome || 'not_run' }}"
    );
    expect(rehearsalJob).toContain(
      "REHEARSAL_READINESS: ${{ steps.ready.outcome || 'not_run' }}"
    );
    expect(rehearsalJob).toContain('REHEARSAL_HTTP_FAILURE="$http_failure"');
    expect(rehearsalJob).toContain(
      'REHEARSAL_HTTP_REQUIRED_INCOMPLETE="$http_required_and_incomplete"'
    );
    expect(rehearsalJob).toContain(
      '[ "${{ steps.app_url.outputs.present }}" = "true" ] && [ "${{ steps.health.outcome }}" = "success" ] && [ "${{ steps.ready.outcome }}" = "success" ]'
    );
  });

  it('keeps inspect from running the mutation command and keeps TLS verification enabled', () => {
    const applyStep = rehearsalJob!.slice(
      rehearsalJob!.indexOf(
        '- name: Apply Supabase migrations to hosted staging'
      ),
      rehearsalJob!.indexOf('- name: Post-deploy catalog postflight')
    );
    expect(applyStep).toContain(
      "github.event.inputs.migration_rehearsal_mode == 'apply'"
    );
    expect(applyStep).toContain("steps.apply_gates.outputs.eligible == 'true'");
    expect(applyStep).toContain(
      'supabase db push --db-url "$STAGING_DATABASE_URL" --include-all --yes'
    );
    expect(applyStep).not.toContain("migration_rehearsal_mode == 'inspect'");
    expect(rehearsalJob).toContain('scripts/staging/install-database-ca.sh');
    expect(rehearsalJob).toContain('id: probe');
    expect(rehearsalJob).not.toContain('NODE_TLS_REJECT_UNAUTHORIZED');
    expect(rehearsalJob).not.toContain('rejectUnauthorized: false');
    expect(rehearsalJob).not.toContain('sslmode=no-verify');
    expect(productionWorkflow).not.toContain('DATABASE_CA_CERT_REQUIRED');
    expect(productionWorkflow).not.toContain('STAGING_DATABASE_CA_CERT');
  });

  it('does not let auth-matrix run or pass during database bootstrap', () => {
    const authJob = workflow.match(/auth-matrix:[\s\S]*$/)?.[0];
    expect(authJob).toBeTruthy();
    const jobIf = authJob!.slice(
      authJob!.indexOf('if:'),
      authJob!.indexOf('runs-on:')
    );
    expect(jobIf).toContain("needs.hosted-db-validation.result == 'success'");
    expect(jobIf).toContain("vars.AUTH_MATRIX_READY == 'true'");
    expect(jobIf).not.toContain('SYNTHETIC_READY');
    expect(jobIf).not.toContain('always()');
    expect(jobIf).not.toContain('app_url_present');
    expect(authJob).toContain('exit 1');
    expect(authJob).toContain('scripts/auth-matrix/run-hosted-matrix.ts');
  });

  it('requires STAGING_APP_BASE_URL before post-deploy synthetic HTTP checks', () => {
    const syntheticJob = workflow.match(
      /postdeploy-synthetic:[\s\S]*?(?=\n  auth-matrix:)/
    )?.[0];
    expect(syntheticJob).toBeTruthy();
    const requireStep = syntheticJob!.slice(
      syntheticJob!.indexOf('- name: Require deployed application URL'),
      syntheticJob!.indexOf('- uses: actions/setup-node@v4')
    );
    expect(requireStep).toContain('STAGING_APP_BASE_URL');
    expect(requireStep).toContain('exit 1');
    expect(syntheticJob).toContain(
      'POSTDEPLOY_BASE_URL: ${{ secrets.STAGING_APP_BASE_URL }}'
    );
    expect(syntheticJob).toContain('npm run test:synthetic:postdeploy');
    expect(syntheticJob).toContain('npm run wait:ready');
  });

  it('makes postdeploy synthetic opt-in without marking a skip as pass', () => {
    const syntheticJob = workflow.match(
      /postdeploy-synthetic:[\s\S]*?(?=\n  auth-matrix:)/
    )?.[0];
    expect(syntheticJob).toBeTruthy();
    const jobIf = syntheticJob!.slice(
      syntheticJob!.indexOf('if:'),
      syntheticJob!.indexOf('runs-on:')
    );
    expect(jobIf).toContain("vars.SYNTHETIC_READY == 'true'");
    expect(jobIf).toContain('always()');
    expect(jobIf).toContain("github.event_name == 'workflow_dispatch'");
    expect(jobIf).toContain("needs.hosted-db-validation.result == 'success'");
    expect(jobIf).toContain(
      "needs.migration-rehearsal.outputs.migration_apply_executed == 'true'"
    );
    expect(jobIf).toContain(
      "needs.migration-rehearsal.outputs.app_url_present == 'true'"
    );
    expect(jobIf).not.toMatch(/continue-on-error|SYNTHETIC_NOT_CONFIGURED/);

    const hostedIf = hostedJob!.slice(
      hostedJob!.indexOf('if:'),
      hostedJob!.indexOf('runs-on:')
    );
    const rehearsalIf = rehearsalJob!.slice(
      rehearsalJob!.indexOf('if:'),
      rehearsalJob!.indexOf('runs-on:')
    );
    expect(hostedIf).not.toContain('SYNTHETIC_READY');
    expect(rehearsalIf).not.toContain('SYNTHETIC_READY');

    const authJob = workflow.match(/auth-matrix:[\s\S]*$/)?.[0];
    const authIf = authJob!.slice(
      authJob!.indexOf('if:'),
      authJob!.indexOf('runs-on:')
    );
    expect(authIf).not.toContain('SYNTHETIC_READY');
    expect(authIf).toContain("vars.AUTH_MATRIX_READY == 'true'");

    const credentialStep = syntheticJob!.slice(
      syntheticJob!.indexOf('- name: Classify synthetic credentials'),
      syntheticJob!.indexOf('- name: Staging environment guard')
    );
    expect(credentialStep).not.toMatch(/\n\s*if:/);
    expect(credentialStep).not.toContain('continue-on-error');
    expect(credentialStep).toContain('SYNTHETIC_EMAIL');
    expect(credentialStep).toContain('SYNTHETIC_PASSWORD');
    expect(credentialStep).toContain('This is not a synthetic pass.');
    expect(credentialStep).toContain('SYNTHETIC_NOT_CONFIGURED');
    expect(credentialStep).toContain('exit 1');
    expect(syntheticJob).toContain(
      'SYNTHETIC_EMAIL: ${{ secrets.SYNTHETIC_EMAIL }}'
    );
    expect(syntheticJob).toContain(
      'SYNTHETIC_PASSWORD: ${{ secrets.SYNTHETIC_PASSWORD }}'
    );

    expect(rehearsalJob).toContain('REHEARSAL_SYNTHETIC: not_run');
    expect(rehearsalJob).toContain('is not a pass');
    expect(rehearsalJob).not.toMatch(
      /REHEARSAL_SYNTHETIC:\s*(success|PASS|passed)/
    );

    expect(syntheticJob).not.toMatch(/secrets\.PRODUCTION_/);
    expect(syntheticJob).not.toMatch(/\benvironment:\s*production\b/);
    expect(syntheticJob).toContain(
      'PRODUCTION_SUPABASE_PROJECT_REF: ${{ vars.PRODUCTION_SUPABASE_PROJECT_REF }}'
    );
    expect(
      scanSourceForHardcodedProjectRefs(
        syntheticJob!,
        'postdeploy-synthetic'
      )
    ).toEqual([]);
  });

  it('leaves production deploy guards unchanged', () => {
    expect(productionWorkflow).toMatch(/\benvironment:\s*production\b/);
    expect(productionWorkflow).toContain('EXPECTED_SUPABASE_PROJECT_REF');
    expect(productionWorkflow).toContain('secrets.DATABASE_URL');
    expect(productionWorkflow).toContain(
      'supabase db push --db-url "$DATABASE_URL" --include-all --yes'
    );
    expect(productionWorkflow).not.toContain('STAGING_APP_BASE_URL');
    expect(productionWorkflow).not.toContain('hosted-staging');
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
