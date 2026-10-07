import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { assertE2EStagingProjectAllowlist } from '../../scripts/assert-e2e-staging-project-allowlist';
import {
  DEFAULT_E2E_ORG_ID,
  assertE2ERunScopeKey,
  deriveE2EOrgId,
  deriveE2EOrgName,
  deriveE2EScopedEmail,
  e2eScopedEmailMarker,
  getE2EAdminIdentity,
  getE2EMemberIdentity,
  getE2ERunScope,
  normalizeE2ERunScope,
  type E2EEnv,
  type E2EIdentity,
} from './e2e-identities';

/**
 * Every public table carrying org_id. All but api_create_idempotency reference
 * public.organizations(id) ON DELETE CASCADE, so deleting the exact run org
 * removes them; api_create_idempotency has no FK and is deleted explicitly.
 * instrument_images / instrument_certificates have no org_id and cascade via
 * instruments(id). sale_auth.sold_transition_authorization rows never outlive
 * their transaction. A contract test keeps this list in sync with migrations.
 */
export const ORG_SCOPED_TABLES = [
  'api_create_idempotency',
  'audit_log',
  'client_instruments',
  'clients',
  'contact_logs',
  'instrument_create_idempotency',
  'instruments',
  'invoice_idempotency_keys',
  'invoice_image_uploads',
  'invoice_items',
  'invoice_settings',
  'invoices',
  'maintenance_tasks',
  'notes',
  'notification_settings',
  'orphaned_storage_objects',
  'sales_history',
  'sales_idempotency_keys',
] as const;

export const ORG_SCOPED_TABLES_WITHOUT_ORG_FK = [
  'api_create_idempotency',
] as const;

export type RunScopedE2EContext = {
  scope: string;
  scopeKey: string;
  orgId: string;
  orgName: string;
  admin: E2EIdentity;
  member: E2EIdentity;
};

export type RunScopedUser = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

export type RunScopedUserAttributes = {
  email: string;
  password: string;
  email_confirm: true;
  app_metadata: Record<string, unknown>;
};

/** The only service-role operations run-scoped setup/cleanup may perform. */
export interface RunScopedE2EStore {
  findOrganization(id: string): Promise<{ id: string; name: string } | null>;
  insertOrganization(row: { id: string; name: string }): Promise<void>;
  deleteRows(table: string, column: string, value: string): Promise<void>;
  countRows(table: string, column: string, value: string): Promise<number>;
  findUserByEmail(email: string): Promise<RunScopedUser | null>;
  createUser(attributes: RunScopedUserAttributes): Promise<RunScopedUser>;
  updateUser(id: string, attributes: RunScopedUserAttributes): Promise<void>;
  deleteUser(id: string): Promise<void>;
}

export type RunScopedSeedSummary = {
  scopeKey: string;
  orgId: string;
  orgCreated: boolean;
  users: Array<{ role: E2EIdentity['role']; userId: string; created: boolean }>;
};

export type RunScopedCleanupSummary = {
  scopeKey: string;
  orgId: string;
  organizationFound: boolean;
  authUsersDeleted: Array<E2EIdentity['role']>;
  rowsBefore: Record<string, number>;
  residual: Record<string, number>;
  residualTotal: number;
};

/** Null for a local legacy run; throws in hosted mode without a scope. */
export function resolveRunScopedE2EContext(
  env: E2EEnv = process.env
): RunScopedE2EContext | null {
  const scope = getE2ERunScope(env);
  if (scope === null) return null;

  const scopeKey = normalizeE2ERunScope(scope);
  return {
    scope,
    scopeKey,
    orgId: deriveE2EOrgId(scopeKey),
    orgName: deriveE2EOrgName(scopeKey),
    admin: getE2EAdminIdentity(env),
    member: getE2EMemberIdentity(env),
  };
}

export function runScopedAppMetadata(
  context: RunScopedE2EContext,
  identity: E2EIdentity
): Record<string, unknown> {
  return {
    org_id: context.orgId,
    role: identity.role,
    e2e_managed: true,
    e2e_run_scope: context.scopeKey,
  };
}

function refuse(reason: string): never {
  throw new Error(`Run-scoped E2E fixture access refused: ${reason}`);
}

/**
 * Fail-closed gate shared by setup and cleanup. Cleanup additionally
 * requires CI or the critical suite.
 */
