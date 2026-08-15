/** @jest-environment node */

/**
 * Real-process integration test for
 * supabase/migrations/20260814170000_update_invoice_atomic_idempotency_concurrency.sql
 * against an isolated local Postgres instance (embedded-postgres — no
 * Docker, no hosted/production database, no mocks), mirroring
 * update_instrument_sale_transition_atomic_consolidation.integration.test.ts's
 * approach for the equivalent instrument RPC.
 *
 * Findings closed: V5-002 (PUT /api/invoices/[id] requires an
 * Idempotency-Key the client never sent) and V5-003 (once V5-002 is fixed,
 * the update path has no concurrency protection and becomes a last-write-wins
 * overwrite path). Both ship together: this suite proves the CAS check
 * (public.update_invoice_atomic's new p_expected_updated_at argument) and the
 * idempotent-retry wrapper (public.update_invoice_atomic_idempotent) as one
 * unit, plus that the migration cannot leave the pre-fix three-argument,
 * no-concurrency-check overload reachable.
 *
 * The suite builds the real pre-PR13 baseline by applying the actual
 * historical migrations (00000000000025-27, 20260801200000-200002) before
 * applying 20260814170000, rather than hand-writing an approximation of that
 * baseline — so "the migration converges correctly" is checked against the
 * repository's real history, not a stand-in that could drift from it.
 */
import fs from 'fs';
import path from 'path';
import { Client, types } from 'pg';

// node-postgres's default timestamptz parser converts to a JS Date, which
// only carries millisecond precision. Postgres's own clock_timestamp() (used
// by this schema's updated_at trigger) has microsecond precision, and real
// clients (Supabase's PostgREST responses, this app's Invoice.updated_at:
// string type) treat updated_at as an opaque ISO string end to end -- it is
// never parsed into a Date and re-serialized anywhere in the actual
// client/server round trip. Disabling the Date conversion here (OID 1184 =
// timestamptz) makes this suite's CAS token round-trip match that real
// string-preserving path instead of silently truncating precision the way a
// naive `new Date(...)`-based test harness would.
types.setTypeParser(1184, (value: string) => value);

const REPO_ROOT = path.resolve(__dirname, '../../..');
const migrationPath = (name: string) =>
  path.join(REPO_ROOT, 'supabase', 'migrations', name);

const BOOTSTRAP_FILE = path.join(
  REPO_ROOT,
  'scripts',
  'supabase',
  'invoice_update_test_bootstrap.sql'
);

const PRE_PR13_BASELINE_MIGRATIONS = [
  '00000000000025_update_invoice_atomic.sql',
  '00000000000026_update_invoice_atomic_revoke_public.sql',
  '00000000000027_update_invoice_atomic_grant_authenticated.sql',
  '20260801200000_enforce_invoice_financial_invariants.sql',
  '20260801200001_assert_invoice_financial_invariants_revoke_public.sql',
  '20260801200002_assert_invoice_financial_invariants_grant_authenticated.sql',
].map(migrationPath);

const PR13_MIGRATION_FILE = migrationPath(
  '20260814170000_update_invoice_atomic_idempotency_concurrency.sql'
);

const UPDATE_FN = 'update_invoice_atomic';
const IDEMPOTENT_FN = 'update_invoice_atomic_idempotent';

jest.setTimeout(60000);

// Strips psql-only meta-commands (`\set ON_ERROR_STOP on`) that node-postgres's
// plain SQL protocol cannot parse — same helper as the sale-transition suite.
function readSql(filePath: string): string {
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('\\'))
    .join('\n');
}

const BOOTSTRAP_SQL = readSql(BOOTSTRAP_FILE);
const BASELINE_SQL = PRE_PR13_BASELINE_MIGRATIONS.map(readSql).join('\n');
const PR13_MIGRATION_SQL = readSql(PR13_MIGRATION_FILE);

const ORG_A = 'a0000000-0000-4000-8000-000000000001';
const ORG_B = 'b0000000-0000-4000-8000-000000000002';
const ADMIN_USER = '11111111-1111-4111-8111-111111111111';

