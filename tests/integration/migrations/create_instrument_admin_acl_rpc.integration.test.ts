/** @jest-environment node */

/**
 * Applies the financial-confidentiality boundary and its focused creation-RPC
 * remediation to an isolated embedded Postgres process. No hosted database is
 * contacted.
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const REPO_ROOT = path.resolve(__dirname, '../../..');

function readSql(...segments: string[]): string {
  return fs
    .readFileSync(path.join(REPO_ROOT, ...segments), 'utf8')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('\\'))
    .join('\n');
}

const BOOTSTRAP_SQL = readSql(
  'scripts',
  'supabase',
  'financial_confidentiality_test_bootstrap.sql'
);
const SALE_LIFECYCLE_SQL = readSql(
  'supabase',
  'migrations',
  '20260804020000_harden_sale_lifecycle_authorization.sql'
);
const FINANCIAL_BOUNDARY_SQL = readSql(
  'supabase',
  'migrations',
  '20260814160000_enforce_financial_confidentiality_db_boundary.sql'
);
const CREATE_RPC_SQL = readSql(
  'supabase',
  'migrations',
  '20260825151655_create_instrument_admin_acl_rpc.sql'
);

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const ADMIN_A = '11111111-1111-4111-8111-111111111111';
const MEMBER_A = '22222222-2222-4222-8222-222222222222';

jest.setTimeout(60000);

describe('create_instrument_admin ACL remediation migration', () => {
  let client: Client;

  async function setAuthenticatedContext(
    userId: string,
    orgId: string,
    role: 'admin' | 'member'
  ): Promise<void> {
    await client.query(
      `SELECT set_config(
         'request.jwt.claims',
         json_build_object(
           'sub', $1::text,
           'role', 'authenticated',
           'app_metadata', json_build_object('org_id', $2::text, 'role', $3::text)
         )::text,
         false
       )`,
      [userId, orgId, role]
    );
    await client.query('SET ROLE authenticated');
    await client.query('SET row_security = on');
  }

  async function resetRole(): Promise<void> {
    await client.query('RESET ROLE');
    await client.query('RESET row_security');
  }

  beforeAll(async () => {
    const connectionString = process.env.TEST_MIGRATION_POSTGRES_URL;
    if (!connectionString) {
      throw new Error(
        'TEST_MIGRATION_POSTGRES_URL is not set. Run through the repository migration-test script.'
      );
    }

    client = new Client({ connectionString });
    await client.connect();
    await client.query(BOOTSTRAP_SQL);
    await client.query(SALE_LIFECYCLE_SQL);
    await client.query(FINANCIAL_BOUNDARY_SQL);
    await client.query(CREATE_RPC_SQL);
    await client.query(
      `INSERT INTO public.organizations (id, name)
       VALUES ($1, 'Org A'), ($2, 'Org B')`,
      [ORG_A, ORG_B]
    );
  });

  afterAll(async () => {
    await resetRole();
    await client.end();
  });

  test('function is SECURITY DEFINER with fixed search_path and authenticated-only EXECUTE', async () => {
    const result = await client.query<{
      security_definer: boolean;
      config: string[] | null;
      args: string;
      public_execute: boolean;
      anon_execute: boolean;
      authenticated_execute: boolean;
    }>(
      `SELECT
         p.prosecdef AS security_definer,
         p.proconfig AS config,
         pg_get_function_identity_arguments(p.oid) AS args,
         EXISTS (
           SELECT 1
           FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
           WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
         ) AS public_execute,
         has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'create_instrument_admin'`
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        security_definer: true,
        public_execute: false,
        anon_execute: false,
        authenticated_execute: true,
      })
    );
    expect(result.rows[0].config).toContain('search_path=public, pg_temp');
    expect(result.rows[0].args).not.toContain('org_id');
  });

  test('admin creates a tenant-scoped instrument including financial fields', async () => {
    try {
      await setAuthenticatedContext(ADMIN_A, ORG_A, 'admin');
      const result = await client.query<{ created: Record<string, unknown> }>(
        `SELECT public.create_instrument_admin(
           p_type => 'Violin',
           p_maker => 'Guarneri',
           p_cost_price => 1250.50,
           p_consignment_price => 475.25,
           p_price => 3100,
           p_serial_number => 'VI0000001'
         ) AS created`
      );

      expect(result.rows[0].created).toEqual(
        expect.objectContaining({
          org_id: ORG_A,
          type: 'Violin',
          maker: 'Guarneri',
          cost_price: 1250.5,
          consignment_price: 475.25,
          serial_number: 'VI0000001',
        })
      );
    } finally {
      await resetRole();
    }

    const stored = await client.query<{
      org_id: string;
      cost_price: string;
      consignment_price: string;
    }>(
      `SELECT org_id, cost_price, consignment_price
       FROM public.instruments
       WHERE serial_number = 'VI0000001'`
    );
    expect(stored.rows).toEqual([
      {
        org_id: ORG_A,
        cost_price: '1250.50',
        consignment_price: '475.25',
      },
    ]);
  });

  test('member direct RPC creation is denied with 42501', async () => {
    try {
      await setAuthenticatedContext(MEMBER_A, ORG_A, 'member');
      await expect(
        client.query(
          `SELECT public.create_instrument_admin(
             p_type => 'Cello',
             p_serial_number => 'CE-MEMBER-DENIED'
           )`
        )
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await resetRole();
    }
  });

  test('cross-org creation is impossible and invalid org context fails closed', async () => {
    try {
      await setAuthenticatedContext(ADMIN_A, ORG_A, 'admin');
      await client.query(
        `SELECT public.create_instrument_admin(
           p_type => 'Viola',
           p_serial_number => 'VA-ORG-A'
         )`
      );
    } finally {
      await resetRole();
    }

    const scoped = await client.query<{ org_id: string }>(
      `SELECT org_id FROM public.instruments WHERE serial_number = 'VA-ORG-A'`
    );
    expect(scoped.rows).toEqual([{ org_id: ORG_A }]);
    expect(scoped.rows[0].org_id).not.toBe(ORG_B);

    try {
      await setAuthenticatedContext(
        ADMIN_A,
        'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
        'admin'
      );
      await expect(
        client.query(
          `SELECT public.create_instrument_admin(
             p_type => 'Bass',
             p_serial_number => 'BA-NO-ORG'
           )`
        )
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await resetRole();
    }
  });

  test('base-table financial reads stay denied while safe-column reads work', async () => {
    const privilege = await client.query<{
      table_select: boolean;
      cost_select: boolean;
      consignment_select: boolean;
      safe_select: boolean;
    }>(
      `SELECT
         has_table_privilege('authenticated', 'public.instruments', 'SELECT') AS table_select,
         has_column_privilege('authenticated', 'public.instruments', 'cost_price', 'SELECT') AS cost_select,
         has_column_privilege('authenticated', 'public.instruments', 'consignment_price', 'SELECT') AS consignment_select,
         has_column_privilege('authenticated', 'public.instruments', 'maker', 'SELECT') AS safe_select`
    );
    expect(privilege.rows[0]).toEqual({
      table_select: false,
      cost_select: false,
      consignment_select: false,
      safe_select: true,
    });

    try {
      await setAuthenticatedContext(MEMBER_A, ORG_A, 'member');
      await expect(
        client.query(
          `SELECT cost_price, consignment_price
           FROM public.instruments
           WHERE serial_number = 'VI0000001'`
        )
      ).rejects.toMatchObject({ code: '42501' });

      const safe = await client.query(
        `SELECT id, maker, type, price, serial_number, status
         FROM public.instruments
         WHERE serial_number = 'VI0000001'`
      );
      expect(safe.rows).toHaveLength(1);

      const financials = await client.query(
        `SELECT *
         FROM public.get_instruments_financials(
           ARRAY[(SELECT id FROM public.instruments WHERE serial_number = 'VI0000001')]
         )`
      );
      expect(financials.rows).toHaveLength(0);
    } finally {
      await resetRole();
    }
  });
});
