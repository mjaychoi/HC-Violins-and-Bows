/** @jest-environment node */

import {
  REQUIRED_EXTENSIONS,
  VAULT_DECRYPTED_SECRETS_LOOKUP_SQL,
  applyVaultInfrastructure,
  assessVaultInfrastructure,
  type ResetObjectReport,
} from '../../../scripts/staging/verify-reset-objects';

function passingPlatformReport(): Omit<
  ResetObjectReport,
  'vaultInfrastructureAvailable' | 'missingVaultInfrastructure'
> {
  return {
    passed: true,
    missingBuckets: [],
    orphanCleanupCron: true,
    missingFunctions: [],
    missingPolicies: [],
    missingGrants: [],
    failedRuntimeContracts: [],
    missingExtensions: [],
  };
}

describe('post-reset Vault infrastructure', () => {
  it('requires supabase_vault and not test-only extensions', () => {
    expect([...REQUIRED_EXTENSIONS]).toEqual([
      'pgcrypto',
      'pg_cron',
      'pg_net',
      'supabase_vault',
    ]);
    expect(REQUIRED_EXTENSIONS).not.toContain('uuid-ossp');
  });

  it('passes when the extension and decrypted_secrets relation exist', () => {
    expect(
      assessVaultInfrastructure({
        installedExtensions: [
          'pgcrypto',
          'pg_cron',
          'pg_net',
          'supabase_vault',
        ],
        decryptedSecretsRelkind: 'v',
      })
    ).toEqual({ available: true, missing: [] });

    for (const relkind of ['r', 'v', 'm', 'f', 'p']) {
      expect(
        assessVaultInfrastructure({
          installedExtensions: ['supabase_vault'],
          decryptedSecretsRelkind: relkind,
        }).available
      ).toBe(true);
    }
  });

  it('does not require app_base_url or orphan_cleanup_secret rows', () => {
    const vault = assessVaultInfrastructure({
      installedExtensions: ['supabase_vault'],
      decryptedSecretsRelkind: 'v',
    });
    const report = applyVaultInfrastructure(passingPlatformReport(), vault);

    expect(report.passed).toBe(true);
    expect(report.vaultInfrastructureAvailable).toBe(true);
    expect(report.missingVaultInfrastructure).toEqual([]);
    expect(vault).not.toHaveProperty('secrets');
  });

  it('fails closed when the extension or relation is missing', () => {
    const missingExtension = assessVaultInfrastructure({
      installedExtensions: ['pgcrypto', 'pg_cron', 'pg_net'],
      decryptedSecretsRelkind: 'v',
    });
    expect(missingExtension).toEqual({
      available: false,
      missing: ['supabase_vault extension'],
    });
    expect(
      applyVaultInfrastructure(passingPlatformReport(), missingExtension).passed
    ).toBe(false);

    const missingRelation = assessVaultInfrastructure({
      installedExtensions: ['supabase_vault'],
      decryptedSecretsRelkind: null,
    });
    expect(missingRelation.available).toBe(false);
    expect(missingRelation.missing).toEqual(['vault.decrypted_secrets']);

    const wrongKind = assessVaultInfrastructure({
      installedExtensions: ['supabase_vault'],
      decryptedSecretsRelkind: 'i',
    });
    expect(wrongKind.available).toBe(false);
    expect(wrongKind.missing).toContain('vault.decrypted_secrets');

    const bothMissing = assessVaultInfrastructure({
      installedExtensions: [],
      decryptedSecretsRelkind: null,
    });
    expect(bothMissing.missing).toEqual([
      'supabase_vault extension',
      'vault.decrypted_secrets',
    ]);
    expect(
      applyVaultInfrastructure(passingPlatformReport(), bothMissing)
        .vaultInfrastructureAvailable
    ).toBe(false);
  });

  it('looks up the relation in the catalog without reading secret values', () => {
    const sql = VAULT_DECRYPTED_SECRETS_LOOKUP_SQL;
    expect(sql).toContain("nspname = 'vault'");
    expect(sql).toContain("relname = 'decrypted_secrets'");
    expect(sql).toContain('pg_class');
    expect(sql).not.toMatch(/from\s+vault\.decrypted_secrets/i);
    expect(sql).not.toMatch(/decrypted_secret(?!s)/);
    expect(sql).not.toMatch(/app_base_url/);
    expect(sql).not.toMatch(/orphan_cleanup_secret/);
    expect(sql).not.toMatch(/\bsecret\b/i);
  });
});
