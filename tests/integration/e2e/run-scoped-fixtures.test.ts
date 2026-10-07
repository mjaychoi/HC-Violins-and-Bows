/** @jest-environment node */

import * as fs from 'fs';
import * as path from 'path';

import { DEFAULT_E2E_ORG_ID, deriveE2EOrgId } from '../../e2e/e2e-identities';
import {
  ORG_SCOPED_TABLES,
  ORG_SCOPED_TABLES_WITHOUT_ORG_FK,
  cleanupRunScopedFixtures,
  resolveRunScopedE2EContext,
  seedRunScopedFixtures,
  type RunScopedE2EContext,
  type RunScopedE2EStore,
  type RunScopedUser,
  type RunScopedUserAttributes,
} from '../../e2e/run-scoped-fixtures';

/** Synthetic refs only — never a real project identifier. */
const stagingRef = 'stagingexample1234';
const productionRef = 'prodrefexample9999';

function hostedEnv(scope: string): Record<string, string> {
  return {
    CI: 'true',
    PLAYWRIGHT_SUITE: 'critical',
    E2E_RUN_SCOPE: scope,
    STAGING_SUPABASE_PROJECT_REF: stagingRef,
    PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
    NEXT_PUBLIC_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-for-unit-tests',
    E2E_TEST_PASSWORD: 'fake-admin-password',
    E2E_TEST_MEMBER_PASSWORD: 'fake-member-password',
    E2E_TEST_ORG_ID: '99999999-9999-4999-8999-999999999999',
  };
}

const envA = hostedEnv('18342901234-1-critical-a');
const envB = hostedEnv('18342901234-1-critical-b');

function contextFor(env: Record<string, string>): RunScopedE2EContext {
  const context = resolveRunScopedE2EContext(env);
  if (!context) throw new Error('expected a run-scoped context');
  return context;
}

type Row = { org_id: string };

type FakeUser = Required<RunScopedUser> & {
  email: string;
  app_metadata: Record<string, unknown>;
};

/**
 * In-memory stand-in for the service-role client. Deleting an organization
 * cascades to every org_id table except the FK-less ones, mirroring the
 * cascade proven against the replayed migration chain.
 */
class FakeStore implements RunScopedE2EStore {
  orgs = new Map<string, string>();
  rows = new Map<string, Row[]>();
  users: Array<FakeUser> = [];
  ops: string[] = [];
  failCreateUserFor: string | null = null;
  cascadeSkips = new Set<string>(ORG_SCOPED_TABLES_WITHOUT_ORG_FK);
  private nextId = 1;

  addRows(table: string, orgId: string, count = 1) {
    const list = this.rows.get(table) ?? [];
    for (let i = 0; i < count; i += 1) list.push({ org_id: orgId });
    this.rows.set(table, list);
  }

  mutations(): string[] {
    return this.ops.filter(
      op => !op.startsWith('find') && !op.startsWith('count')
    );
  }

  async findOrganization(id: string) {
    this.ops.push(`findOrganization:${id}`);
    const name = this.orgs.get(id);
    return name === undefined ? null : { id, name };
  }

  async insertOrganization(row: { id: string; name: string }) {
    this.ops.push(`insertOrganization:${row.id}`);
    if (this.orgs.has(row.id)) throw new Error('duplicate org');
    this.orgs.set(row.id, row.name);
  }

  async deleteRows(table: string, column: string, value: string) {
    this.ops.push(`deleteRows:${table}.${column}=${value}`);
    if (table === 'organizations') {
      if (column !== 'id') throw new Error('unexpected org delete column');
      this.orgs.delete(value);
      for (const [name, list] of this.rows) {
        if (this.cascadeSkips.has(name)) continue;
        this.rows.set(
          name,
          list.filter(row => row.org_id !== value)
        );
      }
      return;
    }
    if (column !== 'org_id') throw new Error('unexpected delete column');
    this.rows.set(
      table,
      (this.rows.get(table) ?? []).filter(row => row.org_id !== value)
    );
  }

  async countRows(table: string, column: string, value: string) {
    this.ops.push(`countRows:${table}.${column}=${value}`);
    if (table === 'organizations') return this.orgs.has(value) ? 1 : 0;
    return (this.rows.get(table) ?? []).filter(row => row.org_id === value)
      .length;
  }

  async findUserByEmail(email: string) {
    this.ops.push(`findUserByEmail:${email}`);
    return (
      this.users.find(u => u.email.toLowerCase() === email.toLowerCase()) ??
      null
    );
  }

