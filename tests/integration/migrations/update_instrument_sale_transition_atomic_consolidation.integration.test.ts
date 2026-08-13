/** @jest-environment node */

/**
 * Real-process integration test for
 * supabase/migrations/20260423140001_update_instrument_sale_transition_atomic_consolidated.sql
 * against an isolated local Postgres instance (embedded-postgres — no
 * Docker, no hosted/production database, no mocks).
 *
 * This migration replaces what was originally drafted as a six-file
 * transition (20260423140001 through 20260423140006). Because Supabase
 * applies pending migrations in timestamp order and commits each file to
 * schema_migrations independently, a deploy that stopped partway through
 * that six-file chain could permanently leave an unsafe intermediate state
 * applied (old function revoked-but-not-dropped, or new function created
 * but not yet privilege-locked-down). Folding all six steps into one
 * migration file removes that window: the migration reads the real file
 * from disk and applies it via node-postgres's simple query protocol,
 * which — like Supabase's own migration runner — executes a
 * semicolon-separated multi-statement string as a single implicit
 * transaction, so a failure anywhere in the file rolls back every
 * statement in it.
 *
 * Production's live catalog is known (verified separately, out-of-band of
 * these six migration versions) to already contain the seven-argument
 * function, so this suite proves the migration converges safely from each
 * of the four reachable starting catalog states: old six-argument
 * function only, drifted seven-argument function only, both signatures
 * present, and neither present.
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_FILE = path.join(
  REPO_ROOT,
  'supabase',
  'migrations',
  '20260423140001_update_instrument_sale_transition_atomic_consolidated.sql'
);
const BOOTSTRAP_FILE = path.join(
  REPO_ROOT,
  'scripts',
  'supabase',
  'sale_resale_test_bootstrap.sql'
);
const SALE_ATOMIC_MIGRATIONS = [
  '00000000000013_create_sale_atomic.sql',
  '00000000000016_create_sale_adjustment_atomic.sql',
  '00000000000031_create_sale_atomic_idempotent.sql',
].map(name => path.join(REPO_ROOT, 'supabase', 'migrations', name));

const FN_NAME = 'update_instrument_sale_transition_atomic';

jest.setTimeout(60000);

// Strips psql-only meta-commands (e.g. `\set ON_ERROR_STOP on`) that the
// repo's disposable-bootstrap SQL files use for `psql -f` invocations but
// that node-postgres's plain SQL protocol cannot parse.
function readSql(filePath: string): string {
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('\\'))
    .join('\n');
}

const MIGRATION_SQL = readSql(MIGRATION_FILE);

// Exact pre-transition baseline, matching
// 00000000000037_update_instrument_sale_transition_atomic.sql,
// 00000000000038_..._revoke_public.sql, and
// 00000000000039_..._grant_authenticated.sql combined. Deliberately
// inlined (not read from disk) because those historical files still exist
// under their original filenames/timestamps in supabase/migrations and
// are exercised for real elsewhere; this constant only needs to reproduce
// their net effect as the "old six-argument function" starting state.
const OLD_SIX_ARG_BASELINE_SQL = `
CREATE OR REPLACE FUNCTION public.${FN_NAME}(
  p_instrument_id UUID,
  p_patch         JSONB   DEFAULT '{}'::jsonb,
  p_sale_price    NUMERIC DEFAULT NULL,
  p_sale_date     DATE    DEFAULT NULL,
  p_client_id     UUID    DEFAULT NULL,
  p_sales_note    TEXT    DEFAULT NULL
)
RETURNS public.instruments
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id        UUID := public.org_id();
  v_current       public.instruments%ROWTYPE;
  v_result        public.instruments%ROWTYPE;
  v_next_status   TEXT;
  v_refund_source UUID;
BEGIN
  IF v_org_id IS NULL      THEN RAISE EXCEPTION 'Organization context required'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin role required'; END IF;

  SELECT * INTO v_current FROM public.instruments
  WHERE id = p_instrument_id AND org_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found'; END IF;

  v_next_status := COALESCE(NULLIF(p_patch->>'status', ''), v_current.status);

  IF v_current.status <> 'Sold' AND v_next_status = 'Sold' THEN
    IF p_sale_price IS NULL OR p_sale_price <= 0 THEN
      RAISE EXCEPTION 'Sale price must be a positive number when marking as Sold';
    END IF;
    PERFORM public.create_sale_atomic(
      p_sale_price, COALESCE(p_sale_date, CURRENT_DATE), p_client_id, p_instrument_id, p_sales_note
    );
  END IF;

  UPDATE public.instruments SET
    status = CASE WHEN p_patch ? 'status' THEN NULLIF(p_patch->>'status','') ELSE status END
  WHERE id = p_instrument_id AND org_id = v_org_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.${FN_NAME}(UUID, JSONB, NUMERIC, DATE, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.${FN_NAME}(UUID, JSONB, NUMERIC, DATE, UUID, TEXT) TO authenticated;
`;

// Simulates the verified production catalog drift: the seven-argument
// function already exists (same body/signature the consolidated migration
// installs) despite none of the six original 20260423140001-140006
// migration versions ever having been applied there. Deliberately left
// with dangerous privileges (PUBLIC's implicit default EXECUTE grant
// never revoked, plus an explicit anon grant) to prove the migration's
// unconditional REVOKE statements clean up the worst case, not just the
// case where privileges already happened to be safe.
const DRIFTED_SEVEN_ARG_UNSAFE_SQL = `
CREATE OR REPLACE FUNCTION public.${FN_NAME}(
  p_instrument_id UUID,
  p_patch         JSONB   DEFAULT '{}'::jsonb,
  p_sale_price    NUMERIC DEFAULT NULL,
  p_sale_date     DATE    DEFAULT NULL,
  p_client_id     UUID    DEFAULT NULL,
  p_sales_note    TEXT    DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.instruments
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id  UUID := public.org_id();
  v_current public.instruments%ROWTYPE;
  v_result  public.instruments%ROWTYPE;
BEGIN
  IF v_org_id IS NULL      THEN RAISE EXCEPTION 'Organization context required'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin role required'; END IF;

  SELECT * INTO v_current FROM public.instruments
  WHERE id = p_instrument_id AND org_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found'; END IF;

  UPDATE public.instruments SET
    status = CASE WHEN p_patch ? 'status' THEN NULLIF(p_patch->>'status','') ELSE status END
  WHERE id = p_instrument_id AND org_id = v_org_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.${FN_NAME}(UUID, JSONB, NUMERIC, DATE, UUID, TEXT, TIMESTAMPTZ) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.${FN_NAME}(UUID, JSONB, NUMERIC, DATE, UUID, TEXT, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.${FN_NAME}(UUID, JSONB, NUMERIC, DATE, UUID, TEXT, TIMESTAMPTZ) TO authenticated;
`;

const DROP_BOTH_SIGNATURES_SQL = `
DROP FUNCTION IF EXISTS public.${FN_NAME}(UUID, JSONB, NUMERIC, DATE, UUID, TEXT);
DROP FUNCTION IF EXISTS public.${FN_NAME}(UUID, JSONB, NUMERIC, DATE, UUID, TEXT, TIMESTAMPTZ);
`;

type Precondition =
  | 'old-six-arg-only'
  | 'drifted-seven-arg-only'
  | 'both'
  | 'neither';

async function setPrecondition(
  client: Client,
  state: Precondition
): Promise<void> {
  await client.query(DROP_BOTH_SIGNATURES_SQL);
  if (state === 'old-six-arg-only' || state === 'both') {
    await client.query(OLD_SIX_ARG_BASELINE_SQL);
  }
  if (state === 'drifted-seven-arg-only' || state === 'both') {
    await client.query(DRIFTED_SEVEN_ARG_UNSAFE_SQL);
  }
}

type FunctionRow = { pronargs: number };

async function getFunctionSignatures(client: Client): Promise<FunctionRow[]> {
  const result = await client.query<FunctionRow>(
    `SELECT p.pronargs::int AS pronargs
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = $1
     ORDER BY p.pronargs`,
    [FN_NAME]
  );
  return result.rows;
}

type PrivilegeRow = { grantee: string; privilege_type: string };

async function getPrivileges(client: Client): Promise<PrivilegeRow[]> {
  const result = await client.query<PrivilegeRow>(
    `SELECT grantee, privilege_type
     FROM information_schema.routine_privileges
     WHERE routine_schema = 'public' AND routine_name = $1`,
    [FN_NAME]
  );
  return result.rows;
}

async function assertConvergedSevenArgState(client: Client): Promise<void> {
  const signatures = await getFunctionSignatures(client);
  expect(signatures).toEqual([{ pronargs: 7 }]);

  const privileges = await getPrivileges(client);
  expect(privileges.some(p => p.grantee === 'PUBLIC')).toBe(false);
  expect(privileges.some(p => p.grantee === 'anon')).toBe(false);
  expect(
    privileges.some(
      p => p.grantee === 'authenticated' && p.privilege_type === 'EXECUTE'
    )
  ).toBe(true);
}

describe('20260423140001 update_instrument_sale_transition_atomic consolidation', () => {
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

    // The bootstrap creates `authenticated`/`service_role` but not `anon`
    // (real Supabase-managed Postgres always has all three); the
    // consolidated migration explicitly REVOKEs from `anon`, so the role
    // must exist for that statement to succeed here too.
    await client.query(`
      DO $$
      BEGIN
        CREATE ROLE anon NOLOGIN;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await client.query(readSql(BOOTSTRAP_FILE));
    for (const file of SALE_ATOMIC_MIGRATIONS) {
      await client.query(readSql(file));
    }
  });

  afterAll(async () => {
    await client.end();
  });

  test('migration succeeds from the old 6-arg state and converges to the intended 7-arg signature/privileges', async () => {
    await setPrecondition(client, 'old-six-arg-only');
    await client.query(MIGRATION_SQL);
    await assertConvergedSevenArgState(client);
  });

  test('migration succeeds from the already-7-arg drifted state (including unsafe PUBLIC/anon grants) and converges', async () => {
    await setPrecondition(client, 'drifted-seven-arg-only');
    await client.query(MIGRATION_SQL);
    await assertConvergedSevenArgState(client);
  });

  test('migration succeeds when both signatures are present simultaneously and converges', async () => {
    await setPrecondition(client, 'both');
    await client.query(MIGRATION_SQL);
    await assertConvergedSevenArgState(client);
  });

  test('migration succeeds from a database with neither signature present and converges', async () => {
    await setPrecondition(client, 'neither');
    await client.query(MIGRATION_SQL);
    await assertConvergedSevenArgState(client);
  });

  test('a failure inside the migration transaction cannot expose an intermediate missing-function or PUBLIC/anon-executable state, starting from empty', async () => {
    await setPrecondition(client, 'neither');

    const faultySql = `${MIGRATION_SQL}\n-- deliberate fault injection\nSELECT 1/0;\n`;
    await expect(client.query(faultySql)).rejects.toThrow(/division by zero/i);

    // Zero partial application: the failed batch must leave the database
    // exactly as it was before the batch ran, proving no intermediate
    // state (created-but-not-yet-locked-down function, etc.) was ever
    // durably visible.
    const signatures = await getFunctionSignatures(client);
    expect(signatures).toEqual([]);
  });

  test('a failure inside the migration transaction cannot expose an intermediate missing-function or PUBLIC/anon-executable state, starting from the old 6-arg function', async () => {
    await setPrecondition(client, 'old-six-arg-only');

    const faultySql = `${MIGRATION_SQL}\n-- deliberate fault injection\nSELECT 1/0;\n`;
    await expect(client.query(faultySql)).rejects.toThrow(/division by zero/i);

    // The old 6-arg function must survive completely untouched -- not
    // dropped, not replaced, and not re-privileged -- and the new 7-arg
    // function must not have been left half-created.
    const signatures = await getFunctionSignatures(client);
    expect(signatures).toEqual([{ pronargs: 6 }]);

    const privileges = await getPrivileges(client);
    expect(privileges.some(p => p.grantee === 'PUBLIC')).toBe(false);
    expect(
      privileges.some(
        p => p.grantee === 'authenticated' && p.privilege_type === 'EXECUTE'
      )
    ).toBe(true);
  });
});
