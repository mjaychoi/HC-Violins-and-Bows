/** @jest-environment node */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  classifyDbPostflight,
  DB_POSTFLIGHT_CLASSIFICATIONS,
  DB_POSTFLIGHT_ENV,
  type DbPostflightOutcomeInput,
} from '../../../scripts/staging/db-postflight-gates';

function passingOutcome(
  overrides: Partial<DbPostflightOutcomeInput> = {}
): DbPostflightOutcomeInput {
  return {
    guardOutcome: 'success',
    caOutcome: 'success',
    equalityOutcome: 'success',
    catalogOutcome: 'success',
    catalogPassed: true,
    objectsOutcome: 'success',
    sqlAuditsOutcome: 'success',
    remoteOnly: 0,
    localOnly: 0,
    remoteCount: 128,
    localCount: 128,
    ...overrides,
  };
}

describe('hosted staging database postflight classification', () => {
  it('passes only when safety gates and every database check agree', () => {
    expect(classifyDbPostflight(passingOutcome())).toBe('DB_POSTFLIGHT_PASS');
    expect(DB_POSTFLIGHT_CLASSIFICATIONS).toEqual([
      'DB_POSTFLIGHT_PASS',
      'DB_POSTFLIGHT_FAILED',
      'BLOCKED_SAFETY_GUARD',
    ]);
  });

  it('blocks when identity or certificate installation did not succeed', () => {
    expect(
      classifyDbPostflight(passingOutcome({ guardOutcome: 'failure' }))
    ).toBe('BLOCKED_SAFETY_GUARD');
    expect(
      classifyDbPostflight(passingOutcome({ guardOutcome: 'skipped' }))
    ).toBe('BLOCKED_SAFETY_GUARD');
    expect(classifyDbPostflight(passingOutcome({ caOutcome: 'failure' }))).toBe(
      'BLOCKED_SAFETY_GUARD'
    );
    expect(
      classifyDbPostflight(
        passingOutcome({
          guardOutcome: 'skipped',
          caOutcome: 'skipped',
          equalityOutcome: 'skipped',
          sqlAuditsOutcome: 'skipped',
        })
      )
    ).toBe('BLOCKED_SAFETY_GUARD');
  });

  it('fails the postflight when a database check does not match exactly', () => {
    expect(
      classifyDbPostflight(passingOutcome({ sqlAuditsOutcome: 'failure' }))
    ).toBe('DB_POSTFLIGHT_FAILED');
    expect(
      classifyDbPostflight(passingOutcome({ objectsOutcome: 'failure' }))
    ).toBe('DB_POSTFLIGHT_FAILED');
    expect(classifyDbPostflight(passingOutcome({ catalogPassed: false }))).toBe(
      'DB_POSTFLIGHT_FAILED'
    );
    expect(
      classifyDbPostflight(passingOutcome({ equalityOutcome: 'failure' }))
    ).toBe('DB_POSTFLIGHT_FAILED');
    expect(classifyDbPostflight(passingOutcome({ remoteOnly: 1 }))).toBe(
      'DB_POSTFLIGHT_FAILED'
    );
    expect(classifyDbPostflight(passingOutcome({ localOnly: 2 }))).toBe(
      'DB_POSTFLIGHT_FAILED'
    );
    expect(
      classifyDbPostflight(
        passingOutcome({ remoteCount: 127, localCount: 128 })
      )
    ).toBe('DB_POSTFLIGHT_FAILED');
    expect(
      classifyDbPostflight(
        passingOutcome({ remoteCount: null, localCount: null })
      )
    ).toBe('DB_POSTFLIGHT_FAILED');
  });
});