  async createUser(attributes: RunScopedUserAttributes) {
    this.ops.push(`createUser:${attributes.email}`);
    if (this.failCreateUserFor === attributes.email) {
      throw new Error('simulated createUser failure');
    }
    const user = {
      id: `user-${this.nextId++}`,
      email: attributes.email,
      app_metadata: { ...attributes.app_metadata },
    };
    this.users.push(user);
    return user;
  }

  async updateUser(id: string, attributes: RunScopedUserAttributes) {
    this.ops.push(`updateUser:${id}`);
    const user = this.users.find(u => u.id === id);
    if (!user) throw new Error('missing user');
    user.app_metadata = { ...attributes.app_metadata };
  }

  async deleteUser(id: string) {
    this.ops.push(`deleteUser:${id}`);
    this.users = this.users.filter(u => u.id !== id);
  }
}

function idsOf(store: FakeStore, context: RunScopedE2EContext) {
  return {
    orgId: context.orgId,
    adminId: store.users.find(u => u.email === context.admin.email)?.id,
    memberId: store.users.find(u => u.email === context.member.email)?.id,
  };
}

describe('run-scoped setup isolation', () => {
  it('gives scope A and scope B disjoint orgs, admins, and members', async () => {
    const store = new FakeStore();
    const a = contextFor(envA);
    const b = contextFor(envB);

    const seededA = await seedRunScopedFixtures(store, a, envA);
    const seededB = await seedRunScopedFixtures(store, b, envB);

    expect(seededA.orgCreated).toBe(true);
    expect(seededB.orgCreated).toBe(true);
    expect(seededA.users.map(u => u.created)).toEqual([true, true]);

    const isolationA = [
      a.scopeKey,
      a.orgId,
      a.orgName,
      a.admin.email,
      a.member.email,
      ...seededA.users.map(u => u.userId),
    ];
    const isolationB = [
      b.scopeKey,
      b.orgId,
      b.orgName,
      b.admin.email,
      b.member.email,
      ...seededB.users.map(u => u.userId),
    ];
    for (const value of isolationA) expect(isolationB).not.toContain(value);
    expect(a.admin.email).not.toBe(a.member.email);

    expect(store.orgs.size).toBe(2);
    expect(store.users).toHaveLength(4);
    for (const context of [a, b]) {
      for (const identity of [context.admin, context.member]) {
        const user = store.users.find(u => u.email === identity.email);
        expect(user?.app_metadata).toEqual({
          org_id: context.orgId,
          role: identity.role,
          e2e_managed: true,
          e2e_run_scope: context.scopeKey,
        });
      }
    }
  });

  it('re-verifies (not duplicates) its own resources on a same-scope rerun', async () => {
    const store = new FakeStore();
    const a = contextFor(envA);
    await seedRunScopedFixtures(store, a, envA);
    const again = await seedRunScopedFixtures(store, a, envA);

    expect(again.orgCreated).toBe(false);
    expect(again.users.map(u => u.created)).toEqual([false, false]);
    expect(store.users).toHaveLength(2);
  });

  it('refuses to adopt a user with the derived email but foreign metadata', async () => {
    const store = new FakeStore();
    const a = contextFor(envA);
    store.users.push({
      id: 'foreign',
      email: a.admin.email,
      app_metadata: { org_id: a.orgId, role: 'admin', e2e_run_scope: 'abc' },
    });

    await expect(seedRunScopedFixtures(store, a, envA)).rejects.toThrow(
      /not marked e2e_managed/
    );
    expect(store.mutations()).not.toContain('updateUser:foreign');
  });

  it('refuses setup against a non-allowlisted project before any write', async () => {
    const store = new FakeStore();
    const env = {
      ...envA,
      NEXT_PUBLIC_SUPABASE_URL: 'https://otherrefexample5678.supabase.co',
    };
    await expect(
      seedRunScopedFixtures(store, contextFor(env), env)
    ).rejects.toThrow(/does not match STAGING_SUPABASE_PROJECT_REF/);
    expect(store.ops).toEqual([]);
  });
});

