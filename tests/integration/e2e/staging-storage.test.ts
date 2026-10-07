/** @jest-environment node */

import * as fs from 'fs';
import * as path from 'path';

import { normalizeE2ERunScope } from '../../e2e/e2e-identities';
import {
  APP_STORAGE_CREDENTIAL_KEYS,
  DELETE_BATCH_SIZE,
  STAGING_STORAGE_INPUT_KEYS,
  assertEffectiveStorageEnv,
  assertInertPlaceholderStorageEnv,
  assertStagingBucketName,
  buildStagingStorageGithubEnv,
  cleanupRunScopedStorage,
  createS3ScopedObjectStore,
  e2eStorageKeyPrefix,
  e2eStorageObjectPrefix,
  resolveStagingStorageE2E,
  type ScopedObjectStore,
  type StagingStorageEnabled,
} from '../../e2e/staging-storage';

/** Synthetic values only — never real refs, buckets, or credentials. */
const stagingRef = 'stagingexample1234';
const productionRef = 'prodrefexample9999';
const RUN_SCOPE = '18342901234-1-critical';
const SCOPE_KEY = normalizeE2ERunScope(RUN_SCOPE);
const OTHER_SCOPE_KEY = normalizeE2ERunScope('18342905678-1-critical');
const BUCKET = 'hc-violins-staging-e2e';
const ACCESS_KEY_ID = 'AKIAEXAMPLEEXAMPLE12';
const SECRET = 'wJalrXUtnFEMIexampleSecretKeyExample1234';

const repoRoot = process.cwd();
const ciWorkflow = fs.readFileSync(
  path.join(repoRoot, '.github/workflows/ci.yml'),
  'utf8'
);

/** The env the CI E2E job provides before the configure step. */
function baseJobEnv(
  overrides: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  return {
    CI: 'true',
    E2E_RUN_SCOPE: RUN_SCOPE,
    STAGING_SUPABASE_PROJECT_REF: stagingRef,
    PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
    NEXT_PUBLIC_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
    STORAGE_TYPE: 's3',
    S3_BUCKET_NAME: 'e2e-ci-placeholder',
    S3_REGION: 'us-east-1',
    E2E_STAGING_STORAGE_ENABLED: '',
    E2E_STAGING_S3_BUCKET_NAME: '',
    E2E_STAGING_S3_REGION: '',
    E2E_STAGING_AWS_ACCESS_KEY_ID: '',
    E2E_STAGING_AWS_SECRET_ACCESS_KEY: '',
    PRODUCTION_S3_BUCKET_NAME: '',
    ...overrides,
  };
}

function enabledJobEnv(overrides: Record<string, string | undefined> = {}) {
  return baseJobEnv({
    E2E_STAGING_STORAGE_ENABLED: 'true',
    E2E_STAGING_S3_BUCKET_NAME: BUCKET,
    E2E_STAGING_S3_REGION: 'us-west-1',
    E2E_STAGING_AWS_ACCESS_KEY_ID: ACCESS_KEY_ID,
    E2E_STAGING_AWS_SECRET_ACCESS_KEY: SECRET,
    PRODUCTION_S3_BUCKET_NAME: 'example-prod-bucket',
    ...overrides,
  });
}

function captureError(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected a throw');
}

