/** @jest-environment node */

/**
 * Real-process integration test for
 * supabase/migrations/20260814160000_enforce_financial_confidentiality_db_boundary.sql
 * (finding V7-003) against an isolated local Postgres instance
 * (embedded-postgres — no Docker, no hosted/production database, no
 * mocks).
 *
 * Builds a privilege-faithful copy of the instruments/sales_history/
 * invoices/invoice_items subsystem via
 * scripts/supabase/financial_confidentiality_test_bootstrap.sql (real RLS
 * policies + real table GRANTs for `authenticated`/`anon`/`service_role`,
 * mirroring production's default-privilege model), applies the
 * prerequisite 20260804020000_harden_sale_lifecycle_authorization.sql
 * (defines sale_lifecycle_net_amount/instrument_has_active_sale, which the
 * new migration REVOKEs direct `authenticated` EXECUTE from), then the new
 * migration itself, then runs the full role-context regression suite in
 * scripts/supabase/financial_confidentiality.test.sql — real
 * `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ...)`
 * contexts for admin/member/cross-org/anon, not mocks.
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BOOTSTRAP_FILE = path.join(
  REPO_ROOT,
  'scripts',
  'supabase',
  'financial_confidentiality_test_bootstrap.sql'
);
const SALE_LIFECYCLE_MIGRATION = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260804020000_harden_sale_lifecycle_authorization.sql'
);
const MIGRATION_FILE = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260814160000_enforce_financial_confidentiality_db_boundary.sql'
);
const REGRESSION_TEST_FILE = path.join(
  REPO_ROOT,
  'scripts',
  'supabase',
  'financial_confidentiality.test.sql'
);

jest.setTimeout(60000);

// Strips psql-only meta-commands (e.g. `\set ON_ERROR_STOP on`) that the
// repo's disposable-bootstrap/test SQL files use for `psql -f` invocations
// but that node-postgres's plain SQL protocol cannot parse.
function readSql(filePath: string): string {
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('\\'))
    .join('\n');
}

const BOOTSTRAP_SQL = readSql(BOOTSTRAP_FILE);
const SALE_LIFECYCLE_SQL = readSql(SALE_LIFECYCLE_MIGRATION);
const MIGRATION_SQL = readSql(MIGRATION_FILE);
const REGRESSION_TEST_SQL = readSql(REGRESSION_TEST_FILE);

describe('20260814160000 enforce_financial_confidentiality_db_boundary (V7-003)', () => {
  let client: Client;

  beforeAll(async () => {
    const connectionString = process.env.TEST_MIGRATION_POSTGRES_URL;
    if (!connectionString) {
      throw new Error(
        'TEST_MIGRATION_POSTGRES_URL is not set. Run via the npm script that wires up global-setup.cjs.'
      );
    }
    client = new Client({ connectionString });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  test('bootstrap + prerequisite migration + new migration apply cleanly to a fresh privilege-faithful schema', async () => {
    await client.query(BOOTSTRAP_SQL);
    await client.query(SALE_LIFECYCLE_SQL);
    await client.query(MIGRATION_SQL);
  });

  test('instruments column privileges: authenticated has no SELECT on cost_price/consignment_price, retains it on retail columns', async () => {
    const result = await client.query<{
      column_name: string;
      grantee: string;
    }>(
      `SELECT column_name, grantee
       FROM information_schema.column_privileges
       WHERE table_schema = 'public' AND table_name = 'instruments'
         AND grantee = 'authenticated' AND privilege_type = 'SELECT'`
    );
    const columns = new Set(result.rows.map(r => r.column_name));
    expect(columns.has('cost_price')).toBe(false);
    expect(columns.has('consignment_price')).toBe(false);
    expect(columns.has('price')).toBe(true);
    expect(columns.has('maker')).toBe(true);
  });

  test('sales_history column privileges: authenticated has no SELECT on sale_price, retains it on non-financial columns', async () => {
    const result = await client.query<{
      column_name: string;
    }>(
      `SELECT column_name
       FROM information_schema.column_privileges
       WHERE table_schema = 'public' AND table_name = 'sales_history'
         AND grantee = 'authenticated' AND privilege_type = 'SELECT'`
    );
    const columns = new Set(result.rows.map(r => r.column_name));
    expect(columns.has('sale_price')).toBe(false);
    expect(columns.has('sale_date')).toBe(true);
    expect(columns.has('notes')).toBe(true);
  });

  test('invoices/invoice_items SELECT RLS policies require is_admin()', async () => {
    const result = await client.query<{ tablename: string; qual: string }>(
      `SELECT tablename, qual
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN ('invoices', 'invoice_items')
         AND policyname IN ('invoices_select', 'invoice_items_select')`
    );
    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) {
      expect(row.qual).toContain('is_admin()');
    }
  });

  test('sale_lifecycle_net_amount has no direct authenticated EXECUTE grant', async () => {
    const result = await client.query<{ grantee: string }>(
      `SELECT grantee
       FROM information_schema.routine_privileges
       WHERE routine_schema = 'public' AND routine_name = 'sale_lifecycle_net_amount'
         AND privilege_type = 'EXECUTE'`
    );
    const grantees = result.rows.map(r => r.grantee);
    expect(grantees).not.toContain('authenticated');
    expect(grantees).not.toContain('PUBLIC');
  });

  test('new admin-only RPCs exist with no PUBLIC/anon EXECUTE', async () => {
    for (const fn of [
      'get_instruments_financials',
      'get_sales_financials',
      'get_sales_totals',
      'get_client_purchase_aggregate',
      'get_sales_summary_by_client',
    ]) {
      const result = await client.query<{ grantee: string }>(
        `SELECT grantee
         FROM information_schema.routine_privileges
         WHERE routine_schema = 'public' AND routine_name = $1
           AND privilege_type = 'EXECUTE'`,
        [fn]
      );
      const grantees = result.rows.map(r => r.grantee);
      expect(grantees).not.toContain('PUBLIC');
      expect(grantees).not.toContain('anon');
      expect(grantees).toContain('authenticated');
    }
  });

  test('financial_confidentiality.test.sql: full role-context regression suite (admin/member/cross-org/anon) passes', async () => {
    await client.query(REGRESSION_TEST_SQL);
  });

  test('migration is idempotent: re-applying it to the already-migrated schema succeeds', async () => {
    await client.query(MIGRATION_SQL);
  });

  test('regression suite still passes after the idempotent re-apply', async () => {
    await client.query(REGRESSION_TEST_SQL);
  });
});