describe('run-scoped cleanup', () => {
  async function seededPair() {
    const store = new FakeStore();
    const a = contextFor(envA);
    const b = contextFor(envB);
    await seedRunScopedFixtures(store, a, envA);
    await seedRunScopedFixtures(store, b, envB);
    for (const context of [a, b]) {
      store.addRows('clients', context.orgId, 2);
      store.addRows('sales_history', context.orgId, 1);
      store.addRows('sales_idempotency_keys', context.orgId, 1);
      store.addRows('invoice_idempotency_keys', context.orgId, 1);
      store.addRows('audit_log', context.orgId, 3);
      store.addRows('api_create_idempotency', context.orgId, 1);
    }
    return { store, a, b };
  }

  it('removes all of A and touches nothing of B', async () => {
    const { store, a, b } = await seededPair();
    const aIds = idsOf(store, a);
    const bIds = idsOf(store, b);
    store.ops = [];

    const summary = await cleanupRunScopedFixtures(store, a, envA);

    expect(summary.organizationFound).toBe(true);
    expect(summary.authUsersDeleted).toEqual(['admin', 'member']);
    expect(summary.rowsBefore).toMatchObject({
      organizations: 1,
      clients: 2,
      api_create_idempotency: 1,
    });
    expect(summary.residualTotal).toBe(0);

    for (const op of store.ops) {
      expect(op).not.toContain(b.orgId);
      expect(op).not.toContain(b.admin.email);
      expect(op).not.toContain(b.member.email);
      expect(op).not.toContain(`:${bIds.adminId}`);
      expect(op).not.toContain(`:${bIds.memberId}`);
    }
    expect(store.mutations()).toEqual([
      `deleteRows:api_create_idempotency.org_id=${a.orgId}`,
      `deleteRows:organizations.id=${a.orgId}`,
      `deleteUser:${aIds.adminId}`,
      `deleteUser:${aIds.memberId}`,
    ]);

    expect(store.orgs.has(b.orgId)).toBe(true);
    expect(store.users.map(u => u.email).sort()).toEqual(
      [b.admin.email, b.member.email].sort()
    );
    for (const table of ORG_SCOPED_TABLES) {
      expect(await store.countRows(table, 'org_id', a.orgId)).toBe(0);
    }
    expect(await store.countRows('clients', 'org_id', b.orgId)).toBe(2);
    expect(
      await store.countRows('api_create_idempotency', 'org_id', b.orgId)
    ).toBe(1);
  });

  it('is idempotent: a second cleanup finds nothing and deletes no user', async () => {
    const { store, a } = await seededPair();
    await cleanupRunScopedFixtures(store, a, envA);
    store.ops = [];

    const second = await cleanupRunScopedFixtures(store, a, envA);

    expect(second.organizationFound).toBe(false);
    expect(second.authUsersDeleted).toEqual([]);
    expect(second.residualTotal).toBe(0);
    expect(store.mutations()).toEqual([
      `deleteRows:api_create_idempotency.org_id=${a.orgId}`,
    ]);
  });

  it('cleans up a partial setup (org + admin created, member failed)', async () => {
    const store = new FakeStore();
    const a = contextFor(envA);
    store.failCreateUserFor = a.member.email;

    await expect(seedRunScopedFixtures(store, a, envA)).rejects.toThrow(
      /simulated createUser failure/
    );
    expect(store.orgs.has(a.orgId)).toBe(true);
    expect(store.users).toHaveLength(1);

    const summary = await cleanupRunScopedFixtures(store, a, envA);
    expect(summary.authUsersDeleted).toEqual(['admin']);
    expect(summary.residualTotal).toBe(0);
    expect(store.orgs.size).toBe(0);
    expect(store.users).toHaveLength(0);
  });

  it('cleans up after a failed test body that left application rows behind', async () => {
    const { store, a } = await seededPair();
    store.addRows('invoices', a.orgId, 1);
    store.addRows('invoice_items', a.orgId, 2);
    store.addRows('maintenance_tasks', a.orgId, 1);

    const summary = await cleanupRunScopedFixtures(store, a, envA);
    expect(summary.rowsBefore.invoice_items).toBe(2);
    expect(summary.residualTotal).toBe(0);
  });

  it('fails loudly when something survives the cascade', async () => {
    const { store, a } = await seededPair();
    store.cascadeSkips.add('clients');

    await expect(cleanupRunScopedFixtures(store, a, envA)).rejects.toThrow(
      /left residual resources/
    );
  });
});