export function assertRunScopedFixtureAccessAllowed(
  context: RunScopedE2EContext | null,
  env: E2EEnv,
  purpose: 'setup' | 'cleanup'
): asserts context is RunScopedE2EContext {
  if (!context || !context.scope.trim()) {
    refuse('E2E_RUN_SCOPE is empty.');
  }
  if (
    purpose === 'cleanup' &&
    env.CI !== 'true' &&
    env.PLAYWRIGHT_SUITE !== 'critical'
  ) {
    refuse('cleanup only runs in CI or the critical suite.');
  }

  assertE2ERunScopeKey(context.scopeKey);
  if (context.scopeKey !== normalizeE2ERunScope(context.scope)) {
    refuse('scope key does not match E2E_RUN_SCOPE.');
  }

  if (context.orgId !== deriveE2EOrgId(context.scopeKey)) {
    refuse('org id is not the run-scoped org id.');
  }
  const sharedOrgId = env.E2E_TEST_ORG_ID?.trim().toLowerCase();
  if (
    context.orgId === DEFAULT_E2E_ORG_ID ||
    (sharedOrgId && context.orgId.toLowerCase() === sharedOrgId)
  ) {
    refuse('org id is a shared E2E organization.');
  }
  if (context.orgName !== deriveE2EOrgName(context.scopeKey)) {
    refuse('org name is not the run-scoped org name.');
  }

  const marker = e2eScopedEmailMarker(context.scopeKey);
  for (const identity of [context.admin, context.member]) {
    if (
      identity.email !==
        deriveE2EScopedEmail(context.scopeKey, identity.role) ||
      !identity.email.startsWith(marker)
    ) {
      refuse(`${identity.role} email does not carry the run-scope marker.`);
    }
    if (identity.orgId !== context.orgId) {
      refuse(`${identity.role} org id is not the run-scoped org id.`);
    }
  }
  if (context.admin.email === context.member.email) {
    refuse('admin and member resolve to the same identity.');
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    refuse('SUPABASE_SERVICE_ROLE_KEY is missing.');
  }

  try {
    assertE2EStagingProjectAllowlist(env);
  } catch (error) {
    refuse(error instanceof Error ? error.message : String(error));
  }
}

/** Throws unless `user` is exactly this run's managed identity. */
export function assertRunScopedUserOwnership(
  user: RunScopedUser,
  context: RunScopedE2EContext,
  identity: E2EIdentity
): void {
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
  if ((user.email ?? '').toLowerCase() !== identity.email.toLowerCase()) {
    refuse(`${identity.role} user email does not match the run-scoped email.`);
  }
  if (meta.e2e_managed !== true) {
    refuse(`${identity.role} user is not marked e2e_managed.`);
  }
  if (meta.e2e_run_scope !== context.scopeKey) {
    refuse(`${identity.role} user belongs to a different run scope.`);
  }
  if (meta.org_id !== context.orgId) {
    refuse(`${identity.role} user belongs to a different organization.`);
  }
  if (meta.role !== identity.role) {
    refuse(`${identity.role} user has a different role.`);
  }
}

async function findOwnedOrganization(
  store: RunScopedE2EStore,
  context: RunScopedE2EContext
): Promise<boolean> {
  const org = await store.findOrganization(context.orgId);
  if (!org) return false;
  if (org.name !== context.orgName) {
    refuse('organization with the run-scoped id has an unexpected name.');
  }
  return true;
}

/**
 * Creates (or, for a rerun of the same scope, re-verifies) this run's org,
 * admin, and member. Never reads or writes another scope's resources:
 * lookups are by the exact derived org id and emails, and an existing user
 * is only updated after its run-scope metadata is verified.
 */
export async function seedRunScopedFixtures(
  store: RunScopedE2EStore,
  context: RunScopedE2EContext,
  env: E2EEnv = process.env
): Promise<RunScopedSeedSummary> {
  assertRunScopedFixtureAccessAllowed(context, env, 'setup');

  const orgExists = await findOwnedOrganization(store, context);
  if (!orgExists) {
    await store.insertOrganization({
      id: context.orgId,
      name: context.orgName,
    });
  }

  const users: RunScopedSeedSummary['users'] = [];
  for (const identity of [context.admin, context.member]) {
    const attributes: RunScopedUserAttributes = {
      email: identity.email,
      password: identity.password,
      email_confirm: true,
      app_metadata: runScopedAppMetadata(context, identity),
    };
    const existing = await store.findUserByEmail(identity.email);
    if (existing) {
      assertRunScopedUserOwnership(existing, context, identity);
      await store.updateUser(existing.id, attributes);
      users.push({ role: identity.role, userId: existing.id, created: false });
    } else {
      const created = await store.createUser(attributes);
      users.push({ role: identity.role, userId: created.id, created: true });
    }
  }

  return {
    scopeKey: context.scopeKey,
    orgId: context.orgId,
    orgCreated: !orgExists,
    users,
  };
}

async function countRunScopedRows(
  store: RunScopedE2EStore,
  orgId: string
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {
    organizations: await store.countRows('organizations', 'id', orgId),
  };
  for (const table of ORG_SCOPED_TABLES) {
    counts[table] = await store.countRows(table, 'org_id', orgId);
  }
  return counts;
}

