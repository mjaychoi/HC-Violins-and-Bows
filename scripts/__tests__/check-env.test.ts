import { runProductionEnvCheck } from '../check-env';
import type { EnvMap } from '../../src/config/env/issues';

const UNIQUE_SERVICE_ROLE = 'cli-service-role-secret-unit-test-aa11';
const UNIQUE_AWS_SECRET = 'cli-aws-secret-unit-test-bb22';
const UNIQUE_UPSTASH_TOKEN = 'cli-upstash-secret-unit-test-cc33';

function validProductionEnv(overrides: EnvMap = {}): EnvMap {
  return {
    NEXT_PUBLIC_SUPABASE_URL: 'https://exampleproject.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'cli-anon-key',
    NEXT_PUBLIC_APP_URL: 'https://inventory.example.com',
    SUPABASE_SERVICE_ROLE_KEY: UNIQUE_SERVICE_ROLE,
    STORAGE_TYPE: 's3',
    S3_BUCKET_NAME: 'example-inventory-bucket',
    S3_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'TESTACCESSKEYIDEXAMP',
    AWS_SECRET_ACCESS_KEY: UNIQUE_AWS_SECRET,
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: UNIQUE_UPSTASH_TOKEN,
    ORPHAN_CLEANUP_SECRET: 'cli-orphan-secret-unit-test',
    ...overrides,
  };
}

describe('runProductionEnvCheck', () => {
  it('exits 0 for a valid production env', () => {
    const valid = runProductionEnvCheck(validProductionEnv());
    expect(valid.ok).toBe(true);
    expect(valid.exitCode).toBe(0);
    expect(valid.stdout).toMatch(/passed/i);
    expect(valid.stderr).toBe('');
  });

  it('exits 1 when Upstash token is missing and does not print secrets', () => {
    const missing = validProductionEnv();
    delete missing.UPSTASH_REDIS_REST_TOKEN;
    const invalid = runProductionEnvCheck(missing);
    expect(invalid.ok).toBe(false);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toContain('UPSTASH_REDIS_REST_TOKEN');
    expect(invalid.stderr).not.toContain(UNIQUE_SERVICE_ROLE);
    expect(invalid.stderr).not.toContain(UNIQUE_AWS_SECRET);
    expect(invalid.stdout).toBe('');
  });
});
