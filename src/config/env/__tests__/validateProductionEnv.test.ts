import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ENV_KEY_CATALOG,
  PRODUCTION_REQUIRED_KEYS,
  formatProductionEnvResult,
  parsePublicDevEnv,
  parsePublicProductionEnv,
  validateNonProductionEnv,
  validateProductionEnv,
  type EnvMap,
} from '@/config/env';

const UNIQUE_SERVICE_ROLE = 'srv-secret-unit-test-value-7f3c2a91';
const UNIQUE_AWS_SECRET = 'aws-secret-unit-test-value-9b18e044';
const UNIQUE_UPSTASH_TOKEN = 'upstash-secret-unit-test-value-c41d88aa';
const UNIQUE_ORPHAN_SECRET = 'orphan-secret-unit-test-value-e2a70b55';
const UNIQUE_ANON = 'anon-public-unit-test-value-not-a-jwt';

function validProductionEnv(overrides: EnvMap = {}): EnvMap {
  return {
    NEXT_PUBLIC_SUPABASE_URL: 'https://exampleproject.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: UNIQUE_ANON,
    NEXT_PUBLIC_APP_URL: 'https://inventory.example.com',
    SUPABASE_SERVICE_ROLE_KEY: UNIQUE_SERVICE_ROLE,
    STORAGE_TYPE: 's3',
    S3_BUCKET_NAME: 'example-inventory-bucket',
    S3_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'TESTACCESSKEYIDEXAMP',
    AWS_SECRET_ACCESS_KEY: UNIQUE_AWS_SECRET,
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: UNIQUE_UPSTASH_TOKEN,
    ORPHAN_CLEANUP_SECRET: UNIQUE_ORPHAN_SECRET,
    ...overrides,
  };
}

function issueKeys(env: EnvMap): string[] {
  const result = validateProductionEnv(env);
  if (result.ok) return [];
  return result.issues.map(issue => issue.key);
}

function serializedDiagnostics(env: EnvMap): string {
  const result = validateProductionEnv(env);
  const formatted = formatProductionEnvResult(result, env);
  return `${JSON.stringify(result)}\n${formatted.stdout}\n${formatted.stderr}`;
}

function assertNoSecretLeak(env: EnvMap): void {
  const serialized = serializedDiagnostics(env);
  for (const value of [
    UNIQUE_SERVICE_ROLE,
    UNIQUE_AWS_SECRET,
    UNIQUE_UPSTASH_TOKEN,
    UNIQUE_ORPHAN_SECRET,
  ]) {
    expect(serialized).not.toContain(value);
  }
}

