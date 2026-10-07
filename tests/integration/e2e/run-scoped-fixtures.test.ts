/** @jest-environment node */

import * as fs from 'fs';
import * as path from 'path';

import {
  DEFAULT_E2E_ORG_ID,
  deriveE2EOrgId,
  deriveE2EOrgName,
  type E2EIdentity,
} from '../../e2e/e2e-identities';
import {
  ORG_SCOPED_TABLES,
  ORG_SCOPED_TABLES_WITHOUT_ORG_FK,
  cleanupRunScopedFixtures,
  resolveRunScopedE2EContext,
  seedRunScopedFixtures,
  type RunScopedCleanupSummary,
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
  failInsertOrganizationFor: string | null = null;
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

  userByEmail(email: string): FakeUser | undefined {
    return this.users.find(u => u.email === email);
  }

  async findOrganization(id: string) {
    this.ops.push(`findOrganization:${id}`);
    const name = this.orgs.get(id);
    return name === undefined ? null : { id, name };
  }

  async insertOrganization(row: { id: string; name: string }) {
    this.ops.push(`insertOrganization:${row.id}`);
    if (this.failInsertOrganizationFor === row.id) {
      throw new Error('simulated insertOrganization failure');
    }
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

function allIdentities(context: RunScopedE2EContext): E2EIdentity[] {
  return [
    context.admin,
    context.member,
    context.logoutAdmin,
    context.secondaryAdmin,
  ];
}

/** Every value that names one of `context`'s resources in a store op. */
function resourceMarkers(
  store: FakeStore,
  context: RunScopedE2EContext
): string[] {
  const markers = [context.orgId, context.secondaryOrgId];
  for (const identity of allIdentities(context)) {
    markers.push(identity.email);
    const user = store.userByEmail(identity.email);
    if (user) markers.push(`:${user.id}`);
  }
  return markers;
}

function cleanupOrg(
  summary: RunScopedCleanupSummary,
  slot: 'primary' | 'secondary'
) {
  const org = summary.orgs.find(o => o.slot === slot);
  if (!org) throw new Error(`missing ${slot} org in cleanup summary`);
  return org;
}

describe('run-scoped context', () => {
  it('derives a distinct secondary org and secondary admin from the same scope', () => {
    const a = contextFor(envA);
    expect(a.secondaryOrgId).toBe(deriveE2EOrgId(a.scopeKey, 'secondary'));
    expect(a.secondaryOrgName).toBe(deriveE2EOrgName(a.scopeKey, 'secondary'));
    expect(a.secondaryOrgId).not.toBe(a.orgId);
    expect(a.secondaryOrgName).not.toBe(a.orgName);
    expect(a.secondaryAdmin).toEqual({
      email: `hcve2e-${a.scopeKey}-secondary-admin@example.test`,
      password: envA.E2E_TEST_PASSWORD,
      orgId: a.secondaryOrgId,
      role: 'admin',
    });
    expect(a.logoutAdmin).toEqual({
      email: `hcve2e-${a.scopeKey}-logout-admin@example.test`,
      password: envA.E2E_TEST_PASSWORD,
      orgId: a.orgId,
      role: 'admin',
    });
    expect(new Set(allIdentities(a).map(identity => identity.email)).size).toBe(
      4
    );
    for (const orgId of [a.orgId, a.secondaryOrgId]) {
      expect(orgId).not.toBe(DEFAULT_E2E_ORG_ID);
      expect(orgId).not.toBe(envA.E2E_TEST_ORG_ID);
    }
  });
});

describe('run-scoped setup isolation', () => {
  it('gives scope A and scope B disjoint orgs and users, two orgs and four users each', async () => {
    const store = new FakeStore();
    const a = contextFor(envA);
    const b = contextFor(envB);

    const seededA = await seedRunScopedFixtures(store, a, envA);
    const seededB = await seedRunScopedFixtures(store, b, envB);

    expect(seededA.orgs).toEqual([
      { slot: 'primary', orgId: a.orgId, created: true },
      { slot: 'secondary', orgId: a.secondaryOrgId, created: true },
    ]);
    expect(seededB.orgs.map(o => o.created)).toEqual([true, true]);
    expect(seededA.users.map(u => [u.label, u.role, u.created])).toEqual([
      ['admin', 'admin', true],
      ['member', 'member', true],
      ['logout-admin', 'admin', true],
      ['secondary-admin', 'admin', true],
    ]);

    const isolationA = [
      a.scopeKey,
      a.orgName,
      a.secondaryOrgName,
      ...resourceMarkers(store, a),
    ];
    const isolationB = [
      b.scopeKey,
      b.orgName,
      b.secondaryOrgName,
      ...resourceMarkers(store, b),
    ];
    for (const value of isolationA) expect(isolationB).not.toContain(value);

    expect(store.orgs.size).toBe(4);
    expect(store.orgs.get(a.orgId)).toBe(a.orgName);
    expect(store.orgs.get(a.secondaryOrgId)).toBe(a.secondaryOrgName);
    expect(store.users).toHaveLength(8);
    for (const context of [a, b]) {
      for (const [identity, orgId] of [
        [context.admin, context.orgId],
        [context.member, context.orgId],
        [context.logoutAdmin, context.orgId],
        [context.secondaryAdmin, context.secondaryOrgId],
      ] as const) {
        expect(store.userByEmail(identity.email)?.app_metadata).toEqual({
          org_id: orgId,
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

    expect(again.orgs.map(o => o.created)).toEqual([false, false]);
    expect(again.users.map(u => u.created)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(store.orgs.size).toBe(2);
    expect(store.users).toHaveLength(4);
  });

  it('refuses to adopt a user with the derived email but foreign metadata, before any write', async () => {
    const store = new FakeStore();
    const a = contextFor(envA);
    store.users.push({
      id: 'foreign',
      email: a.admin.email,
      app_metadata: { org_id: a.orgId, role: 'admin', e2e_run_scope: 'abc' },
    });

    await expect(seedRunScopedFixtures(store, a, envA)).rejects.toThrow(
      /admin user is not marked e2e_managed/
    );
    expect(store.mutations()).toEqual([]);
  });

  it('refuses a secondary admin that points at the primary org, before any write', async () => {
    const store = new FakeStore();
    const a = contextFor(envA);
    store.users.push({
      id: 'misfiled',
      email: a.secondaryAdmin.email,
      app_metadata: {
        org_id: a.orgId,
        role: 'admin',
        e2e_managed: true,
        e2e_run_scope: a.scopeKey,
      },
    });

    await expect(seedRunScopedFixtures(store, a, envA)).rejects.toThrow(
      /secondary-admin user belongs to a different organization/
    );
    expect(store.mutations()).toEqual([]);
    expect(store.orgs.size).toBe(0);
  });

  it('refuses a logout admin with foreign ownership metadata before any write', async () => {
    const store = new FakeStore();
    const a = contextFor(envA);
    store.users.push({
      id: 'foreign-logout-admin',
      email: a.logoutAdmin.email,
      app_metadata: {
        org_id: a.orgId,
        role: 'admin',
        e2e_managed: true,
        e2e_run_scope: contextFor(envB).scopeKey,
      },
    });

    await expect(seedRunScopedFixtures(store, a, envA)).rejects.toThrow(
      /logout-admin user belongs to a different run scope/
    );
    expect(store.mutations()).toEqual([]);
  });

  it('refuses a secondary org id already used by a differently named org, before any write', async () => {
    const store = new FakeStore();
    const a = contextFor(envA);
    store.orgs.set(a.secondaryOrgId, a.orgName);

    await expect(seedRunScopedFixtures(store, a, envA)).rejects.toThrow(
      /secondary organization with the run-scoped id has an unexpected name/
    );
    expect(store.mutations()).toEqual([]);
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
      for (const orgId of [context.orgId, context.secondaryOrgId]) {
        store.addRows('clients', orgId, 2);
        store.addRows('sales_history', orgId, 1);
        store.addRows('sales_idempotency_keys', orgId, 1);
        store.addRows('invoice_idempotency_keys', orgId, 1);
        store.addRows('audit_log', orgId, 3);
        store.addRows('api_create_idempotency', orgId, 1);
      }
    }
    return { store, a, b };
  }

  it('removes both of A’s orgs and all four users, and touches nothing of B', async () => {
    const { store, a, b } = await seededPair();
    const aUser = (email: string) => store.userByEmail(email)?.id;
    const aIds = {
      admin: aUser(a.admin.email),
      member: aUser(a.member.email),
      logoutAdmin: aUser(a.logoutAdmin.email),
      secondary: aUser(a.secondaryAdmin.email),
    };
    const bMarkers = resourceMarkers(store, b);
    store.ops = [];

    const summary = await cleanupRunScopedFixtures(store, a, envA);

    expect(summary.authUsersDeleted).toEqual([
      'admin',
      'member',
      'logout-admin',
      'secondary-admin',
    ]);
    for (const slot of ['primary', 'secondary'] as const) {
      const org = cleanupOrg(summary, slot);
      expect(org.orgId).toBe(slot === 'primary' ? a.orgId : a.secondaryOrgId);
      expect(org.organizationFound).toBe(true);
      expect(org.rowsBefore).toMatchObject({
        organizations: 1,
        clients: 2,
        api_create_idempotency: 1,
      });
      expect(Object.values(org.residual).every(n => n === 0)).toBe(true);
    }
    expect(summary.authUsersResidual).toEqual({
      admin: 0,
      member: 0,
      'logout-admin': 0,
      'secondary-admin': 0,
    });
    expect(summary.residualTotal).toBe(0);

    for (const op of store.ops) {
      for (const marker of bMarkers) expect(op).not.toContain(marker);
    }
    expect(store.mutations()).toEqual([
      `deleteRows:api_create_idempotency.org_id=${a.orgId}`,
      `deleteRows:organizations.id=${a.orgId}`,
      `deleteRows:api_create_idempotency.org_id=${a.secondaryOrgId}`,
      `deleteRows:organizations.id=${a.secondaryOrgId}`,
      `deleteUser:${aIds.admin}`,
      `deleteUser:${aIds.member}`,
      `deleteUser:${aIds.logoutAdmin}`,
      `deleteUser:${aIds.secondary}`,
    ]);

    expect([...store.orgs.keys()].sort()).toEqual(
      [b.orgId, b.secondaryOrgId].sort()
    );
    expect(store.users.map(u => u.email).sort()).toEqual(
      allIdentities(b)
        .map(identity => identity.email)
        .sort()
    );
    for (const orgId of [a.orgId, a.secondaryOrgId]) {
      for (const table of ORG_SCOPED_TABLES) {
        expect(await store.countRows(table, 'org_id', orgId)).toBe(0);
      }
    }
    for (const orgId of [b.orgId, b.secondaryOrgId]) {
      expect(await store.countRows('clients', 'org_id', orgId)).toBe(2);
      expect(
        await store.countRows('api_create_idempotency', 'org_id', orgId)
      ).toBe(1);
    }
  });

  it('is idempotent: a second cleanup finds nothing and deletes no user', async () => {
    const { store, a } = await seededPair();
    await cleanupRunScopedFixtures(store, a, envA);
    store.ops = [];

    const second = await cleanupRunScopedFixtures(store, a, envA);

    expect(second.orgs.map(o => o.organizationFound)).toEqual([false, false]);
    expect(second.authUsersDeleted).toEqual([]);
    expect(second.residualTotal).toBe(0);
    expect(store.mutations()).toEqual([
      `deleteRows:api_create_idempotency.org_id=${a.orgId}`,
      `deleteRows:api_create_idempotency.org_id=${a.secondaryOrgId}`,
    ]);
  });

  it('cleans up a partial setup (both orgs + admin created, member failed)', async () => {
    const store = new FakeStore();
    const a = contextFor(envA);
    store.failCreateUserFor = a.member.email;

    await expect(seedRunScopedFixtures(store, a, envA)).rejects.toThrow(
      /simulated createUser failure/
    );
    expect(store.orgs.size).toBe(2);
    expect(store.users).toHaveLength(1);

    const summary = await cleanupRunScopedFixtures(store, a, envA);
    expect(summary.authUsersDeleted).toEqual(['admin']);
    expect(summary.residualTotal).toBe(0);
    expect(store.orgs.size).toBe(0);
    expect(store.users).toHaveLength(0);
  });

  it('cleans up a partial setup where the secondary org was never created', async () => {
    const store = new FakeStore();
    const a = contextFor(envA);
    store.failInsertOrganizationFor = a.secondaryOrgId;

    await expect(seedRunScopedFixtures(store, a, envA)).rejects.toThrow(
      /simulated insertOrganization failure/
    );
    expect([...store.orgs.keys()]).toEqual([a.orgId]);
    expect(store.users).toHaveLength(0);

    const summary = await cleanupRunScopedFixtures(store, a, envA);
    expect(cleanupOrg(summary, 'primary').organizationFound).toBe(true);
    expect(cleanupOrg(summary, 'secondary').organizationFound).toBe(false);
    expect(summary.authUsersDeleted).toEqual([]);
    expect(summary.residualTotal).toBe(0);
    expect(store.orgs.size).toBe(0);
  });

  it('cleans up a partial setup where only the secondary admin is missing', async () => {
    const store = new FakeStore();
    const a = contextFor(envA);
    store.failCreateUserFor = a.secondaryAdmin.email;

    await expect(seedRunScopedFixtures(store, a, envA)).rejects.toThrow(
      /simulated createUser failure/
    );
    expect(store.users).toHaveLength(3);

    const summary = await cleanupRunScopedFixtures(store, a, envA);
    expect(summary.authUsersDeleted).toEqual([
      'admin',
      'member',
      'logout-admin',
    ]);
    expect(summary.authUsersResidual['secondary-admin']).toBe(0);
    expect(summary.residualTotal).toBe(0);
    expect(store.orgs.size).toBe(0);
    expect(store.users).toHaveLength(0);
  });

  it('cleans up after a failed test body that left rows in both orgs', async () => {
    const { store, a } = await seededPair();
    store.addRows('invoices', a.orgId, 1);
    store.addRows('invoice_items', a.orgId, 2);
    store.addRows('maintenance_tasks', a.orgId, 1);
    store.addRows('invoices', a.secondaryOrgId, 1);
    store.addRows('client_instruments', a.secondaryOrgId, 1);
    store.addRows('api_create_idempotency', a.secondaryOrgId, 2);

    const summary = await cleanupRunScopedFixtures(store, a, envA);
    expect(cleanupOrg(summary, 'primary').rowsBefore.invoice_items).toBe(2);
    expect(cleanupOrg(summary, 'secondary').rowsBefore).toMatchObject({
      invoices: 1,
      client_instruments: 1,
      api_create_idempotency: 3,
    });
    expect(summary.residualTotal).toBe(0);
  });

  it('fails loudly when something survives the cascade in the secondary org', async () => {
    const { store, a } = await seededPair();
    store.cascadeSkips.add('clients');
    store.rows.set(
      'clients',
      (store.rows.get('clients') ?? []).filter(row => row.org_id !== a.orgId)
    );

    await expect(cleanupRunScopedFixtures(store, a, envA)).rejects.toThrow(
      /left residual resources.*"slot":"secondary"/
    );
  });

  it('fails loudly when an auth user survives deletion', async () => {
    const { store, a } = await seededPair();
    store.deleteUser = async (id: string) => {
      store.ops.push(`deleteUser:${id}`);
      if (id !== store.userByEmail(a.logoutAdmin.email)?.id) {
        store.users = store.users.filter(u => u.id !== id);
      }
    };

    await expect(cleanupRunScopedFixtures(store, a, envA)).rejects.toThrow(
      /left residual resources.*"logout-admin":1/
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

  it('refuses the default shared org in either slot', async () => {
    await expectRefusal(
      { ...contextFor(envA), orgId: DEFAULT_E2E_ORG_ID },
      envA,
      /: org id is not the run-scoped org id/
    );
    await expectRefusal(
      { ...contextFor(envA), secondaryOrgId: DEFAULT_E2E_ORG_ID },
      envA,
      /secondary org id is not the run-scoped org id/
    );
  });

  it('refuses the configured shared E2E org in either slot', async () => {
    const context = contextFor(envA);
    await expectRefusal(
      context,
      { ...envA, E2E_TEST_ORG_ID: context.orgId.toUpperCase() },
      /: org id is a shared E2E organization/
    );
    await expectRefusal(
      context,
      { ...envA, E2E_TEST_ORG_ID: context.secondaryOrgId },
      /secondary org id is a shared E2E organization/
    );
  });

  it('refuses an org id from a different scope or slot', async () => {
    const a = contextFor(envA);
    const b = contextFor(envB);
    await expectRefusal(
      { ...a, orgId: deriveE2EOrgId(b.scopeKey) },
      envA,
      /: org id is not the run-scoped org id/
    );
    await expectRefusal(
      { ...a, secondaryOrgId: b.secondaryOrgId },
      envA,
      /secondary org id is not the run-scoped org id/
    );
    await expectRefusal(
      { ...a, secondaryOrgId: a.orgId },
      envA,
      /secondary org id is not the run-scoped org id/
    );
  });

  it('refuses a secondary org name that is not the derived one', async () => {
    const a = contextFor(envA);
    await expectRefusal(
      { ...a, secondaryOrgName: a.orgName },
      envA,
      /secondary org name is not the run-scoped org name/
    );
  });

  it('refuses an email without the run-scope marker', async () => {
    const context = contextFor(envA);
    const b = contextFor(envB);
    await expectRefusal(
      { ...context, admin: { ...context.admin, email: 'qa@example.com' } },
      envA,
      /admin email does not carry the run-scope marker/
    );
    await expectRefusal(
      {
        ...context,
        member: { ...context.member, email: b.member.email },
      },
      envA,
      /member email does not carry the run-scope marker/
    );
    await expectRefusal(
      {
        ...context,
        logoutAdmin: {
          ...context.logoutAdmin,
          email: b.logoutAdmin.email,
        },
      },
      envA,
      /logout-admin email does not carry the run-scope marker/
    );
    await expectRefusal(
      {
        ...context,
        secondaryAdmin: {
          ...context.secondaryAdmin,
          email: b.secondaryAdmin.email,
        },
      },
      envA,
      /secondary-admin email does not carry the run-scope marker/
    );
  });

  it('refuses identities that collapse onto the same auth user', async () => {
    const context = contextFor(envA);
    await expectRefusal(
      { ...context, logoutAdmin: { ...context.admin } },
      envA,
      /run-scoped identities do not resolve to distinct users/
    );
  });

  it('refuses a logout admin homed in the wrong org or with the wrong role', async () => {
    const context = contextFor(envA);
    await expectRefusal(
      {
        ...context,
        logoutAdmin: {
          ...context.logoutAdmin,
          orgId: context.secondaryOrgId,
        },
      },
      envA,
      /logout-admin org id is not the run-scoped primary org id/
    );
    await expectRefusal(
      {
        ...context,
        logoutAdmin: { ...context.logoutAdmin, role: 'member' },
      },
      envA,
      /logout-admin role is not admin/
    );
  });

  it('refuses a secondary admin that collapses onto the primary admin', async () => {
    const context = contextFor(envA);
    await expectRefusal(
      { ...context, secondaryAdmin: { ...context.admin } },
      envA,
      /run-scoped identities do not resolve to distinct users/
    );
  });

  it('refuses a secondary admin homed in the wrong org or with the wrong role', async () => {
    const context = contextFor(envA);
    await expectRefusal(
      {
        ...context,
        secondaryAdmin: { ...context.secondaryAdmin, orgId: context.orgId },
      },
      envA,
      /secondary-admin org id is not the run-scoped secondary org id/
    );
    await expectRefusal(
      {
        ...context,
        secondaryAdmin: { ...context.secondaryAdmin, role: 'member' },
      },
      envA,
      /secondary-admin role is not admin/
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
      const member = store.userByEmail(a.member.email);
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
      const admin = store.userByEmail(a.admin.email);
      if (admin) admin.app_metadata = { org_id: a.orgId, role: 'admin' };
    });
  });

  it.each([
    [
      'is not e2e_managed',
      /logout-admin user is not marked e2e_managed/,
      (meta: Record<string, unknown>) => ({ ...meta, e2e_managed: false }),
    ],
    [
      'carries another run scope',
      /logout-admin user belongs to a different run scope/,
      (meta: Record<string, unknown>) => ({
        ...meta,
        e2e_run_scope: contextFor(envB).scopeKey,
      }),
    ],
    [
      'is homed in the secondary org',
      /logout-admin user belongs to a different organization/,
      (meta: Record<string, unknown>) => ({
        ...meta,
        org_id: contextFor(envA).secondaryOrgId,
      }),
    ],
    [
      'has a different role',
      /logout-admin user has a different role/,
      (meta: Record<string, unknown>) => ({ ...meta, role: 'member' }),
    ],
  ])(
    'refuses (before any delete) when the logout admin %s',
    async (_label, pattern, mutate) => {
      const a = contextFor(envA);
      await expectRefusal(a, envA, pattern, store => {
        const user = store.userByEmail(a.logoutAdmin.email);
        if (!user) throw new Error('expected a seeded logout admin');
        user.app_metadata = mutate(user.app_metadata);
      });
    }
  );

  it.each([
    [
      'is not e2e_managed',
      /secondary-admin user is not marked e2e_managed/,
      (meta: Record<string, unknown>) => ({ ...meta, e2e_managed: false }),
    ],
    [
      'carries another run scope',
      /secondary-admin user belongs to a different run scope/,
      (meta: Record<string, unknown>) => ({
        ...meta,
        e2e_run_scope: contextFor(envB).scopeKey,
      }),
    ],
    [
      'is homed in the primary org',
      /secondary-admin user belongs to a different organization/,
      (meta: Record<string, unknown>) => ({
        ...meta,
        org_id: contextFor(envA).orgId,
      }),
    ],
    [
      'is homed in another run’s secondary org',
      /secondary-admin user belongs to a different organization/,
      (meta: Record<string, unknown>) => ({
        ...meta,
        org_id: contextFor(envB).secondaryOrgId,
      }),
    ],
    [
      'has a different role',
      /secondary-admin user has a different role/,
      (meta: Record<string, unknown>) => ({ ...meta, role: 'member' }),
    ],
  ])(
    'refuses (before any delete) when the secondary admin %s',
    async (_label, pattern, mutate) => {
      const a = contextFor(envA);
      await expectRefusal(a, envA, pattern, store => {
        const user = store.userByEmail(a.secondaryAdmin.email);
        if (!user) throw new Error('expected a seeded secondary admin');
        user.app_metadata = mutate(user.app_metadata);
      });
    }
  );

  it('refuses a foreign secondary admin even when the rest of setup never ran', async () => {
    const store = new FakeStore();
    const a = contextFor(envA);
    store.orgs.set(a.orgId, a.orgName);
    store.users.push({
      id: 'foreign-secondary',
      email: a.secondaryAdmin.email,
      app_metadata: { org_id: a.secondaryOrgId, role: 'admin' },
    });
    store.ops = [];

    await expect(cleanupRunScopedFixtures(store, a, envA)).rejects.toThrow(
      /secondary-admin user is not marked e2e_managed/
    );
    expect(store.mutations()).toEqual([]);
    expect(store.orgs.has(a.orgId)).toBe(true);
    expect(store.users).toHaveLength(1);
  });

  it('refuses when an org with a derived id is not ours', async () => {
    const a = contextFor(envA);
    await expectRefusal(a, envA, /unexpected name/, store => {
      store.orgs.set(a.orgId, 'HC Violins and Bows');
    });
    await expectRefusal(
      a,
      envA,
      /secondary organization with the run-scoped id has an unexpected name/,
      store => {
        store.orgs.set(a.secondaryOrgId, 'HC Violins and Bows');
      }
    );
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
