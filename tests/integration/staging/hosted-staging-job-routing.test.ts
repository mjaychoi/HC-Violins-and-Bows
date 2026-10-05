/** @jest-environment node */

import * as fs from 'fs';
import * as path from 'path';

type JobDef = { needs: string[]; condition: string | null };

const WORKFLOW_PATH = path.join(
  process.cwd(),
  '.github/workflows/hosted-staging-integration.yml'
);

function parseJobs(source: string): Record<string, JobDef> {
  const lines = source.split('\n');
  const jobsStart = lines.findIndex(line => /^jobs:\s*$/.test(line));
  if (jobsStart < 0) throw new Error('jobs: section not found');

  const jobs: Record<string, JobDef> = {};
  let current: string | null = null;
  for (let i = jobsStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line)) break;
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header) {
      current = header[1];
      jobs[current] = { needs: [], condition: null };
      continue;
    }
    if (!current) continue;

    const needs = /^ {4}needs:\s*(.+)$/.exec(line);
    if (needs) {
      const value = needs[1].trim();
      const list = /^\[(.*)\]$/.exec(value);
      jobs[current].needs = list
        ? list[1].split(',').map(item => item.trim())
        : [value];
      continue;
    }

    const cond = /^ {4}if:\s*(.*)$/.exec(line);
    if (cond) {
      const value = cond[1].trim();
      if (value === '>-' || value === '|' || value === '>') {
        const parts: string[] = [];
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() !== '' && !/^ {6}/.test(lines[j])) break;
          parts.push(lines[j].trim());
          i = j;
        }
        jobs[current].condition = parts.join(' ');
      } else {
        jobs[current].condition = value;
      }
    }
  }
  return jobs;
}

function evaluateCondition(
  expression: string,
  context: Record<string, unknown>
): boolean {
  const body = expression
    .replace(/^\$\{\{/, '')
    .replace(/\}\}$/, '')
    .trim();
  const js = body.replace(
    /'[^']*'|\b(?:always|success)\(\)|[A-Za-z_][\w-]*(?:\.[\w-]+)*/g,
    token => {
      if (token.startsWith("'")) return token;
      if (token === 'always()' || token === 'success()') return 'true';
      if (token === 'true' || token === 'false') return token;
      const value = token
        .split('.')
        .reduce<unknown>(
          (node, key) =>
            node && typeof node === 'object'
              ? (node as Record<string, unknown>)[key]
              : undefined,
          context
        );
      return JSON.stringify(value === undefined ? '' : value);
    }
  );
  return Boolean(new Function(`return (${js});`)());
}

type Scenario = {
  migrationMode: 'off' | 'inspect' | 'apply';
  exportOnly: 'yes' | 'no';
};

type Outcome = Record<string, 'success' | 'skipped'>;

function routeJobs(jobs: Record<string, JobDef>, scenario: Scenario): Outcome {
  const context = {
    github: {
      event_name: 'workflow_dispatch',
      repository: 'mjaychoi/HC-Violins-and-Bows',
      event: {
        inputs: {
          migration_rehearsal_mode: scenario.migrationMode,
          export_e2e_only: scenario.exportOnly,
        },
      },
    },
    vars: { SYNTHETIC_READY: 'true', AUTH_MATRIX_READY: 'true' },
  };

  const outcome: Outcome = { 'static-validation': 'success' };
  const outputs: Record<string, Record<string, string>> = {
    'migration-rehearsal': {
      migration_apply_executed: 'true',
      app_url_present: 'true',
    },
  };

  const run = (name: string): 'success' | 'skipped' => {
    if (name in outcome) return outcome[name];
    const job = jobs[name];
    if (!job) throw new Error(`unknown job ${name}`);
    const needResults = job.needs.map(need => run(need));
    const condition = job.condition;
    const usesAlways = condition !== null && condition.includes('always()');
    if (!usesAlways && needResults.some(result => result !== 'success')) {
      outcome[name] = 'skipped';
      return 'skipped';
    }
    const needsContext: Record<string, unknown> = {};
    for (const need of job.needs) {
      needsContext[need] = {
        result: outcome[need],
        outputs: outcome[need] === 'success' ? (outputs[need] ?? {}) : {},
      };
    }
    const passes =
      condition === null
        ? true
        : evaluateCondition(condition, { ...context, needs: needsContext });
    outcome[name] = passes ? 'success' : 'skipped';
    return outcome[name];
  };

  for (const name of Object.keys(jobs)) run(name);
  return outcome;
}

describe('hosted-staging-integration job routing', () => {
  const jobs = parseJobs(fs.readFileSync(WORKFLOW_PATH, 'utf8'));

  const cases: Array<[Scenario, Partial<Outcome>]> = [
    [
      { migrationMode: 'off', exportOnly: 'no' },
      {
        'hosted-db-validation': 'success',
        'migration-rehearsal': 'skipped',
        'export-e2e': 'skipped',
        'auth-matrix': 'success',
        'postdeploy-synthetic': 'success',
      },
    ],
    [
      { migrationMode: 'inspect', exportOnly: 'no' },
      {
        'hosted-db-validation': 'skipped',
        'migration-rehearsal': 'success',
        'export-e2e': 'skipped',
        'auth-matrix': 'skipped',
        'postdeploy-synthetic': 'skipped',
      },
    ],
    [
      { migrationMode: 'apply', exportOnly: 'no' },
      {
        'hosted-db-validation': 'skipped',
        'migration-rehearsal': 'success',
        'export-e2e': 'skipped',
        'auth-matrix': 'skipped',
        'postdeploy-synthetic': 'success',
      },
    ],
    [
      { migrationMode: 'off', exportOnly: 'yes' },
      {
        'hosted-db-validation': 'skipped',
        'migration-rehearsal': 'skipped',
        'export-e2e': 'success',
        'auth-matrix': 'skipped',
        'postdeploy-synthetic': 'skipped',
      },
    ],
    [
      { migrationMode: 'inspect', exportOnly: 'yes' },
      {
        'hosted-db-validation': 'skipped',
        'migration-rehearsal': 'skipped',
        'export-e2e': 'success',
        'auth-matrix': 'skipped',
        'postdeploy-synthetic': 'skipped',
      },
    ],
    [
      { migrationMode: 'apply', exportOnly: 'yes' },
      {
        'hosted-db-validation': 'skipped',
        'migration-rehearsal': 'skipped',
        'export-e2e': 'success',
        'auth-matrix': 'skipped',
        'postdeploy-synthetic': 'skipped',
      },
    ],
  ];

  it.each(cases)(
    'routes migration_rehearsal_mode=%o as expected',
    (scenario, expected) => {
      const outcome = routeJobs(jobs, scenario);
      for (const [job, result] of Object.entries(expected)) {
        expect({ job, result: outcome[job] }).toEqual({ job, result });
      }
    }
  );

  it('never runs migration-rehearsal when export_e2e_only is yes', () => {
    for (const migrationMode of ['off', 'inspect', 'apply'] as const) {
      const outcome = routeJobs(jobs, { migrationMode, exportOnly: 'yes' });
      expect(outcome['migration-rehearsal']).toBe('skipped');
    }
  });
});
