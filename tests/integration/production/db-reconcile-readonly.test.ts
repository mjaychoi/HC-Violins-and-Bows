/** @jest-environment node */

/**
 * Pure-unit coverage for scripts/production/db-reconcile-readonly.ts — no
 * database, no child process. Real-Postgres and real-CLI-process behavior
 * (read-only transaction enforcement, fail-closed reconciliation) is
 * covered separately by
 * db-reconcile-readonly.integration.test.ts, which spins up an isolated
 * local Postgres (same pattern as db-probe-cli.integration.test.ts).
 */
import {
  assertPr87MigrationInvariant,
  buildReport,
  PR_87_CONSOLIDATED_VERSION,
  PR_87_RETIRED_VERSIONS,
} from '../../../scripts/production/db-reconcile-readonly';
import { reconcileMigrationVersions } from '../../../scripts/production/db-deploy-guards';

describe('assertPr87MigrationInvariant', () => {
  it('passes silently when the consolidated version is present and no retired version is present', () => {
    expect(() =>
      assertPr87MigrationInvariant([
        '20260101000000',
        PR_87_CONSOLIDATED_VERSION,
        '20260901000000',
      ])
    ).not.toThrow();
  });

  it('throws when the consolidated version 20260423140001 is missing', () => {
    expect(() =>
      assertPr87MigrationInvariant(['20260101000000', '20260901000000'])
    ).toThrow(/missing the consolidated version 20260423140001/);
  });

  it.each(PR_87_RETIRED_VERSIONS)(
    'throws when retired version %s is present locally alongside the consolidated version',
    retiredVersion => {
      expect(() =>
        assertPr87MigrationInvariant([
          PR_87_CONSOLIDATED_VERSION,
          retiredVersion,
        ])
      ).toThrow(/retired six-file migration version\(s\) reappeared/);
    }
  );

  it('reports every reappeared retired version, not just the first', () => {
    let thrown: Error | undefined;
    try {
      assertPr87MigrationInvariant([
        PR_87_CONSOLIDATED_VERSION,
        '20260423140002',
        '20260423140006',
      ]);
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.message).toContain('20260423140002');
    expect(thrown?.message).toContain('20260423140006');
  });
});

describe('buildReport', () => {
  it('shapes the exact report contract from a reconciliation result', () => {
    const reconciliation = reconcileMigrationVersions(
      [
        { version: '20260101000000', filename: '20260101000000_a.sql' },
        { version: '20260201000000', filename: '20260201000000_b.sql' },
      ],
      ['20260101000000']
    );

    const report = buildReport(
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      reconciliation
    );

    expect(report).toEqual({
      mainSha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      localVersionCount: 2,
      remoteUniqueVersionCount: 1,
      remoteOnlyVersions: [],
      pendingVersions: ['20260201000000'],
      pendingMigrationCount: 1,
      firstPendingVersion: '20260201000000',
      lastPendingVersion: '20260201000000',
      latestApplied: '20260101000000',
      pendingDigest: reconciliation.pendingDigest,
    });
  });

  it('reports zero pending with null first/last versions when fully converged', () => {
    const reconciliation = reconcileMigrationVersions(
      [{ version: '20260101000000', filename: '20260101000000_a.sql' }],
      ['20260101000000']
    );

    const report = buildReport('sha', reconciliation);

    expect(report.pendingMigrationCount).toBe(0);
    expect(report.firstPendingVersion).toBeNull();
    expect(report.lastPendingVersion).toBeNull();
    expect(report.remoteOnlyVersions).toEqual([]);
  });
});