describe('hosted staging database postflight workflow contract', () => {
  const workflowPath = path.join(
    process.cwd(),
    '.github/workflows/hosted-staging-db-postflight.yml'
  );
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  it('is a manual hosted-staging workflow that checks out main', () => {
    const trigger = workflow.slice(0, workflow.indexOf('jobs:'));
    expect(trigger).toContain('workflow_dispatch:');
    expect(trigger).not.toMatch(/\n\s*push:/);
    expect(trigger).not.toMatch(/\n\s*pull_request:/);
    expect(trigger).not.toMatch(/\n\s*schedule:/);
    expect(trigger).not.toMatch(/workflow_call/);
    expect(trigger).not.toMatch(/workflow_run/);
    expect(workflow).toContain('environment: hosted-staging');
    expect(workflow).not.toMatch(/\benvironment:\s*production\b/);
    expect(workflow).toContain('ref: main');
    expect(workflow).toContain(
      "github.event_name == 'workflow_dispatch' && github.repository == 'mjaychoi/HC-Violins-and-Bows'"
    );
    expect(workflow).toContain('DB_POSTFLIGHT_PASS');
    expect(workflow).toContain('DB_POSTFLIGHT_FAILED');
    expect(workflow).toContain('BLOCKED_SAFETY_GUARD');
  });

  it('runs identity, CA, equality, catalog, objects, and SQL audits in order', () => {
    const guardIdx = workflow.indexOf(
      'npx tsx scripts/staging/env-guard-cli.ts --hosted-rehearsal'
    );
    const caIdx = workflow.indexOf('install-database-ca.sh');
    const equalityIdx = workflow.indexOf('assert-reset-migration-equality.ts');
    const catalogIdx = workflow.indexOf('postflight-catalog.ts');
    const objectsIdx = workflow.indexOf('verify-reset-objects.ts');
    const auditsIdx = workflow.indexOf('run-pr58-postflight-audits.sh');
    expect(workflow).not.toContain('run-pr58-audits.sh');
    expect(workflow.indexOf('ref: main')).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(workflow.indexOf('ref: main'));
    expect(caIdx).toBeGreaterThan(guardIdx);
    expect(equalityIdx).toBeGreaterThan(caIdx);
    expect(catalogIdx).toBeGreaterThan(equalityIdx);
    expect(objectsIdx).toBeGreaterThan(catalogIdx);
    expect(auditsIdx).toBeGreaterThan(objectsIdx);
    expect(workflow).toContain('npm run check:migrations');
    expect(workflow).toContain('secrets.STAGING_DATABASE_URL');
    expect(workflow).not.toContain('STAGING_APP_BASE_URL');
    expect(workflow).toContain(
      'DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}'
    );

    for (const name of Object.values(DB_POSTFLIGHT_ENV)) {
      expect(workflow).toContain(name);
    }
  });

  it('does not reset, push, or rewrite migration history', () => {
    expect(workflow).not.toMatch(/\bsupabase\s+db\s+reset\b/i);
    expect(workflow).not.toMatch(/\bsupabase\s+db\s+push\b/i);
    expect(workflow).not.toMatch(/migration\s+repair/i);
    expect(workflow).not.toMatch(/schema_migrations/i);
    expect(workflow).not.toMatch(/INSERT\s+INTO/i);
    expect(workflow).not.toMatch(/supabase\s+link\b/);
    expect(workflow).not.toContain('hosted-staging-db-reset');
    expect(workflow).not.toContain('setup-cli');
    expect(workflow).not.toContain('SUPABASE_ACCESS_TOKEN');
    expect(workflow).not.toMatch(/secrets\.DATABASE_URL\b/);
    expect(workflow).not.toContain('sslmode=no-verify');
    expect(workflow).not.toContain('NODE_TLS_REJECT_UNAUTHORIZED');
  });

  it('classifies from the same environment names the workflow exports', () => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
    };
    for (const name of Object.values(DB_POSTFLIGHT_ENV)) {
      env[name] = '';
    }
    env[DB_POSTFLIGHT_ENV.guardOutcome] = 'success';
    env[DB_POSTFLIGHT_ENV.caOutcome] = 'success';
    env[DB_POSTFLIGHT_ENV.equalityOutcome] = 'success';
    env[DB_POSTFLIGHT_ENV.catalogOutcome] = 'success';
    env[DB_POSTFLIGHT_ENV.catalogPassed] = 'true';
    env[DB_POSTFLIGHT_ENV.objectsOutcome] = 'success';
    env[DB_POSTFLIGHT_ENV.sqlAuditsOutcome] = 'success';
    env[DB_POSTFLIGHT_ENV.remoteOnly] = '0';
    env[DB_POSTFLIGHT_ENV.localOnly] = '0';
    env[DB_POSTFLIGHT_ENV.remoteCount] = '128';
    env[DB_POSTFLIGHT_ENV.localCount] = '128';

    const passed = spawnSync(
      'npx',
      ['tsx', 'scripts/staging/assert-db-postflight-gates.ts', 'classify'],
      { cwd: process.cwd(), encoding: 'utf8', env }
    );
    expect(passed.status).toBe(0);
    expect(passed.stdout.trim()).toBe('DB_POSTFLIGHT_PASS');

    env[DB_POSTFLIGHT_ENV.sqlAuditsOutcome] = 'failure';
    const failed = spawnSync(
      'npx',
      ['tsx', 'scripts/staging/assert-db-postflight-gates.ts', 'classify'],
      { cwd: process.cwd(), encoding: 'utf8', env }
    );
    expect(failed.status).toBe(0);
    expect(failed.stdout.trim()).toBe('DB_POSTFLIGHT_FAILED');

    env[DB_POSTFLIGHT_ENV.guardOutcome] = 'failure';
    const blocked = spawnSync(
      'npx',
      ['tsx', 'scripts/staging/assert-db-postflight-gates.ts', 'classify'],
      { cwd: process.cwd(), encoding: 'utf8', env }
    );
    expect(blocked.status).toBe(0);
    expect(blocked.stdout.trim()).toBe('BLOCKED_SAFETY_GUARD');
  });
});