describe('validateProductionEnv', () => {
  it('accepts a complete valid production configuration', () => {
    const env = validProductionEnv();
    const result = validateProductionEnv(env);
    expect(result).toEqual({ ok: true, warnings: [] });
    assertNoSecretLeak(env);
  });

  it('fails when UPSTASH_REDIS_REST_URL is missing', () => {
    const env = validProductionEnv({ UPSTASH_REDIS_REST_URL: undefined });
    delete env.UPSTASH_REDIS_REST_URL;
    expect(issueKeys(env)).toContain('UPSTASH_REDIS_REST_URL');
    assertNoSecretLeak(env);
  });

  it('fails when UPSTASH_REDIS_REST_TOKEN is missing', () => {
    const env = validProductionEnv({ UPSTASH_REDIS_REST_TOKEN: undefined });
    delete env.UPSTASH_REDIS_REST_TOKEN;
    expect(issueKeys(env)).toContain('UPSTASH_REDIS_REST_TOKEN');
    assertNoSecretLeak(env);
  });

  it('fails when required Supabase public config is missing', () => {
    const env = validProductionEnv();
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const keys = issueKeys(env);
    expect(keys).toEqual(
      expect.arrayContaining([
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      ])
    );
    assertNoSecretLeak(env);
  });

  it('fails when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    const env = validProductionEnv();
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    expect(issueKeys(env)).toContain('SUPABASE_SERVICE_ROLE_KEY');
    assertNoSecretLeak(env);
  });

  it('fails when required S3 configuration is missing', () => {
    const env = validProductionEnv();
    delete env.S3_BUCKET_NAME;
    delete env.S3_REGION;
    delete env.AWS_ACCESS_KEY_ID;
    delete env.AWS_SECRET_ACCESS_KEY;
    const keys = issueKeys(env);
    expect(keys).toEqual(
      expect.arrayContaining([
        'S3_BUCKET_NAME',
        'S3_REGION',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
      ])
    );
  });

  it('fails when ORPHAN_CLEANUP_SECRET is missing', () => {
    const env = validProductionEnv();
    delete env.ORPHAN_CLEANUP_SECRET;
    expect(issueKeys(env)).toContain('ORPHAN_CLEANUP_SECRET');
  });

  it('fails when NEXT_PUBLIC_APP_URL is missing', () => {
    const env = validProductionEnv();
    delete env.NEXT_PUBLIC_APP_URL;
    expect(issueKeys(env)).toContain('NEXT_PUBLIC_APP_URL');
    assertNoSecretLeak(env);
  });

  it('fails when NEXT_PUBLIC_APP_URL points at localhost', () => {
    const env = validProductionEnv({
      NEXT_PUBLIC_APP_URL: 'https://localhost:3000',
    });
    const result = validateProductionEnv(env);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.key).toBe('NEXT_PUBLIC_APP_URL');
    expect(result.issues[0]?.message).toMatch(/localhost/i);
    assertNoSecretLeak(env);
  });

  it('fails when NEXT_PUBLIC_APP_URL is not https', () => {
    const env = validProductionEnv({
      NEXT_PUBLIC_APP_URL: 'http://inventory.example.com',
    });
    expect(issueKeys(env)).toContain('NEXT_PUBLIC_APP_URL');
  });

  it('rejects STORAGE_TYPE=local in production', () => {
    const env = validProductionEnv({ STORAGE_TYPE: 'local' });
    expect(issueKeys(env)).toContain('STORAGE_TYPE');
  });

  it('does not require optional Sentry, health secret, or DATABASE_URL', () => {
    const env = validProductionEnv();
    delete env.NEXT_PUBLIC_SENTRY_DSN;
    delete env.SENTRY_DSN;
    delete env.HEALTH_CHECK_SECRET;
    delete env.DATABASE_URL;
    expect(validateProductionEnv(env).ok).toBe(true);
  });

  it('rejects an ordinary production RATE_LIMITING_DISABLED=true configuration', () => {
    const env = validProductionEnv({ RATE_LIMITING_DISABLED: 'true' });
    const result = validateProductionEnv(env);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map(issue => issue.key)).toContain(
      'RATE_LIMITING_DISABLED'
    );
    expect(JSON.stringify(result.issues)).toMatch(
      /ALLOW_UNSAFE_PRODUCTION_RATE_LIMITING_DISABLED/
    );
    assertNoSecretLeak(env);
  });

  it('allows an explicit emergency rate-limit disable while still requiring Upstash', () => {
    const env = validProductionEnv({
      RATE_LIMITING_DISABLED: 'true',
      ALLOW_UNSAFE_PRODUCTION_RATE_LIMITING_DISABLED: 'true',
    });
    const result = validateProductionEnv(env);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.join('\n')).toMatch(/emergency fail-open/i);
  });

  it('does not accept RATE_LIMITING_DISABLED as a substitute for missing Upstash', () => {
    const env = validProductionEnv({
      RATE_LIMITING_DISABLED: 'true',
      ALLOW_UNSAFE_PRODUCTION_RATE_LIMITING_DISABLED: 'true',
    });
    delete env.UPSTASH_REDIS_REST_URL;
    delete env.UPSTASH_REDIS_REST_TOKEN;
    const keys = issueKeys(env);
    expect(keys).toEqual(
      expect.arrayContaining([
        'UPSTASH_REDIS_REST_URL',
        'UPSTASH_REDIS_REST_TOKEN',
      ])
    );
  });

  it('identifies invalid keys without exposing secret values', () => {
    const env = validProductionEnv({
      UPSTASH_REDIS_REST_URL: 'not-a-url',
    });
    const serialized = serializedDiagnostics(env);
    expect(serialized).toContain('UPSTASH_REDIS_REST_URL');
    expect(serialized).not.toContain(UNIQUE_SERVICE_ROLE);
    expect(serialized).not.toContain(UNIQUE_AWS_SECRET);
    expect(serialized).not.toContain(UNIQUE_UPSTASH_TOKEN);
    expect(serialized).not.toContain(UNIQUE_ORPHAN_SECRET);
  });

  it('fails when SUPABASE_URL does not match NEXT_PUBLIC_SUPABASE_URL', () => {
    const env = validProductionEnv({
      SUPABASE_URL: 'https://otherproject.supabase.co',
    });
    expect(issueKeys(env)).toContain('SUPABASE_URL');
  });
});

describe('validateNonProductionEnv', () => {
  it('does not require production Upstash, S3, or service-role credentials', () => {
    const env: EnvMap = {
      NODE_ENV: 'test',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.com',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    };
    expect(validateNonProductionEnv(env)).toEqual({ ok: true, warnings: [] });
    expect(parsePublicDevEnv(env)).toEqual({ ok: true });
  });

  it('does not treat the Jest host process as a production configuration', () => {
    expect(validateNonProductionEnv({})).toEqual({ ok: true, warnings: [] });
    expect(validateProductionEnv({}).ok).toBe(false);
  });
});

describe('parsePublicProductionEnv', () => {
  it('does not read server secrets', () => {
    const result = parsePublicProductionEnv(
      validProductionEnv({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result.issues)).not.toContain(UNIQUE_SERVICE_ROLE);
    expect(result.issues.map(issue => issue.key)).not.toContain(
      'SUPABASE_SERVICE_ROLE_KEY'
    );
  });
});

describe('env.template catalog drift', () => {
  const template = readFileSync(join(process.cwd(), 'env.template'), 'utf8');

  it('documents every catalog key', () => {
    for (const spec of ENV_KEY_CATALOG) {
      expect(template).toContain(spec.key);
    }
  });

  it('documents every production-required key as an assignment or comment', () => {
    for (const key of PRODUCTION_REQUIRED_KEYS) {
      expect(template).toContain(key);
    }
  });
});