/** Applies $GITHUB_ENV lines the way the runner does for later steps. */
function applyGithubEnv(
  env: Record<string, string | undefined>,
  lines: string[]
): Record<string, string | undefined> {
  const next = { ...env };
  for (const line of lines) {
    const idx = line.indexOf('=');
    next[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return next;
}

describe('scope prefix contract', () => {
  it('is e2e/<scopeKey>/ for the run scope key', () => {
    expect(e2eStorageObjectPrefix(SCOPE_KEY)).toBe(`e2e/${SCOPE_KEY}/`);
    expect(e2eStorageKeyPrefix(SCOPE_KEY)).toBe(`e2e/${SCOPE_KEY}`);
    expect(SCOPE_KEY).toMatch(/^[0-9a-f]{12}$/);
  });

  it.each(['', ' ', 'e2e', '../etc', 'ABCDEF012345', '0a1b2c3d4e5', '*'])(
    'refuses malformed scope key %p',
    key => {
      expect(() => e2eStorageObjectPrefix(key)).toThrow(/malformed/);
    }
  );
});

describe('resolveStagingStorageE2E: disabled (operator not done yet)', () => {
  it('is disabled with no flag and no inputs (current CI)', () => {
    expect(resolveStagingStorageE2E(baseJobEnv())).toEqual({
      mode: 'disabled',
      reason: 'not-configured',
    });
  });

  it('exports only the mode marker when disabled', () => {
    expect(
      buildStagingStorageGithubEnv(resolveStagingStorageE2E(baseJobEnv()))
    ).toEqual(['E2E_STAGING_STORAGE_MODE=disabled']);
  });

  it('is an explicit pause when the flag is "false", even with inputs', () => {
    expect(
      resolveStagingStorageE2E(
        enabledJobEnv({ E2E_STAGING_STORAGE_ENABLED: 'false' })
      )
    ).toEqual({ mode: 'disabled', reason: 'explicitly-disabled' });
  });

  it('requires the inert placeholder job env when disabled', () => {
    expect(() => assertInertPlaceholderStorageEnv(baseJobEnv())).not.toThrow();
    expect(() =>
      assertInertPlaceholderStorageEnv(
        baseJobEnv({ S3_BUCKET_NAME: 'hc-bows' })
      )
    ).toThrow(/placeholder/);
    for (const key of APP_STORAGE_CREDENTIAL_KEYS) {
      expect(() =>
        assertInertPlaceholderStorageEnv(baseJobEnv({ [key]: 'x' }))
      ).toThrow(new RegExp(key));
    }
  });
});

describe('resolveStagingStorageE2E: fail-closed', () => {
  it.each(STAGING_STORAGE_INPUT_KEYS.map(key => [key]))(
    'fails on partial config (%s set, flag unset)',
    key => {
      const value =
        key === 'E2E_STAGING_AWS_SECRET_ACCESS_KEY' ? SECRET : 'something';
      const message = captureError(() =>
        resolveStagingStorageE2E(baseJobEnv({ [key]: value }))
      );
      expect(message).toMatch(/partially configured/);
      expect(message).toContain(key);
      expect(message).not.toContain(value);
    }
  );

  it.each(STAGING_STORAGE_INPUT_KEYS.map(key => [key]))(
    'fails when enabled but %s is missing',
    key => {
      expect(() =>
        resolveStagingStorageE2E(enabledJobEnv({ [key]: '' }))
      ).toThrow(new RegExp(`missing: .*${key}`));
    }
  );

  it.each(['TRUE', 'yes', '1', 'on'])('fails on flag value %p', flag => {
    expect(() =>
      resolveStagingStorageE2E(
        baseJobEnv({ E2E_STAGING_STORAGE_ENABLED: flag })
      )
    ).toThrow(/must be "true", "false", or unset/);
  });

  it('requires PRODUCTION_S3_BUCKET_NAME as a deny target', () => {
    expect(() =>
      resolveStagingStorageE2E(enabledJobEnv({ PRODUCTION_S3_BUCKET_NAME: '' }))
    ).toThrow(/PRODUCTION_S3_BUCKET_NAME must be set/);
  });

  it('refuses a production Supabase project', () => {
    expect(() =>
      resolveStagingStorageE2E(
        enabledJobEnv({
          STAGING_SUPABASE_PROJECT_REF: productionRef,
          NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co`,
        })
      )
    ).toThrow(/must not use the production/);
  });

  it('refuses a Supabase URL outside the staging allowlist', () => {
    expect(() =>
      resolveStagingStorageE2E(
        enabledJobEnv({
          NEXT_PUBLIC_SUPABASE_URL: 'https://otherrefexample5678.supabase.co',
        })
      )
    ).toThrow(/does not match STAGING_SUPABASE_PROJECT_REF/);
  });

  it('refuses the bucket equal to PRODUCTION_S3_BUCKET_NAME', () => {
    const staged = 'acme-staging-shared';
    const message = captureError(() =>
      resolveStagingStorageE2E(
        enabledJobEnv({
          E2E_STAGING_S3_BUCKET_NAME: staged,
          PRODUCTION_S3_BUCKET_NAME: staged,
        })
      )
    );
    expect(message).toMatch(/production bucket/);
    expect(message).not.toContain(staged);
  });

  it.each([
    ['hc-bows', /production bucket/],
    ['e2e-ci-placeholder', /placeholder/],
    ['hc-violins-e2e', /"staging" name token/],
    ['hcstagingbucket', /"staging" name token/],
    ['hc-staging-prod', /production name token/],
    ['production-staging-copy', /production name token/],
    ['HC-Staging-E2E', /valid S3 bucket name/],
    ['st', /valid S3 bucket name/],
    ['hc..staging', /valid S3 bucket name/],
    ['-staging-', /valid S3 bucket name/],
    ['10.0.0.1', /valid S3 bucket name/],
  ])('bucket %p is refused', (bucket, pattern) => {
    expect(() => assertStagingBucketName(bucket, 'example-prod')).toThrow(
      pattern
    );
  });

  it.each([
    'hc-violins-staging-e2e',
    'staging-e2e-hc',
    'hc.staging.e2e',
    'hc-violins-staging',
  ])('bucket %p is accepted', bucket => {
    expect(() => assertStagingBucketName(bucket, 'example-prod')).not.toThrow();
  });

  it.each([
    ['E2E_STAGING_S3_REGION', 'us_west_1', /valid AWS region/],
    ['E2E_STAGING_S3_REGION', 'mars', /valid AWS region/],
    [
      'E2E_STAGING_AWS_ACCESS_KEY_ID',
      'ASIAEXAMPLEEXAMPLE12',
      /long-term IAM user/,
    ],
    ['E2E_STAGING_AWS_ACCESS_KEY_ID', 'short', /long-term IAM user/],
    ['E2E_STAGING_AWS_SECRET_ACCESS_KEY', 'tooshort', /malformed/],
    [
      'E2E_STAGING_AWS_SECRET_ACCESS_KEY',
      `${SECRET.slice(0, 39)}\n`,
      /malformed/,
    ],
    ['STORAGE_TYPE', 'local', /STORAGE_TYPE must be "s3"/],
    ['AWS_ENDPOINT_URL', 'https://minio.local', /AWS_ENDPOINT_URL/],
    ['AWS_SESSION_TOKEN', 'token', /AWS_SESSION_TOKEN/],
  ])('refuses %s=%p', (key, value, pattern) => {
    const message = captureError(() =>
      resolveStagingStorageE2E(enabledJobEnv({ [key]: value }))
    );
    expect(message).toMatch(pattern);
    if (value.length > 4) expect(message).not.toContain(value.trim());
  });

  it('requires E2E_RUN_SCOPE', () => {
    expect(() =>
      resolveStagingStorageE2E(enabledJobEnv({ E2E_RUN_SCOPE: '' }))
    ).toThrow(/E2E_RUN_SCOPE is required/);
  });
});

describe('resolveStagingStorageE2E: enabled', () => {
  const resolution = resolveStagingStorageE2E(
    enabledJobEnv()
  ) as StagingStorageEnabled;

  it('resolves the staging bucket and the run-scoped prefix', () => {
    expect(resolution).toMatchObject({
      mode: 'enabled',
      bucket: BUCKET,
      region: 'us-west-1',
      scopeKey: SCOPE_KEY,
      objectPrefix: `e2e/${SCOPE_KEY}/`,
      keyPrefix: `e2e/${SCOPE_KEY}`,
    });
  });

  it('exports app storage env with the key prefix and no placeholder', () => {
    const lines = buildStagingStorageGithubEnv(resolution);
    expect(lines).toEqual([
      'E2E_STAGING_STORAGE_MODE=enabled',
      `S3_BUCKET_NAME=${BUCKET}`,
      'S3_REGION=us-west-1',
      `AWS_ACCESS_KEY_ID=${ACCESS_KEY_ID}`,
      `AWS_SECRET_ACCESS_KEY=${SECRET}`,
      `STORAGE_E2E_KEY_PREFIX=e2e/${SCOPE_KEY}`,
    ]);
    // Exactly one line per value: no newline injection possible.
    for (const line of lines) expect(line).not.toMatch(/[\r\n]/);
  });

  it('verifies the effective env after $GITHUB_ENV is applied', () => {
    const effective = applyGithubEnv(
      enabledJobEnv(),
      buildStagingStorageGithubEnv(resolution)
    );
    expect(() =>
      assertEffectiveStorageEnv(effective, resolution)
    ).not.toThrow();
    // The app-side prefix parser accepts what CI exports.
    expect(effective.STORAGE_E2E_KEY_PREFIX).toMatch(/^e2e\/[0-9a-f]{12}$/);
  });

  it('fails verification when an override did not take effect', () => {
    const effective = applyGithubEnv(
      enabledJobEnv(),
      buildStagingStorageGithubEnv(resolution)
    );
    for (const key of [
      'S3_BUCKET_NAME',
      'AWS_ACCESS_KEY_ID',
      'STORAGE_E2E_KEY_PREFIX',
    ]) {
      expect(() =>
        assertEffectiveStorageEnv(
          { ...effective, [key]: 'e2e-ci-placeholder' },
          resolution
        )
      ).toThrow(new RegExp(key));
    }
    expect(() =>
      assertEffectiveStorageEnv(
        { ...effective, E2E_STAGING_STORAGE_MODE: 'disabled' },
        resolution
      )
    ).toThrow(/does not match/);
  });

  it('verifies a disabled job still has the inert placeholder', () => {
    const disabled = resolveStagingStorageE2E(baseJobEnv());
    const effective = applyGithubEnv(
      baseJobEnv(),
      buildStagingStorageGithubEnv(disabled)
    );
    expect(() => assertEffectiveStorageEnv(effective, disabled)).not.toThrow();
    expect(() =>
      assertEffectiveStorageEnv(
        { ...effective, STORAGE_E2E_KEY_PREFIX: `e2e/${SCOPE_KEY}` },
        disabled
      )
    ).toThrow(/STORAGE_E2E_KEY_PREFIX/);
  });
});

// ---------------------------------------------------------------------------
// Cleanup with a fake object store (never real AWS)
// ---------------------------------------------------------------------------

class FakeStore implements ScopedObjectStore {
  objects = new Set<string>();
  listCalls: Array<{ prefix: string; continuationToken?: string }> = [];
  deleteCalls: string[][] = [];
  failKeys = new Set<string>();
  pageSize = 1000;
  /** Simulates a broken backend that ignores the prefix. */
  ignorePrefix = false;

  constructor(keys: string[]) {
    keys.forEach(key => this.objects.add(key));
  }

  async listObjects(input: {
    bucket: string;
    prefix: string;
    continuationToken?: string;
  }) {
    this.listCalls.push({
      prefix: input.prefix,
      continuationToken: input.continuationToken,
    });
    const all = [...this.objects]
      .filter(key => this.ignorePrefix || key.startsWith(input.prefix))
      .sort();
    const start = input.continuationToken ? Number(input.continuationToken) : 0;
    const page = all.slice(start, start + this.pageSize);
    const next = start + this.pageSize;
    return {
      keys: page,
      nextContinuationToken: next < all.length ? String(next) : undefined,
    };
  }

  async deleteObjects(input: { bucket: string; keys: string[] }) {
    this.deleteCalls.push(input.keys);
    const errors: Array<{ key: string; code?: string }> = [];
    for (const key of input.keys) {
      if (this.failKeys.has(key)) {
        errors.push({ key, code: 'AccessDenied' });
      } else {
        this.objects.delete(key);
      }
    }
    return { errors };
  }
}

describe('cleanupRunScopedStorage', () => {
  const mine = [
    `e2e/${SCOPE_KEY}/org-a/inst-1/a.png`,
    `e2e/${SCOPE_KEY}/org-a/inst-1/b.pdf`,
  ];
  const others = [
    `e2e/${OTHER_SCOPE_KEY}/org-b/inst-2/c.png`,
    `e2e/${SCOPE_KEY}x/not-mine.png`,
    `e2e/${SCOPE_KEY}`,
    'org-a/inst-1/production-layout.png',
    'e2e/',
  ];

  it('deletes only objects under exactly e2e/<scopeKey>/', async () => {
    const store = new FakeStore([...mine, ...others]);

    const result = await cleanupRunScopedStorage(store, {
      bucket: BUCKET,
      scopeKey: SCOPE_KEY,
    });

    expect(result).toEqual({
      bucket: BUCKET,
      objectPrefix: `e2e/${SCOPE_KEY}/`,
      deleted: 2,
      residualTotal: 0,
    });
    expect([...store.objects].sort()).toEqual([...others].sort());
    expect(store.listCalls.every(c => c.prefix === `e2e/${SCOPE_KEY}/`)).toBe(
      true
    );
  });

  it('is idempotent: a second run is a verified no-op', async () => {
    const store = new FakeStore([...mine, ...others]);
    await cleanupRunScopedStorage(store, {
      bucket: BUCKET,
      scopeKey: SCOPE_KEY,
    });
    store.deleteCalls = [];

    const again = await cleanupRunScopedStorage(store, {
      bucket: BUCKET,
      scopeKey: SCOPE_KEY,
    });

    expect(again.deleted).toBe(0);
    expect(again.residualTotal).toBe(0);
    expect(store.deleteCalls).toEqual([]);
  });

  it.each(['', '   ', 'e2e', '*', '../', 'ABCDEF012345'])(
    'refuses malformed scope key %p without listing',
    async scopeKey => {
      const store = new FakeStore(mine);
      await expect(
        cleanupRunScopedStorage(store, { bucket: BUCKET, scopeKey })
      ).rejects.toThrow(/malformed/);
      expect(store.listCalls).toEqual([]);
      expect(store.objects.size).toBe(2);
    }
  );

  it('refuses a missing bucket', async () => {
    await expect(
      cleanupRunScopedStorage(new FakeStore(mine), {
        bucket: '',
        scopeKey: SCOPE_KEY,
      })
    ).rejects.toThrow(/bucket is missing/);
  });

  it('deletes nothing if the listing returns a key outside the prefix', async () => {
    const store = new FakeStore([...mine, ...others]);
    store.ignorePrefix = true;

    await expect(
      cleanupRunScopedStorage(store, { bucket: BUCKET, scopeKey: SCOPE_KEY })
    ).rejects.toThrow(/outside the run-scoped prefix/);
    expect(store.deleteCalls).toEqual([]);
    expect(store.objects.size).toBe(mine.length + others.length);
  });

  it('paginates and batches deletes at the S3 limit', async () => {
    const many = Array.from(
      { length: DELETE_BATCH_SIZE + 5 },
      (_, i) => `e2e/${SCOPE_KEY}/org/inst/${String(i).padStart(5, '0')}.png`
    );
    const store = new FakeStore([...many, ...others]);
    store.pageSize = 300;

    const result = await cleanupRunScopedStorage(store, {
      bucket: BUCKET,
      scopeKey: SCOPE_KEY,
    });

    expect(result.deleted).toBe(many.length);
    expect(store.deleteCalls.map(batch => batch.length)).toEqual([
      DELETE_BATCH_SIZE,
      5,
    ]);
    expect([...store.objects].sort()).toEqual([...others].sort());
  });

  it('fails visibly on per-object delete errors without leaking keys', async () => {
    const store = new FakeStore(mine);
    store.failKeys.add(mine[0]);

    const error = await cleanupRunScopedStorage(store, {
      bucket: BUCKET,
      scopeKey: SCOPE_KEY,
    }).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/1 object\(s\).*AccessDenied/);
    expect((error as Error).message).not.toContain(mine[0]);
  });
});

describe('createS3ScopedObjectStore (fake send)', () => {
  class ListObjectsV2Command {
    constructor(public input: Record<string, unknown>) {}
  }
  class DeleteObjectsCommand {
    constructor(public input: Record<string, unknown>) {}
  }

  it('lists with the exact prefix and deletes quietly', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({
        Contents: [{ Key: `e2e/${SCOPE_KEY}/a` }],
        IsTruncated: true,
        NextContinuationToken: 'tok',
      })
      .mockResolvedValueOnce({ Errors: [{ Key: 'k', Code: 'AccessDenied' }] });
    const store = createS3ScopedObjectStore(
      { send },
      { ListObjectsV2Command, DeleteObjectsCommand }
    );

    await expect(
      store.listObjects({ bucket: BUCKET, prefix: `e2e/${SCOPE_KEY}/` })
    ).resolves.toEqual({
      keys: [`e2e/${SCOPE_KEY}/a`],
      nextContinuationToken: 'tok',
    });
    await expect(
      store.deleteObjects({ bucket: BUCKET, keys: [`e2e/${SCOPE_KEY}/a`] })
    ).resolves.toEqual({ errors: [{ key: 'k', code: 'AccessDenied' }] });

    expect(send.mock.calls[0][0]).toBeInstanceOf(ListObjectsV2Command);
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: BUCKET,
      Prefix: `e2e/${SCOPE_KEY}/`,
    });
    expect(send.mock.calls[1][0].input).toEqual({
      Bucket: BUCKET,
      Delete: { Objects: [{ Key: `e2e/${SCOPE_KEY}/a` }], Quiet: true },
    });
  });
});

// ---------------------------------------------------------------------------
// Workflow and operator-artifact contracts
// ---------------------------------------------------------------------------

function e2eJobBlock(): string {
  const start = ciWorkflow.indexOf('\n  e2e-tests:');
  expect(start).toBeGreaterThan(-1);
  return ciWorkflow.slice(start);
}

describe('ci.yml E2E storage wiring', () => {
  const job = e2eJobBlock();

  it('keeps the inert placeholder as the job default', () => {
    expect(job).toMatch(/\n\s+STORAGE_TYPE: s3\n/);
    expect(job).toMatch(/\n\s+S3_BUCKET_NAME: e2e-ci-placeholder\n/);
    expect(job).toMatch(/\n\s+S3_REGION: us-east-1\n/);
  });

  it('maps only the dedicated staging inputs, from vars/secrets', () => {
    expect(job).toMatch(
      /E2E_STAGING_STORAGE_ENABLED: \$\{\{ vars\.E2E_STAGING_STORAGE_ENABLED \}\}/
    );
    expect(job).toMatch(
      /E2E_STAGING_S3_BUCKET_NAME: \$\{\{ vars\.E2E_STAGING_S3_BUCKET_NAME \}\}/
    );
    expect(job).toMatch(
      /E2E_STAGING_S3_REGION: \$\{\{ vars\.E2E_STAGING_S3_REGION \}\}/
    );
    expect(job).toMatch(
      /E2E_STAGING_AWS_ACCESS_KEY_ID: \$\{\{ secrets\.E2E_STAGING_AWS_ACCESS_KEY_ID \}\}/
    );
    expect(job).toMatch(
      /E2E_STAGING_AWS_SECRET_ACCESS_KEY: \$\{\{ secrets\.E2E_STAGING_AWS_SECRET_ACCESS_KEY \}\}/
    );
    expect(job).toMatch(
      /PRODUCTION_S3_BUCKET_NAME: \$\{\{ vars\.PRODUCTION_S3_BUCKET_NAME \}\}/
    );
  });

  it('never maps the legacy repo S3_* / STORAGE_TYPE secrets or app AWS keys directly', () => {
    expect(ciWorkflow).not.toMatch(/secrets\.S3_/);
    expect(ciWorkflow).not.toMatch(/secrets\.STORAGE_TYPE/);
    expect(job).not.toMatch(/\n\s+AWS_ACCESS_KEY_ID:/);
    expect(job).not.toMatch(/\n\s+AWS_SECRET_ACCESS_KEY:/);
    expect(job).not.toMatch(/\n\s+STORAGE_E2E_KEY_PREFIX:/);
    expect(job).not.toMatch(/\n\s+S3_(BUCKET_NAME|REGION): \$\{\{/);
  });

  it('configures and verifies storage before the build and the suite', () => {
    const configure = job.indexOf(
      'run: npx tsx tests/e2e/configure-staging-storage-e2e.ts\n'
    );
    const verify = job.indexOf(
      'run: npx tsx tests/e2e/configure-staging-storage-e2e.ts --verify'
    );
    const allowlist = job.indexOf(
      'run: npx tsx scripts/assert-e2e-staging-project-allowlist.ts'
    );
    const build = job.indexOf('run: npm run build');
    const suite = job.indexOf('run: npm run test:e2e:critical');
    expect(allowlist).toBeGreaterThan(-1);
    expect(configure).toBeGreaterThan(allowlist);
    expect(verify).toBeGreaterThan(configure);
    expect(build).toBeGreaterThan(verify);
    expect(suite).toBeGreaterThan(build);
    expect(job).toMatch(
      /id: staging_storage\n\s+run: npx tsx tests\/e2e\/configure-staging-storage-e2e\.ts\n/
    );
  });

  it('runs scoped storage cleanup only when enabled, after the suite', () => {
    const cleanup = job.indexOf(
      'run: npx tsx tests/e2e/cleanup-staging-storage-e2e.ts'
    );
    expect(cleanup).toBeGreaterThan(
      job.indexOf('run: npm run test:e2e:critical')
    );
    expect(job).toMatch(
      /if: always\(\) && steps\.staging_storage\.outputs\.mode == 'enabled'\n\s+run: npx tsx tests\/e2e\/cleanup-staging-storage-e2e\.ts/
    );
  });

  it('does not reintroduce an E2E concurrency mutex', () => {
    const header = job.slice(0, job.indexOf('steps:'));
    expect(header).not.toMatch(/\n\s+concurrency:/);
  });

  it('never grants or mentions a broad s3:* action', () => {
    expect(ciWorkflow).not.toContain('s3:*');
  });
});

describe('operator IAM policy and lifecycle artifacts', () => {
  const policy = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'docs/ops/staging-storage-e2e-iam-policy.json'),
      'utf8'
    )
  ) as {
    Statement: Array<{
      Effect: string;
      Action: string | string[];
      Resource: string | string[];
      Condition?: unknown;
    }>;
  };
  const asList = (v: string | string[]) => (Array.isArray(v) ? v : [v]);

  it('is allow-only with exactly the four object/list actions', () => {
    const actions = policy.Statement.flatMap(s => asList(s.Action)).sort();
    expect(actions).toEqual([
      's3:DeleteObject',
      's3:GetObject',
      's3:ListBucket',
      's3:PutObject',
    ]);
    expect(policy.Statement.every(s => s.Effect === 'Allow')).toBe(true);
    for (const action of actions) {
      expect(action).not.toContain('*');
    }
  });

  it('scopes objects to <bucket>/e2e/* and ListBucket to s3:prefix e2e/*', () => {
    for (const statement of policy.Statement) {
      const resources = asList(statement.Resource);
      const actions = asList(statement.Action);
      if (actions.includes('s3:ListBucket')) {
        expect(actions).toEqual(['s3:ListBucket']);
        expect(resources).toEqual(['arn:aws:s3:::STAGING_E2E_BUCKET_NAME']);
        expect(statement.Condition).toEqual({
          StringLike: { 's3:prefix': 'e2e/*' },
        });
      } else {
        expect(resources).toEqual([
          'arn:aws:s3:::STAGING_E2E_BUCKET_NAME/e2e/*',
        ]);
      }
    }
  });

  it('never names the production bucket or a wildcard resource', () => {
    const raw = JSON.stringify(policy);
    expect(raw).not.toContain('hc-bows');
    expect(raw).not.toContain('s3:*');
    expect(raw).not.toMatch(/"Resource":"\*"/);
    expect(raw).not.toContain('arn:aws:s3:::*');
  });

  it('expires the e2e/ prefix and blocks all public access', () => {
    const lifecycle = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'docs/ops/staging-storage-e2e-lifecycle.json'),
        'utf8'
      )
    );
    expect(lifecycle.Rules).toEqual([
      expect.objectContaining({
        Status: 'Enabled',
        Filter: { Prefix: 'e2e/' },
        Expiration: { Days: 1 },
      }),
    ]);
    const pab = JSON.parse(
      fs.readFileSync(
        path.join(
          repoRoot,
          'docs/ops/staging-storage-e2e-public-access-block.json'
        ),
        'utf8'
      )
    );
    expect(Object.values(pab)).toEqual([true, true, true, true]);
  });

  it('documents every GitHub name the workflow consumes', () => {
    const doc = fs.readFileSync(
      path.join(repoRoot, 'docs/ops/staging-storage-e2e.md'),
      'utf8'
    );
    for (const name of [
      'E2E_STAGING_STORAGE_ENABLED',
      ...STAGING_STORAGE_INPUT_KEYS,
      'PRODUCTION_S3_BUCKET_NAME',
    ]) {
      expect(doc).toContain(`\`${name}\``);
    }
  });
});

describe('Vercel build boundary', () => {
  it('scripts/ never imports the tests/ staging storage helpers', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules') walk(full);
        } else if (/\.(ts|tsx|js|cjs|mjs)$/.test(entry.name)) {
          const source = fs.readFileSync(full, 'utf8');
          if (/from ['"][^'"]*tests\/e2e\//.test(source)) offenders.push(full);
        }
      }
    };
    walk(path.join(repoRoot, 'scripts'));
    expect(offenders).toEqual([]);
  });
});