async function setJwt(
  client: Client,
  orgId: string,
  role: 'admin' | 'member',
  userId: string = ADMIN_USER
): Promise<void> {
  await client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({
      sub: userId,
      role: 'authenticated',
      app_metadata: { org_id: orgId, role },
    }),
  ]);
}

async function getFunctionSignatures(
  client: Client,
  fnName: string
): Promise<number[]> {
  const result = await client.query<{ pronargs: number }>(
    `SELECT p.pronargs::int AS pronargs
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = $1
     ORDER BY p.pronargs`,
    [fnName]
  );
  return result.rows.map(r => r.pronargs);
}

async function getPrivileges(
  client: Client,
  fnName: string
): Promise<{ grantee: string; privilege_type: string }[]> {
  const result = await client.query<{
    grantee: string;
    privilege_type: string;
  }>(
    `SELECT grantee, privilege_type
     FROM information_schema.routine_privileges
     WHERE routine_schema = 'public' AND routine_name = $1`,
    [fnName]
  );
  return result.rows;
}

describe('20260814170000 update_invoice_atomic idempotency + concurrency', () => {
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

    await client.query(BOOTSTRAP_SQL);
    await client.query(
      `INSERT INTO public.organizations (id, name) VALUES
         ('${ORG_A}', 'Org A'),
         ('${ORG_B}', 'Org B')
       ON CONFLICT (id) DO NOTHING`
    );
  });

  afterAll(async () => {
    await client.end();
  });

  describe('pre-PR13 baseline fidelity', () => {
    it('the real historical migrations produce exactly the frozen 3-arg, no-CAS signature', async () => {
      await client.query(BASELINE_SQL);
      const signatures = await getFunctionSignatures(client, UPDATE_FN);
      expect(signatures).toEqual([3]);
    });
  });

  describe('migration structural convergence', () => {
    beforeAll(async () => {
      await client.query(PR13_MIGRATION_SQL);
    });

    it('drops the unsafe 3-arg overload and leaves only the 4-arg CAS-capable signature', async () => {
      const signatures = await getFunctionSignatures(client, UPDATE_FN);
      expect(signatures).toEqual([4]);
    });

    it('creates the 7-arg idempotent wrapper', async () => {
      const signatures = await getFunctionSignatures(client, IDEMPOTENT_FN);
      expect(signatures).toEqual([7]);
    });

    it('locks down privileges on both functions: no PUBLIC/anon, authenticated only', async () => {
      for (const fn of [UPDATE_FN, IDEMPOTENT_FN]) {
        const privileges = await getPrivileges(client, fn);
        expect(privileges.some(p => p.grantee === 'PUBLIC')).toBe(false);
        expect(privileges.some(p => p.grantee === 'anon')).toBe(false);
        expect(
          privileges.some(
            p => p.grantee === 'authenticated' && p.privilege_type === 'EXECUTE'
          )
        ).toBe(true);
      }
    });

    it('re-applying the migration is safe and converges to the same state', async () => {
      await client.query(PR13_MIGRATION_SQL);
      expect(await getFunctionSignatures(client, UPDATE_FN)).toEqual([4]);
      expect(await getFunctionSignatures(client, IDEMPOTENT_FN)).toEqual([7]);
    });
  });

  describe('migration transaction atomicity', () => {
    it('a fault injected into the migration leaves the pre-PR13 baseline completely untouched', async () => {
      // Reset to a clean pre-PR13 slate: the previous describe block leaves
      // the 4-arg/7-arg functions in place, and CREATE OR REPLACE in
      // BASELINE_SQL only touches the 3-arg overload, so both would
      // otherwise coexist here.
      await client.query(`
        DROP FUNCTION IF EXISTS public.update_invoice_atomic(UUID, JSONB, JSONB, TIMESTAMPTZ);
        DROP FUNCTION IF EXISTS public.update_invoice_atomic_idempotent(TEXT, TEXT, TEXT, UUID, JSONB, JSONB, TIMESTAMPTZ);
      `);
      await client.query(BASELINE_SQL);
      expect(await getFunctionSignatures(client, UPDATE_FN)).toEqual([3]);

      const faultySql = `${PR13_MIGRATION_SQL}\n-- deliberate fault injection\nSELECT 1/0;\n`;
      await expect(client.query(faultySql)).rejects.toThrow(
        /division by zero/i
      );

      // No intermediate state: the 3-arg function must survive completely
      // untouched (not dropped) and the 4-arg/7-arg functions must not have
      // been left half-created.
      expect(await getFunctionSignatures(client, UPDATE_FN)).toEqual([3]);
      expect(await getFunctionSignatures(client, IDEMPOTENT_FN)).toEqual([]);

      // Restore forward state for the behavioral tests below.
      await client.query(PR13_MIGRATION_SQL);
    });
  });

  describe('behavioral: CAS + idempotency (as the supported PUT /api/invoices/[id] admin path)', () => {
    async function insertInvoice(overrides: {
      orgId: string;
      subtotal?: number;
      tax?: number | null;
      total?: number;
      status?: string;
    }): Promise<{ id: string; updatedAt: string }> {
      // F2 (assert_invoice_financial_invariants) requires subtotal to equal
      // the sum of item amounts, so a fixture with no items must default to
      // 0/0/0 -- a non-zero subtotal on an item-less invoice already
      // violates the invariant before any update RPC even runs.
      const subtotal = overrides.subtotal ?? 0;
      const tax = overrides.tax === undefined ? 0 : overrides.tax;
      const total = overrides.total ?? subtotal + (tax ?? 0);
      const status = overrides.status ?? 'draft';

      const result = await client.query<{ id: string; updated_at: string }>(
        `INSERT INTO public.invoices (org_id, subtotal, tax, total, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, updated_at`,
        [overrides.orgId, subtotal, tax, total, status]
      );
      return { id: result.rows[0].id, updatedAt: result.rows[0].updated_at };
    }

    async function getInvoice(id: string) {
      const result = await client.query(
        `SELECT status, subtotal, tax, total, notes, updated_at
         FROM public.invoices WHERE id = $1`,
        [id]
      );
      return result.rows[0];
    }

    async function callUpdate(args: {
      routeKey?: string;
      idempotencyKey: string;
      requestHash: string;
      invoiceId: string;
      invoice?: Record<string, unknown>;
      items?: unknown;
      expectedUpdatedAt?: string | null;
    }) {
      return client.query(
        `SELECT public.update_invoice_atomic_idempotent(
           $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::timestamptz
         ) AS invoice_id`,
        [
          args.routeKey ?? 'PUT:/api/invoices/:id',
          args.idempotencyKey,
          args.requestHash,
          args.invoiceId,
          JSON.stringify(args.invoice ?? {}),
          args.items === undefined ? null : JSON.stringify(args.items),
          args.expectedUpdatedAt ?? null,
        ]
      );
    }

    it('current-version update succeeds and advances updated_at', async () => {
      await setJwt(client, ORG_A, 'admin');
      const invoice = await insertInvoice({ orgId: ORG_A });

      const res = await callUpdate({
        idempotencyKey: 'k-current-1',
        requestHash: 'h-current-1',
        invoiceId: invoice.id,
        invoice: { notes: 'updated notes' },
        expectedUpdatedAt: invoice.updatedAt,
      });

      expect(res.rows[0].invoice_id).toBe(invoice.id);
      const after = await getInvoice(invoice.id);
      expect(after.notes).toBe('updated notes');
      // String comparison, not Date arithmetic: the real CAS token is an
      // opaque microsecond-precision string end to end (see the
      // types.setTypeParser note above), and clock_timestamp() calls this
      // close together can land in the same JS-Date millisecond even though
      // the underlying Postgres values differ.
      expect(after.updated_at).not.toEqual(invoice.updatedAt);
    });

    it('stale expected_updated_at is rejected with INVOICE_CONCURRENCY_CONFLICT and mutates nothing', async () => {
      await setJwt(client, ORG_A, 'admin');
      const invoice = await insertInvoice({ orgId: ORG_A, status: 'draft' });

      // Advance the row once so the id we captured is now stale.
      await client.query(
        `UPDATE public.invoices SET notes = 'first' WHERE id = $1`,
        [invoice.id]
      );
      const afterFirst = await getInvoice(invoice.id);

      await expect(
        callUpdate({
          idempotencyKey: 'k-stale-1',
          requestHash: 'h-stale-1',
          invoiceId: invoice.id,
          invoice: { notes: 'stale overwrite attempt' },
          expectedUpdatedAt: invoice.updatedAt, // pre-advance token
        })
      ).rejects.toThrow(/INVOICE_CONCURRENCY_CONFLICT/);

      const after = await getInvoice(invoice.id);
      expect(after.notes).toBe('first');
      expect(after.updated_at).toEqual(afterFirst.updated_at);
    });

    it('two different fields: a rejected stale update never overwrites a field the stale caller did not intend to touch', async () => {
      await setJwt(client, ORG_A, 'admin');
      const invoice = await insertInvoice({ orgId: ORG_A });
      const t0 = invoice.updatedAt;

      // "B" changes due_date and saves from T0.
      await client.query(
        `SELECT public.update_invoice_atomic($1, $2::jsonb, NULL, $3::timestamptz)`,
        [invoice.id, JSON.stringify({ due_date: '2026-05-01' }), t0]
      );
      const afterB = await getInvoice(invoice.id);
      expect(afterB.updated_at).not.toEqual(t0);

      // "A" still holds T0 and tries to change notes.
      await expect(
        callUpdate({
          idempotencyKey: 'k-two-fields-1',
          requestHash: 'h-two-fields-1',
          invoiceId: invoice.id,
          invoice: { notes: 'A stale notes edit' },
          expectedUpdatedAt: t0,
        })
      ).rejects.toThrow(/INVOICE_CONCURRENCY_CONFLICT/);

      const finalRow = await client.query(
        `SELECT due_date::text AS due_date, notes FROM public.invoices WHERE id = $1`,
        [invoice.id]
      );
      expect(finalRow.rows[0].due_date).toBe('2026-05-01');
      expect(finalRow.rows[0].notes).toBeNull();
    });

    it("item collection: a rejected stale header-only update never replaces B's already-saved items", async () => {
      await setJwt(client, ORG_A, 'admin');
      const invoice = await insertInvoice({
        orgId: ORG_A,
        subtotal: 0,
        total: 0,
      });
      const t0 = invoice.updatedAt;

      // "B" replaces the item list and saves from T0.
      const newItems = [
        {
          description: 'Bow rehair',
          qty: 1,
          rate: 50,
          amount: 50,
        },
      ];
      await client.query(
        `SELECT public.update_invoice_atomic($1, $2::jsonb, $3::jsonb, $4::timestamptz)`,
        [
          invoice.id,
          JSON.stringify({ subtotal: 50, total: 50 }),
          JSON.stringify(newItems),
          t0,
        ]
      );
      const t1 = (await getInvoice(invoice.id)).updated_at;

      // "A" still holds T0 and tries an unrelated header-only change.
      await expect(
        callUpdate({
          idempotencyKey: 'k-items-1',
          requestHash: 'h-items-1',
          invoiceId: invoice.id,
          invoice: { notes: 'A stale header edit' },
          expectedUpdatedAt: t0,
        })
      ).rejects.toThrow(/INVOICE_CONCURRENCY_CONFLICT/);

      const items = await client.query(
        `SELECT description, qty, rate, amount FROM public.invoice_items WHERE invoice_id = $1`,
        [invoice.id]
      );
      expect(items.rows).toHaveLength(1);
      expect(items.rows[0].description).toBe('Bow rehair');

      const finalRow = await client.query(
        `SELECT updated_at FROM public.invoices WHERE id = $1`,
        [invoice.id]
      );
      expect(finalRow.rows[0].updated_at).toEqual(t1);
    });

    it('idempotent retry after a successful-but-lost response replays the result without a second mutation', async () => {
      await setJwt(client, ORG_A, 'admin');
      const invoice = await insertInvoice({ orgId: ORG_A });

      const args = {
        idempotencyKey: 'k-replay-1',
        requestHash: 'h-replay-1',
        invoiceId: invoice.id,
        invoice: { notes: 'first attempt' },
        expectedUpdatedAt: invoice.updatedAt,
      };

      const first = await callUpdate(args);
      const afterFirst = await getInvoice(invoice.id);

      // Retry: identical key, identical hash, identical (now-stale) expected
      // version. Must replay -- not re-run the CAS check against the row
      // the first attempt already advanced.
      const second = await callUpdate(args);
      const afterSecond = await getInvoice(invoice.id);

      expect(second.rows[0].invoice_id).toBe(first.rows[0].invoice_id);
      expect(afterSecond.updated_at).toEqual(afterFirst.updated_at);
      expect(afterSecond.notes).toBe('first attempt');
    });

    it('a new logical operation with a new key succeeds against the latest version after a prior success', async () => {
      await setJwt(client, ORG_A, 'admin');
      const invoice = await insertInvoice({ orgId: ORG_A });

      await callUpdate({
        idempotencyKey: 'k-seq-1',
        requestHash: 'h-seq-1',
        invoiceId: invoice.id,
        invoice: { notes: 'first save' },
        expectedUpdatedAt: invoice.updatedAt,
      });
      const afterFirst = await getInvoice(invoice.id);

      const second = await callUpdate({
        idempotencyKey: 'k-seq-2',
        requestHash: 'h-seq-2',
        invoiceId: invoice.id,
        invoice: { notes: 'second save' },
        expectedUpdatedAt: afterFirst.updated_at,
      });

      expect(second.rows[0].invoice_id).toBe(invoice.id);
      const afterSecond = await getInvoice(invoice.id);
      expect(afterSecond.notes).toBe('second save');
    });

    it('reused key with a different request hash is rejected and mutates nothing', async () => {
      await setJwt(client, ORG_A, 'admin');
      const invoice = await insertInvoice({ orgId: ORG_A });

      await callUpdate({
        idempotencyKey: 'k-reuse-1',
        requestHash: 'h-reuse-1',
        invoiceId: invoice.id,
        invoice: { notes: 'original payload' },
        expectedUpdatedAt: invoice.updatedAt,
      });
      const afterFirst = await getInvoice(invoice.id);

      await expect(
        callUpdate({
          idempotencyKey: 'k-reuse-1',
          requestHash: 'h-reuse-DIFFERENT',
          invoiceId: invoice.id,
          invoice: { notes: 'different payload under same key' },
          expectedUpdatedAt: afterFirst.updated_at,
        })
      ).rejects.toThrow(/IDEMPOTENCY_KEY_REUSED/);

      const after = await getInvoice(invoice.id);
      expect(after.notes).toBe('original payload');
      expect(after.updated_at).toEqual(afterFirst.updated_at);
    });

    it('a concurrent in-progress reservation under the same key blocks a second caller without deleting the first reservation', async () => {
      await setJwt(client, ORG_A, 'admin');
      const invoice = await insertInvoice({ orgId: ORG_A });

      // Simulate a concurrent, still in-flight first call: it already won
      // the reservation row but has not committed a result yet
      // (invoice_id IS NULL).
      await client.query(
        `INSERT INTO public.invoice_idempotency_keys
           (org_id, user_id, route_key, idempotency_key, request_hash)
         VALUES ($1, $2, 'PUT:/api/invoices/:id', 'k-inflight-1', 'h-inflight-1')`,
        [ORG_A, ADMIN_USER]
      );

      await expect(
        callUpdate({
          idempotencyKey: 'k-inflight-1',
          requestHash: 'h-inflight-1',
          invoiceId: invoice.id,
          invoice: { notes: 'second caller' },
          expectedUpdatedAt: invoice.updatedAt,
        })
      ).rejects.toThrow(/IDEMPOTENCY_IN_PROGRESS/);

      // The first caller's reservation must survive -- this failed call did
      // not win it and must not delete someone else's claim.
      const reservation = await client.query(
        `SELECT invoice_id FROM public.invoice_idempotency_keys
         WHERE org_id = $1 AND route_key = 'PUT:/api/invoices/:id' AND idempotency_key = 'k-inflight-1'`,
        [ORG_A]
      );
      expect(reservation.rows).toHaveLength(1);
      expect(reservation.rows[0].invoice_id).toBeNull();

      const after = await getInvoice(invoice.id);
      expect(after.notes).toBeNull();
    });

    it('a failed attempt (CAS conflict) releases its own reservation so a legitimate retry under the same key can proceed', async () => {
      await setJwt(client, ORG_A, 'admin');
      const invoice = await insertInvoice({ orgId: ORG_A });

      // Advance the row so the captured version is stale.
      await client.query(
        `UPDATE public.invoices SET notes = 'advanced' WHERE id = $1`,
        [invoice.id]
      );

      await expect(
        callUpdate({
          idempotencyKey: 'k-release-1',
          requestHash: 'h-release-1',
          invoiceId: invoice.id,
          invoice: { notes: 'stale attempt' },
          expectedUpdatedAt: invoice.updatedAt,
        })
      ).rejects.toThrow(/INVOICE_CONCURRENCY_CONFLICT/);

      // The failed reservation must not linger.
      const reservation = await client.query(
        `SELECT 1 FROM public.invoice_idempotency_keys
         WHERE org_id = $1 AND route_key = 'PUT:/api/invoices/:id' AND idempotency_key = 'k-release-1'`,
        [ORG_A]
      );
      expect(reservation.rows).toHaveLength(0);

      // A legitimate retry under the same key, now with the current
      // version and a fresh hash, must succeed rather than being
      // permanently blocked by the earlier failure.
      const current = await getInvoice(invoice.id);
      const retry = await callUpdate({
        idempotencyKey: 'k-release-1',
        requestHash: 'h-release-1-retry',
        invoiceId: invoice.id,
        invoice: { notes: 'reconciled attempt' },
        expectedUpdatedAt: current.updated_at,
      });
      expect(retry.rows[0].invoice_id).toBe(invoice.id);
      const after = await getInvoice(invoice.id);
      expect(after.notes).toBe('reconciled attempt');
    });

    it('distinguishes not-found from a version conflict: a nonexistent invoice raises a different error than a stale one', async () => {
      await setJwt(client, ORG_A, 'admin');

      await expect(
        callUpdate({
          idempotencyKey: 'k-notfound-1',
          requestHash: 'h-notfound-1',
          invoiceId: '00000000-0000-4000-8000-000000000099',
          invoice: { notes: 'x' },
          expectedUpdatedAt: new Date().toISOString(),
        })
      ).rejects.toThrow(/Invoice not found/);
    });

    it('cross-org: an org A caller cannot update an org B invoice (scoped not-found, not a cross-org conflict oracle)', async () => {
      await setJwt(client, ORG_B, 'admin');
      const orgBInvoice = await insertInvoice({ orgId: ORG_B });

      await setJwt(client, ORG_A, 'admin');
      await expect(
        callUpdate({
          idempotencyKey: 'k-crossorg-1',
          requestHash: 'h-crossorg-1',
          invoiceId: orgBInvoice.id,
          invoice: { notes: 'cross-org attempt' },
          expectedUpdatedAt: orgBInvoice.updatedAt,
        })
      ).rejects.toThrow(/Invoice not found/);

      await setJwt(client, ORG_B, 'admin');
      const after = await getInvoice(orgBInvoice.id);
      expect(after.notes).toBeNull();
    });

    it('F2 financial invariants are still enforced through the new wrapper (regression)', async () => {
      await setJwt(client, ORG_A, 'admin');
      const invoice = await insertInvoice({ orgId: ORG_A }); // valid: subtotal 0, no items

      await expect(
        callUpdate({
          idempotencyKey: 'k-invariant-1',
          requestHash: 'h-invariant-1',
          invoiceId: invoice.id,
          invoice: { subtotal: 999 }, // no items => computed subtotal stays 0
          expectedUpdatedAt: invoice.updatedAt,
        })
      ).rejects.toThrow(/INVOICE_SUBTOTAL_MISMATCH/);

      const after = await getInvoice(invoice.id);
      expect(Number(after.subtotal)).toBe(0);
    });
  });
});