/**
 * Deletes exactly this run's org (children cascade), its FK-less
 * api_create_idempotency rows, and its two auth users, then proves nothing
 * remains. Every ownership check runs before the first delete. Safe to call
 * repeatedly: a second call finds nothing and deletes nothing.
 */
export async function cleanupRunScopedFixtures(
  store: RunScopedE2EStore,
  context: RunScopedE2EContext | null,
  env: E2EEnv = process.env
): Promise<RunScopedCleanupSummary> {
  assertRunScopedFixtureAccessAllowed(context, env, 'cleanup');

  const organizationFound = await findOwnedOrganization(store, context);
  const owned: Array<{ identity: E2EIdentity; userId: string }> = [];
  for (const identity of [context.admin, context.member]) {
    const user = await store.findUserByEmail(identity.email);
    if (!user) continue;
    assertRunScopedUserOwnership(user, context, identity);
    owned.push({ identity, userId: user.id });
  }

  const rowsBefore = await countRunScopedRows(store, context.orgId);

  for (const table of ORG_SCOPED_TABLES_WITHOUT_ORG_FK) {
    await store.deleteRows(table, 'org_id', context.orgId);
  }
  if (organizationFound) {
    await store.deleteRows('organizations', 'id', context.orgId);
  }
  for (const { userId } of owned) {
    await store.deleteUser(userId);
  }

  const residual = await countRunScopedRows(store, context.orgId);
  for (const identity of [context.admin, context.member]) {
    residual[`auth.users:${identity.role}`] = (await store.findUserByEmail(
      identity.email
    ))
      ? 1
      : 0;
  }
  const residualTotal = Object.values(residual).reduce((a, b) => a + b, 0);

  const summary: RunScopedCleanupSummary = {
    scopeKey: context.scopeKey,
    orgId: context.orgId,
    organizationFound,
    authUsersDeleted: owned.map(({ identity }) => identity.role),
    rowsBefore,
    residual,
    residualTotal,
  };

  if (residualTotal !== 0) {
    throw new Error(
      `Run-scoped E2E cleanup left residual resources: ${JSON.stringify(summary)}`
    );
  }
  return summary;
}

function throwIfError(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`);
}

export function createSupabaseRunScopedE2EStore(
  admin: SupabaseClient
): RunScopedE2EStore {
  return {
    async findOrganization(id) {
      const { data, error } = await admin
        .from('organizations')
        .select('id, name')
        .eq('id', id)
        .maybeSingle();
      throwIfError(error, 'Could not read E2E organization');
      return data ? { id: String(data.id), name: String(data.name) } : null;
    },

    async insertOrganization(row) {
      const { error } = await admin.from('organizations').insert(row);
      throwIfError(error, 'Could not create E2E organization');
    },

    async deleteRows(table, column, value) {
      const { error } = await admin.from(table).delete().eq(column, value);
      throwIfError(error, `Could not delete ${table} rows`);
    },

    async countRows(table, column, value) {
      const { count, error } = await admin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(column, value);
      throwIfError(error, `Could not count ${table} rows`);
      return count ?? 0;
    },

    async findUserByEmail(email) {
      const target = email.toLowerCase();
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({
          page,
          perPage: 1000,
        });
        throwIfError(error, 'Could not list Supabase users');
        const match = data.users.find(
          user => user.email?.toLowerCase() === target
        );
        if (match) return match;
        if (data.users.length < 1000) return null;
      }
      throw new Error('Could not find E2E auth user within first 20 pages.');
    },

    async createUser(attributes) {
      const { data, error } = await admin.auth.admin.createUser(attributes);
      throwIfError(error, 'Could not create E2E auth user');
      if (!data.user) throw new Error('E2E auth user create returned no user.');
      return data.user;
    },

    async updateUser(id, attributes) {
      const { error } = await admin.auth.admin.updateUserById(id, attributes);
      throwIfError(error, 'Could not update E2E auth user');
    },

    async deleteUser(id) {
      const { error } = await admin.auth.admin.deleteUser(id);
      throwIfError(error, 'Could not delete E2E auth user');
    },
  };
}

/**
 * Cleanup entry point for Playwright globalTeardown and the CI `if: always()`
 * safety net. Returns null for a local legacy run (no E2E_RUN_SCOPE). The
 * client targets the same URL the staging allowlist just validated.
 */
export async function cleanupCurrentRunScope(
  env: E2EEnv = process.env
): Promise<RunScopedCleanupSummary | null> {
  const context = resolveRunScopedE2EContext(env);
  if (!context) return null;

  assertRunScopedFixtureAccessAllowed(context, env, 'cleanup');
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() || env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    refuse('Supabase URL or service role key is missing.');
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cleanupRunScopedFixtures(
    createSupabaseRunScopedE2EStore(admin),
    context,
    env
  );
}
