/** @jest-environment node */

/**
 * Real-process integration test for the authoritative post-deploy catalog
 * postflight (scripts/production/postflight-catalog.ts) against an
 * isolated local Postgres instance (embedded-postgres — no Docker, no
 * hosted/production database, no mocks).
 *
 * Test order is deliberate: this file shares one Postgres instance with
 * db-probe-cli.integration.test.ts (started once by helpers/global-setup.cjs)
 * and `createRequiredCatalogObjects` is additive (CREATE OR REPLACE / IF NOT
 * EXISTS), so the "objects are missing" case must run before any test calls
 * `createRequiredCatalogObjects`.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { parseLocalMigrationFilenames } from '../../../scripts/production/db-deploy-guards';
import {
  getTestPostgres,
  seedMigrationHistory,
  type TestPostgres,
} from './helpers/testPostgres';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const TSX_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const POSTFLIGHT_SCRIPT = path.join(
  REPO_ROOT,
  'scripts',
  'production',
  'postflight-catalog.ts'
);

jest.setTimeout(60000);

type CliResult = { stdout: string; stderr: string; exitCode: number | null };

function runPostflight(env: Record<string, string>): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX_BIN, [POSTFLIGHT_SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', exitCode => resolve({ stdout, stderr, exitCode }));
  });
}

function readRealLocalMigrations() {
  const localDir = path.join(REPO_ROOT, 'supabase', 'migrations');
  const filenames = fs.readdirSync(localDir).filter(f => f.endsWith('.sql'));
  return parseLocalMigrationFilenames(filenames);
}

/** Minimal stand-ins for the catalog objects the postflight checks for —
 * not real business logic, just objects with the right names/shapes. */
async function createRequiredCatalogObjects(connectionString: string) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION public.org_id() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
      CREATE OR REPLACE FUNCTION public.user_role() RETURNS text LANGUAGE sql AS $$ SELECT null::text $$;
      CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;

      CREATE TABLE IF NOT EXISTS public.invoices (id serial PRIMARY KEY, invoice_number text);
      CREATE TABLE IF NOT EXISTS public.invoice_settings (
        id serial PRIMARY KEY,
        business_name text, business_address text, business_phone text, business_email text,
        bank_account_holder text, bank_name text, bank_swift_code text, bank_account_number text,
        default_conditions text, default_exchange_rate numeric, default_currency text
      );
      CREATE TABLE IF NOT EXISTS public.instrument_images (
        id serial PRIMARY KEY, storage_key text, file_name text, file_size bigint, mime_type text, display_order int
      );
      CREATE TABLE IF NOT EXISTS public.client_instruments (id serial PRIMARY KEY, display_order int);
      CREATE TABLE IF NOT EXISTS public.clients (id serial PRIMARY KEY, client_number text);

      CREATE OR REPLACE FUNCTION public.noop_trigger_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      DROP TRIGGER IF EXISTS tr_enforce_instrument_status_transition ON public.invoices;
      DROP TRIGGER IF EXISTS tr_enforce_invoice_status_transition ON public.invoices;
      DROP TRIGGER IF EXISTS tr_enforce_maintenance_task_status_transition ON public.invoices;
      CREATE TRIGGER tr_enforce_instrument_status_transition BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.noop_trigger_fn();
      CREATE TRIGGER tr_enforce_invoice_status_transition BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.noop_trigger_fn();
      CREATE TRIGGER tr_enforce_maintenance_task_status_transition BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.noop_trigger_fn();
    `);
  } finally {
    await client.end();
  }
}

describe('postflight-catalog.ts — real CLI process against an isolated local Postgres', () => {
  const testPg: TestPostgres = getTestPostgres();

  it('fails (blocking) when the migration set converges but required functions/triggers/columns are missing', async () => {
    const localMigrations = readRealLocalMigrations();
    await seedMigrationHistory(
      testPg.connectionString,
      localMigrations.map(m => m.version)
    );
    // Deliberately runs before createRequiredCatalogObjects is ever called
    // in this file, so the public schema has none of the required objects.

    const result = await runPostflight({
      DATABASE_URL: testPg.connectionString,
    });

    expect(result.exitCode).not.toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.migrationSetConverged).toBe(true);
    expect(parsed.missingFunctions.length).toBeGreaterThan(0);
    expect(parsed.missingColumns.length).toBeGreaterThan(0);
    expect(parsed.passed).toBe(false);
  });

  it('fails (blocking) when the migration set has not converged, even once catalog objects exist', async () => {
    const localMigrations = readRealLocalMigrations();
    const partialRemote = localMigrations.slice(0, 3).map(m => m.version);
    await seedMigrationHistory(testPg.connectionString, partialRemote);
    await createRequiredCatalogObjects(testPg.connectionString);

    const result = await runPostflight({
      DATABASE_URL: testPg.connectionString,
    });

    expect(result.exitCode).not.toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.migrationSetConverged).toBe(false);
    expect(parsed.pendingMigrationCount).toBeGreaterThan(0);
    expect(parsed.passed).toBe(false);
  });

  it('passes the zero-pending contract when the migration set converges and all required catalog objects exist', async () => {
    const localMigrations = readRealLocalMigrations();
    await seedMigrationHistory(
      testPg.connectionString,
      localMigrations.map(m => m.version)
    );
    await createRequiredCatalogObjects(testPg.connectionString);

    const result = await runPostflight({
      DATABASE_URL: testPg.connectionString,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed).toEqual({
      authoritative: true,
      migrationSetConverged: true,
      pendingMigrationCount: 0,
      remoteOnlyVersionCount: 0,
      missingFunctions: [],
      missingTriggers: [],
      missingColumns: [],
      passed: true,
    });
  });

  it('never leaks the connection URL, password, or port on either stream', async () => {
    const result = await runPostflight({
      DATABASE_URL: testPg.connectionString,
    });
    for (const stream of [result.stdout, result.stderr]) {
      expect(stream).not.toContain(testPg.connectionString);
      expect(stream).not.toContain('postgres:postgres');
      expect(stream).not.toContain(`:${testPg.port}`);
    }
  });
});
