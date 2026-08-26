/** @jest-environment node */

import {
  assertPostDeployTargetAllowlisted,
  assertSyntheticCredentialsPresent,
} from '../allowlist';

const stagingRef = 'stagingexample1234';
const productionRef = 'prodrefexample9999';
const otherRef = 'otherrefexample5678';

const validEnv = {
  POSTDEPLOY_BASE_URL: 'https://staging.example.test',
  STAGING_APP_BASE_URL: 'https://staging.example.test',
  STAGING_SUPABASE_PROJECT_REF: stagingRef,
  PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
  STAGING_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
  STAGING_SUPABASE_ANON_KEY: 'anon-key',
  SYNTHETIC_EMAIL: 'synthetic@example.test',
  SYNTHETIC_PASSWORD: 'synthetic-password',
};

describe('post-deploy allowlist', () => {
  it('accepts an allowlisted staging target', () => {
    expect(assertPostDeployTargetAllowlisted(validEnv).baseUrl).toBe(
      'https://staging.example.test'
    );
  });

  it('rejects a missing base URL', () => {
    expect(() =>
      assertPostDeployTargetAllowlisted({
        ...validEnv,
        POSTDEPLOY_BASE_URL: undefined,
        STAGING_APP_BASE_URL: undefined,
      })
    ).toThrow(/POSTDEPLOY_BASE_URL/i);
  });

  it('rejects a base URL that does not match STAGING_APP_BASE_URL', () => {
    expect(() =>
      assertPostDeployTargetAllowlisted({
        ...validEnv,
        POSTDEPLOY_BASE_URL: 'https://other.example.test',
      })
    ).toThrow(/does not match STAGING_APP_BASE_URL/i);
  });

  it('rejects a supabase project ref outside the allowlist', () => {
    expect(() =>
      assertPostDeployTargetAllowlisted({
        ...validEnv,
        STAGING_SUPABASE_URL: `https://${otherRef}.supabase.co`,
      })
    ).toThrow(/does not match STAGING_SUPABASE_PROJECT_REF/i);
  });

  it('rejects the configured production project', () => {
    expect(() =>
      assertPostDeployTargetAllowlisted({
        ...validEnv,
        STAGING_SUPABASE_PROJECT_REF: productionRef,
        STAGING_SUPABASE_URL: `https://${productionRef}.supabase.co`,
      })
    ).toThrow(/must not use the production/i);
  });

  it('rejects POSTDEPLOY_ALLOW_PRODUCTION', () => {
    expect(() =>
      assertPostDeployTargetAllowlisted({
        ...validEnv,
        POSTDEPLOY_ALLOW_PRODUCTION: 'true',
      })
    ).toThrow(/Production synthetic writes are not enabled/i);
  });

  it('fails closed when synthetic credentials are missing', () => {
    expect(() =>
      assertSyntheticCredentialsPresent({
        ...validEnv,
        SYNTHETIC_EMAIL: undefined,
        SYNTHETIC_PASSWORD: undefined,
      })
    ).toThrow(/SYNTHETIC_EMAIL|SYNTHETIC_PASSWORD/);
  });
});
