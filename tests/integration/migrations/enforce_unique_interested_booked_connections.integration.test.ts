/** @jest-environment node */

/**
 * Real-process integration test for
 * supabase/migrations/20260815120000_enforce_unique_interested_booked_connections.sql
 * against an isolated local Postgres instance (embedded-postgres — no
 * Docker, no hosted/production database, no mocks).
 *
 * Applies the current tracked migration chain (minus platform-only cron /
 * vault jobs that cannot run outside Supabase) plus disposable auth/storage
 * stubs that real Supabase-managed Postgres would already provide.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');
const NEW_MIGRATION =
  '20260815120000_enforce_unique_interested_booked_connections.sql';
const SKIP_MIGRATIONS = new Set([
  // Requires pg_cron, pg_net, and vault secrets that disposable Postgres
  // does not ship. Unrelated to client_instruments uniqueness.
  '20260608000002_orphan_cleanup_cron.sql',
]);
const TEMPLATE_DB = 'hcvb_pr07_template';
const INDEX_NAME = 'client_instruments_unique_interested_booked_per_pair';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const CLIENT_A = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const CLIENT_B = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const INSTRUMENT_X = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const INSTRUMENT_Y = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
const USER_A = '99999999-9999-4999-8999-999999999999';

jest.setTimeout(300000);

function readSql(filePath: string): string {
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('\\'))
    .join('\n');
}

function listTrackedMigrationFiles(includeNew: boolean): string[] {
  const listed = execFileSync(
    'git',
    ['ls-files', '--', 'supabase/migrations'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    .filter(rel => rel.endsWith('.sql'))
    .map(rel => path.basename(rel));

  const names = new Set(listed);
  if (includeNew) {
    names.add(NEW_MIGRATION);
  } else {
    names.delete(NEW_MIGRATION);
  }

  return [...names]
    .filter(name => /^\d{14}_.+\.sql$/.test(name) && !SKIP_MIGRATIONS.has(name))
    .sort();
}

const PLATFORM_STUB_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE ROLE service_role NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

CREATE TABLE IF NOT EXISTS auth.users (
  instance_id uuid,
  id uuid PRIMARY KEY,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  confirmation_token text,
  email_change text,
  email_change_token_new text,
  recovery_token text
);

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text,
  public boolean
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text,
  name text
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT string_to_array(name, '/')
$$;
`;

function quoteIdent(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`Refusing to use non-identifier database name: ${value}`);
  }
  return value;
}

function adminUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = '/postgres';
  return url.toString();
}

function dbUrl(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function applySql(client: Client, sql: string, label: string) {
  try {
    await client.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed applying ${label}: ${message}`);
  }
}

async function applyMigrationFiles(client: Client, includeNew: boolean) {
  for (const filename of listTrackedMigrationFiles(includeNew)) {
    const filePath = path.join(MIGRATIONS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Tracked migration is missing on disk: ${filename}`);
    }
    await applySql(client, readSql(filePath), filename);
  }
}

async function terminateDb(admin: Client, database: string) {
  await admin.query(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [database]
  );
}

async function dropDatabase(admin: Client, database: string) {
  await terminateDb(admin, database);
  await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(database)}`);
}

async function createDatabase(
  admin: Client,
  database: string,
  template?: string
) {
  await dropDatabase(admin, database);
  if (template) {
    await terminateDb(admin, template);
    await admin.query(
      `CREATE DATABASE ${quoteIdent(database)} TEMPLATE ${quoteIdent(template)}`
    );
    return;
  }
  await admin.query(`CREATE DATABASE ${quoteIdent(database)}`);
}

async function seedCore(client: Client) {
  await client.query(
    `INSERT INTO public.organizations (id, name)
     VALUES ($1, 'PR-07 Org A')`,
    [ORG_A]
  );
  await client.query(
    `INSERT INTO public.clients (id, org_id, name, first_name, last_name)
     VALUES
       ($1, $3, 'Client A', 'Client', 'A'),
       ($2, $3, 'Client B', 'Client', 'B')`,
    [CLIENT_A, CLIENT_B, ORG_A]
  );
  await client.query(
    `INSERT INTO public.instruments (id, org_id, type, status)
     VALUES
       ($1, $3, 'Violin', 'Available'),
       ($2, $3, 'Violin', 'Available')`,
    [INSTRUMENT_X, INSTRUMENT_Y, ORG_A]
  );
}

async function setAdminJwt(client: Client) {
  await client.query('SELECT set_config($1, $2, false)', [
    'request.jwt.claims',
    JSON.stringify({
      sub: USER_A,
      role: 'authenticated',
      app_metadata: { org_id: ORG_A, role: 'admin' },
    }),
  ]);
}

async function insertRelationship(
  client: Client,
  args: {
    id?: string;
    clientId: string;
    instrumentId: string;
    relationshipType: string;
    notes?: string | null;
  }
) {
  return client.query(
    `INSERT INTO public.client_instruments (
       id, org_id, client_id, instrument_id, relationship_type, notes
     ) VALUES (
       COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6
     )
     RETURNING id, relationship_type, notes`,
    [
      args.id ?? null,
      ORG_A,
      args.clientId,
      args.instrumentId,
      args.relationshipType,
      args.notes ?? null,
    ]
  );
}

async function relationshipCount(
  client: Client,
  args: {
    clientId: string;
    instrumentId: string;
    relationshipType: string;
  }
): Promise<number> {
  const result = await client.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
     FROM public.client_instruments
     WHERE org_id = $1
       AND client_id = $2
       AND instrument_id = $3
       AND relationship_type = $4`,
    [ORG_A, args.clientId, args.instrumentId, args.relationshipType]
  );
  return Number(result.rows[0]?.n ?? 0);
}

async function inspectIndex(client: Client) {
  const result = await client.query<{
    indisunique: boolean;
    nspname: string;
    relname: string;
    cols: string;
    pred: string | null;
    indexdef: string;
  }>(
    `SELECT
       i.indisunique,
       n.nspname,
       t.relname,
       (
         SELECT string_agg(a.attname, ',' ORDER BY x.ordinality)
         FROM unnest(i.indkey) WITH ORDINALITY AS x(attnum, ordinality)
         JOIN pg_attribute a
           ON a.attrelid = i.indrelid
          AND a.attnum = x.attnum
       ) AS cols,
       pg_get_expr(i.indpred, i.indrelid) AS pred,
       pg_get_indexdef(i.indexrelid) AS indexdef
     FROM pg_class idx
     JOIN pg_index i ON i.indexrelid = idx.oid
     JOIN pg_class t ON t.oid = i.indrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE idx.relname = $1`,
    [INDEX_NAME]
  );
  return result.rows[0] ?? null;
}

async function raceInserts(
  connectionString: string,
  relationshipType: 'Interested' | 'Booked'
) {
  const a = new Client({ connectionString });
  const b = new Client({ connectionString });
  await a.connect();
  await b.connect();
  try {
    const sql = {
      text: `INSERT INTO public.client_instruments (
               org_id, client_id, instrument_id, relationship_type
             ) VALUES ($1, $2, $3, $4)`,
      values: [ORG_A, CLIENT_A, INSTRUMENT_X, relationshipType],
    };
    return await Promise.allSettled([a.query(sql), b.query(sql)]);
  } finally {
    await a.end();
    await b.end();
  }
}

describe('20260815120000 unique Interested/Booked connections', () => {
  let baseUrl: string;
  let admin: Client;
  const cloned = new Set<string>();

  async function cloneDb(name: string): Promise<string> {
    cloned.add(name);
    await createDatabase(admin, name, TEMPLATE_DB);
    return dbUrl(baseUrl, name);
  }

  async function withClone(
    name: string,
    fn: (client: Client, connectionString: string) => Promise<void>
  ) {
    const connectionString = await cloneDb(name);
    const client = new Client({ connectionString });
    await client.connect();
    try {
      await fn(client, connectionString);
    } finally {
      await client.end();
    }
  }

  beforeAll(async () => {
    const connectionString = process.env.TEST_MIGRATION_POSTGRES_URL;
    if (!connectionString) {
      throw new Error(
        'TEST_MIGRATION_POSTGRES_URL is not set. Run via the npm script that wires up global-setup.cjs.'
      );
    }
    baseUrl = connectionString;
    admin = new Client({ connectionString: adminUrl(baseUrl) });
    await admin.connect();
    await createDatabase(admin, TEMPLATE_DB);
    const template = new Client({
      connectionString: dbUrl(baseUrl, TEMPLATE_DB),
    });
    await template.connect();
    try {
      await applySql(template, PLATFORM_STUB_SQL, 'platform stubs');
      await applyMigrationFiles(template, false);
    } finally {
      await template.end();
    }
  });

  afterAll(async () => {
    for (const name of cloned) {
      await dropDatabase(admin, name);
    }
    await dropDatabase(admin, TEMPLATE_DB);
    await admin.end();
  });

  test('current EXISTS guard is not concurrency-safe without the unique index', async () => {
    await withClone('hcvb_pr07_gap', async (client, connectionString) => {
      await seedCore(client);
      const before = await inspectIndex(client);
      expect(before).toBeNull();

      const raced = await raceInserts(connectionString, 'Interested');
      const fulfilled = raced.filter(result => result.status === 'fulfilled');
      expect(fulfilled.length).toBe(2);
      expect(
        await relationshipCount(client, {
          clientId: CLIENT_A,
          instrumentId: INSTRUMENT_X,
          relationshipType: 'Interested',
        })
      ).toBe(2);
    });
  });

  test('pre-existing duplicate Interested rows block the migration and are not cleaned up', async () => {
    await withClone('hcvb_pr07_dup_int', async client => {
      await seedCore(client);
      const first = await insertRelationship(client, {
        clientId: CLIENT_A,
        instrumentId: INSTRUMENT_X,
        relationshipType: 'Interested',
        notes: 'keeper-a',
      });
      const second = await insertRelationship(client, {
        clientId: CLIENT_A,
        instrumentId: INSTRUMENT_X,
        relationshipType: 'Interested',
        notes: 'keeper-b',
      });

      await expect(
        applySql(
          client,
          readSql(path.join(MIGRATIONS_DIR, NEW_MIGRATION)),
          NEW_MIGRATION
        )
      ).rejects.toThrow(/CONNECTION_DUPLICATES_BLOCK_UNIQUE_INDEX/);

      const remaining = await client.query(
        `SELECT id, notes, relationship_type
         FROM public.client_instruments
         WHERE id = ANY($1::uuid[])
         ORDER BY notes`,
        [[first.rows[0].id, second.rows[0].id]]
      );
      expect(remaining.rows).toEqual([
        {
          id: first.rows[0].id,
          notes: 'keeper-a',
          relationship_type: 'Interested',
        },
        {
          id: second.rows[0].id,
          notes: 'keeper-b',
          relationship_type: 'Interested',
        },
      ]);
      expect(await inspectIndex(client)).toBeNull();
    });
  });

  test('pre-existing duplicate Booked rows block the migration and are not cleaned up', async () => {
    await withClone('hcvb_pr07_dup_booked', async client => {
      await seedCore(client);
      const first = await insertRelationship(client, {
        clientId: CLIENT_A,
        instrumentId: INSTRUMENT_X,
        relationshipType: 'Booked',
        notes: 'booked-a',
      });
      const second = await insertRelationship(client, {
        clientId: CLIENT_A,
        instrumentId: INSTRUMENT_X,
        relationshipType: 'Booked',
        notes: 'booked-b',
      });

      await expect(
        applySql(
          client,
          readSql(path.join(MIGRATIONS_DIR, NEW_MIGRATION)),
          NEW_MIGRATION
        )
      ).rejects.toThrow(/CONNECTION_DUPLICATES_BLOCK_UNIQUE_INDEX/);

      const remaining = await client.query(
        `SELECT id, notes, relationship_type
         FROM public.client_instruments
         WHERE id = ANY($1::uuid[])
         ORDER BY notes`,
        [[first.rows[0].id, second.rows[0].id]]
      );
      expect(remaining.rows).toHaveLength(2);
      expect(remaining.rows.map(row => row.notes).sort()).toEqual([
        'booked-a',
        'booked-b',
      ]);
      expect(await inspectIndex(client)).toBeNull();
    });
  });

  test('clean data applies the unique Interested/Booked index with the intended definition', async () => {
    await withClone('hcvb_pr07_clean', async client => {
      await seedCore(client);
      await insertRelationship(client, {
        clientId: CLIENT_A,
        instrumentId: INSTRUMENT_X,
        relationshipType: 'Interested',
      });
      await insertRelationship(client, {
        clientId: CLIENT_A,
        instrumentId: INSTRUMENT_X,
        relationshipType: 'Booked',
      });
      await insertRelationship(client, {
        clientId: CLIENT_B,
        instrumentId: INSTRUMENT_X,
        relationshipType: 'Interested',
      });
      await insertRelationship(client, {
        clientId: CLIENT_A,
        instrumentId: INSTRUMENT_Y,
        relationshipType: 'Interested',
      });
      await insertRelationship(client, {
        clientId: CLIENT_B,
        instrumentId: INSTRUMENT_Y,
        relationshipType: 'Owned',
      });

      await applySql(
        client,
        readSql(path.join(MIGRATIONS_DIR, NEW_MIGRATION)),
        NEW_MIGRATION
      );

      const index = await inspectIndex(client);
      expect(index).not.toBeNull();
      expect(index?.indisunique).toBe(true);
      expect(index?.nspname).toBe('public');
      expect(index?.relname).toBe('client_instruments');
      expect(index?.cols).toBe(
        'org_id,client_id,instrument_id,relationship_type'
      );
      expect(index?.pred).toEqual(expect.stringContaining('Interested'));
      expect(index?.pred).toEqual(expect.stringContaining('Booked'));
      expect(index?.pred).not.toEqual(expect.stringContaining('Owned'));
      expect(index?.pred).not.toEqual(expect.stringContaining('Sold'));
      expect(index?.indexdef).toEqual(expect.stringContaining('UNIQUE'));
      expect(index?.indexdef).toEqual(
        expect.stringContaining('client_instruments')
      );
    });
  });

  test('sequential and concurrent duplicate Interested/Booked writes are rejected', async () => {
    await withClone('hcvb_pr07_races', async (client, connectionString) => {
      await seedCore(client);
      await applySql(
        client,
        readSql(path.join(MIGRATIONS_DIR, NEW_MIGRATION)),
        NEW_MIGRATION
      );

      await insertRelationship(client, {
        clientId: CLIENT_A,
        instrumentId: INSTRUMENT_Y,
        relationshipType: 'Interested',
      });
      await expect(
        insertRelationship(client, {
          clientId: CLIENT_A,
          instrumentId: INSTRUMENT_Y,
          relationshipType: 'Interested',
        })
      ).rejects.toMatchObject({ code: '23505' });

      const interestedRace = await raceInserts(connectionString, 'Interested');
      const interestedOk = interestedRace.filter(
        result => result.status === 'fulfilled'
      );
      const interestedRejected = interestedRace.filter(
        result => result.status === 'rejected'
      );
      expect(interestedOk).toHaveLength(1);
      expect(interestedRejected).toHaveLength(1);
      expect(
        (interestedRejected[0] as PromiseRejectedResult).reason
      ).toMatchObject({ code: '23505' });
      expect(
        await relationshipCount(client, {
          clientId: CLIENT_A,
          instrumentId: INSTRUMENT_X,
          relationshipType: 'Interested',
        })
      ).toBe(1);

      await client.query(
        `DELETE FROM public.client_instruments
         WHERE org_id = $1 AND instrument_id = $2`,
        [ORG_A, INSTRUMENT_X]
      );

      const bookedRace = await raceInserts(connectionString, 'Booked');
      const bookedOk = bookedRace.filter(
        result => result.status === 'fulfilled'
      );
      const bookedRejected = bookedRace.filter(
        result => result.status === 'rejected'
      );
      expect(bookedOk).toHaveLength(1);
      expect(bookedRejected).toHaveLength(1);
      expect((bookedRejected[0] as PromiseRejectedResult).reason).toMatchObject(
        { code: '23505' }
      );
      expect(
        await relationshipCount(client, {
          clientId: CLIENT_A,
          instrumentId: INSTRUMENT_X,
          relationshipType: 'Booked',
        })
      ).toBe(1);
    });
  });

  test('allowed combinations and update collision keep neighboring contracts intact', async () => {
    await withClone('hcvb_pr07_matrix', async client => {
      await seedCore(client);
      await applySql(
        client,
        readSql(path.join(MIGRATIONS_DIR, NEW_MIGRATION)),
        NEW_MIGRATION
      );
      await setAdminJwt(client);

      const interested = await insertRelationship(client, {
        clientId: CLIENT_A,
        instrumentId: INSTRUMENT_X,
        relationshipType: 'Interested',
        notes: 'row-a',
      });
      const booked = await insertRelationship(client, {
        clientId: CLIENT_A,
        instrumentId: INSTRUMENT_X,
        relationshipType: 'Booked',
        notes: 'row-b',
      });
      await insertRelationship(client, {
        clientId: CLIENT_B,
        instrumentId: INSTRUMENT_X,
        relationshipType: 'Interested',
      });
      await insertRelationship(client, {
        clientId: CLIENT_A,
        instrumentId: INSTRUMENT_Y,
        relationshipType: 'Interested',
      });

      await expect(
        client.query(`SELECT public.create_connection_atomic($1, $2, $3, $4)`, [
          CLIENT_A,
          INSTRUMENT_X,
          'Interested',
          null,
        ])
      ).rejects.toThrow(/DUPLICATE_CONNECTION/);

      await expect(
        client.query(`SELECT public.update_connection_atomic($1, $2::jsonb)`, [
          interested.rows[0].id,
          JSON.stringify({ relationship_type: 'Booked' }),
        ])
      ).rejects.toMatchObject({ code: '23505' });

      const afterUpdate = await client.query(
        `SELECT id, relationship_type, notes
         FROM public.client_instruments
         WHERE id = ANY($1::uuid[])
         ORDER BY notes`,
        [[interested.rows[0].id, booked.rows[0].id]]
      );
      expect(afterUpdate.rows).toEqual([
        {
          id: interested.rows[0].id,
          relationship_type: 'Interested',
          notes: 'row-a',
        },
        {
          id: booked.rows[0].id,
          relationship_type: 'Booked',
          notes: 'row-b',
        },
      ]);

      await insertRelationship(client, {
        clientId: CLIENT_B,
        instrumentId: INSTRUMENT_Y,
        relationshipType: 'Owned',
      });
      await expect(
        insertRelationship(client, {
          clientId: CLIENT_A,
          instrumentId: INSTRUMENT_Y,
          relationshipType: 'Owned',
        })
      ).rejects.toMatchObject({
        code: '23505',
        message: expect.stringContaining(
          'client_instruments_single_owner_per_instrument'
        ),
      });

      await expect(
        client.query(`SELECT public.create_connection_atomic($1, $2, $3, $4)`, [
          CLIENT_A,
          INSTRUMENT_X,
          'Sold',
          null,
        ])
      ).rejects.toThrow(/Sold relationship cannot be created directly/);

      const saleId = await client.query<{ create_sale_atomic: string }>(
        `SELECT public.create_sale_atomic(1500, CURRENT_DATE, $1, $2, $3)`,
        [CLIENT_A, INSTRUMENT_Y, 'pr-07 sale']
      );
      expect(typeof saleId.rows[0]?.create_sale_atomic).toBe('string');
      const sold = await client.query(
        `SELECT relationship_type
         FROM public.client_instruments
         WHERE instrument_id = $1 AND relationship_type = 'Sold'`,
        [INSTRUMENT_Y]
      );
      expect(sold.rows).toHaveLength(1);
    });
  });
});