describe('run-scoped cleanup safety gates', () => {
  async function expectRefusal(
    context: RunScopedE2EContext | null,
    env: Record<string, string>,
    pattern: RegExp,
    prepare?: (store: FakeStore) => void
  ) {
    const store = new FakeStore();
    const a = contextFor(envA);
    await seedRunScopedFixtures(store, a, envA);
    prepare?.(store);
    const before = { orgs: store.orgs.size, users: store.users.length };
    store.ops = [];

    await expect(cleanupRunScopedFixtures(store, context, env)).rejects.toThrow(
      pattern
    );
    expect(store.mutations()).toEqual([]);
    expect({ orgs: store.orgs.size, users: store.users.length }).toEqual(
      before
    );
  }

  it('refuses an empty scope', async () => {
    await expectRefusal(null, envA, /E2E_RUN_SCOPE is empty/);
    await expectRefusal(
      { ...contextFor(envA), scope: '  ' },
      envA,
      /E2E_RUN_SCOPE is empty/
    );
  });

  it('refuses the default shared org', async () => {
    await expectRefusal(
      { ...contextFor(envA), orgId: DEFAULT_E2E_ORG_ID },
      envA,
      /not the run-scoped org id/
    );
  });

  it('refuses the configured shared E2E org', async () => {
    const context = contextFor(envA);
    await expectRefusal(
      context,
      { ...envA, E2E_TEST_ORG_ID: context.orgId.toUpperCase() },
      /shared E2E organization/
    );
  });

  it('refuses an org id from a different scope', async () => {
    await expectRefusal(
      { ...contextFor(envA), orgId: deriveE2EOrgId(contextFor(envB).scopeKey) },
      envA,
      /not the run-scoped org id/
    );
  });

  it('refuses an email without the run-scope marker', async () => {
    const context = contextFor(envA);
    await expectRefusal(
      { ...context, admin: { ...context.admin, email: 'qa@example.com' } },
      envA,
      /admin email does not carry the run-scope marker/
    );
    await expectRefusal(
      {
        ...context,
        member: { ...context.member, email: contextFor(envB).member.email },
      },
      envA,
      /member email does not carry the run-scope marker/
    );
  });

  it('refuses a non-allowlisted project', async () => {
    await expectRefusal(
      contextFor(envA),
      {
        ...envA,
        NEXT_PUBLIC_SUPABASE_URL: 'https://otherrefexample5678.supabase.co',
      },
      /does not match STAGING_SUPABASE_PROJECT_REF/
    );
  });

  it('refuses the production project even if allowlisted', async () => {
    await expectRefusal(
      contextFor(envA),
      {
        ...envA,
        STAGING_SUPABASE_PROJECT_REF: productionRef,
        NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co`,
      },
      /must not use the production Supabase project/
    );
  });

  it('refuses without the service role key', async () => {
    const env = { ...envA, SUPABASE_SERVICE_ROLE_KEY: '' };
    await expectRefusal(contextFor(envA), env, /SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('refuses outside CI / the critical suite', async () => {
    const env = { ...envA, CI: '', PLAYWRIGHT_SUITE: '' };
    await expectRefusal(contextFor(envA), env, /only runs in CI/);
  });

  it('refuses when a user carries another run scope', async () => {
    const a = contextFor(envA);
    await expectRefusal(a, envA, /belongs to a different run scope/, store => {
      const member = store.users.find(u => u.email === a.member.email);
      if (member)
        member.app_metadata = {
          ...member.app_metadata,
          e2e_run_scope: 'ffffffffffff',
        };
    });
  });

  it('refuses when a user is not e2e_managed', async () => {
    const a = contextFor(envA);
    await expectRefusal(a, envA, /not marked e2e_managed/, store => {
      const admin = store.users.find(u => u.email === a.admin.email);
      if (admin) admin.app_metadata = { org_id: a.orgId, role: 'admin' };
    });
  });

  it('refuses when the org with the derived id is not ours', async () => {
    const a = contextFor(envA);
    await expectRefusal(a, envA, /unexpected name/, store => {
      store.orgs.set(a.orgId, 'HC Violins and Bows');
    });
  });
});

describe('ORG_SCOPED_TABLES contract', () => {
  const migrationsDir = path.join(process.cwd(), 'supabase/migrations');
  const tables = new Map<string, boolean>();

  for (const file of fs.readdirSync(migrationsDir).sort()) {
    if (!file.endsWith('.sql')) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const re = /CREATE TABLE IF NOT EXISTS public\.(\w+)\s*\(([\s\S]*?)\n\);/gi;
    for (const match of sql.matchAll(re)) {
      const [, table, body] = match;
      const orgLine = body
        .split('\n')
        .find(line => /^\s*org_id\s+uuid\b/i.test(line));
      if (!orgLine) continue;
      const hasFk =
        /REFERENCES\s+public\.organizations\s*\(\s*id\s*\)\s+ON DELETE CASCADE/i.test(
          orgLine
        );
      tables.set(table, (tables.get(table) ?? false) || hasFk);
    }
  }

  it('lists every public table with an org_id column', () => {
    expect([...ORG_SCOPED_TABLES].sort()).toEqual([...tables.keys()].sort());
  });

  it('marks exactly the tables whose org_id does not cascade from organizations', () => {
    const withoutFk = [...tables].filter(([, fk]) => !fk).map(([t]) => t);
    expect([...ORG_SCOPED_TABLES_WITHOUT_ORG_FK].sort()).toEqual(
      withoutFk.sort()
    );
  });
});
