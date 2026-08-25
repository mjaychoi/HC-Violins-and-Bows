/** @jest-environment node */

import * as fs from 'fs';
import * as path from 'path';

import { assertE2EStagingProjectAllowlist } from '../../../scripts/assert-e2e-staging-project-allowlist';

/** Synthetic refs only — never use a real project identifier in fixtures. */
const stagingRef = 'stagingexample1234';
const otherRef = 'otherrefexample5678';
const productionRef = 'prodrefexample9999';

const ciWorkflow = fs.readFileSync(
  path.join(process.cwd(), '.github/workflows/ci.yml'),
  'utf8'
);

describe('E2E staging project allowlist', () => {
  it('passes when the URL host matches STAGING_SUPABASE_PROJECT_REF', () => {
    expect(
      assertE2EStagingProjectAllowlist({
        STAGING_SUPABASE_PROJECT_REF: stagingRef,
        NEXT_PUBLIC_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
      })
    ).toEqual({ matched: true });
  });

  it('fail-closes when STAGING_SUPABASE_PROJECT_REF is missing', () => {
    expect(() =>
      assertE2EStagingProjectAllowlist({
        NEXT_PUBLIC_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
      })
    ).toThrow(/STAGING_SUPABASE_PROJECT_REF/i);
  });

  it('fail-closes when the URL project ref does not match the allowlist', () => {
    expect(() =>
      assertE2EStagingProjectAllowlist({
        STAGING_SUPABASE_PROJECT_REF: stagingRef,
        NEXT_PUBLIC_SUPABASE_URL: `https://${otherRef}.supabase.co`,
      })
    ).toThrow(/does not match STAGING_SUPABASE_PROJECT_REF/i);
  });

  it('fail-closes when the URL has no extractable project ref', () => {
    expect(() =>
      assertE2EStagingProjectAllowlist({
        STAGING_SUPABASE_PROJECT_REF: stagingRef,
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.com',
      })
    ).toThrow(/missing or ambiguous/i);
  });

  it('fail-closes when the allowlisted ref is the configured production ref', () => {
    expect(() =>
      assertE2EStagingProjectAllowlist({
        STAGING_SUPABASE_PROJECT_REF: productionRef,
        PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
        NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co`,
      })
    ).toThrow(/must not use the production/i);
  });

  it('maps STAGING_SUPABASE_PROJECT_REF from vars, not secrets or a static fallback', () => {
    expect(ciWorkflow).toMatch(
      /STAGING_SUPABASE_PROJECT_REF:\s*\$\{\{\s*vars\.STAGING_SUPABASE_PROJECT_REF\s*\}\}/
    );
    expect(ciWorkflow).not.toMatch(
      /STAGING_SUPABASE_PROJECT_REF:\s*\$\{\{\s*secrets\./
    );
    expect(ciWorkflow).not.toMatch(/\$\{STAGING_SUPABASE_PROJECT_REF:-[^}]+\}/);
    expect(ciWorkflow).toMatch(
      /npx tsx scripts\/assert-e2e-staging-project-allowlist\.ts/
    );
  });
});
