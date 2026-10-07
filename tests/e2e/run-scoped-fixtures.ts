import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { assertE2EStagingProjectAllowlist } from '../../scripts/assert-e2e-staging-project-allowlist';
import {
  DEFAULT_E2E_ORG_ID,
  E2E_SECONDARY_ORG_SLOT,
  assertE2ERunScopeKey,
  deriveE2EOrgId,
  deriveE2EOrgName,
  deriveE2EScopedEmail,
  e2eScopedEmailMarker,
  getE2EAdminIdentity,
  getE2EMemberIdentity,
  getE2ERunScope,
  getE2ESecondaryAdminIdentity,
  normalizeE2ERunScope,
  type E2EEnv,
  type E2EIdentity,
  type E2EIdentityLabel,
  type E2EOrgSlot,
  type E2ERole,
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

/**
 * One E2E run owns two organizations, both derived from the same run scope:
 * the primary org (admin + member) and a secondary org (secondary admin) that
 * cross-tenant specs use as the "other tenant". Neither is ever shared with
 * another run.
 */
export type RunScopedE2EContext = {
  scope: string;
  scopeKey: string;
  orgId: string;
  orgName: string;
  secondaryOrgId: string;
  secondaryOrgName: string;
  admin: E2EIdentity;
  member: E2EIdentity;
  secondaryAdmin: E2EIdentity;
};

export type RunScopedOrg = { slot: E2EOrgSlot; id: string; name: string };

/** A run-scoped auth user: its email label, home org slot, and role. */
export type RunScopedManagedIdentity = {
  label: E2EIdentityLabel;
  slot: E2EOrgSlot;
  role: E2ERole;
  identity: E2EIdentity;
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
  orgs: Array<{ slot: E2EOrgSlot; orgId: string; created: boolean }>;
  users: Array<{
    label: E2EIdentityLabel;
    role: E2ERole;
    userId: string;
    created: boolean;
  }>;
};

export type RunScopedCleanupSummary = {
  scopeKey: string;
  orgs: Array<{
    slot: E2EOrgSlot;
    orgId: string;
    organizationFound: boolean;
    rowsBefore: Record<string, number>;
    residual: Record<string, number>;
  }>;
  authUsersDeleted: E2EIdentityLabel[];
  authUsersResidual: Partial<Record<E2EIdentityLabel, number>>;
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
    secondaryOrgId: deriveE2EOrgId(scopeKey, E2E_SECONDARY_ORG_SLOT),
    secondaryOrgName: deriveE2EOrgName(scopeKey, E2E_SECONDARY_ORG_SLOT),
    admin: getE2EAdminIdentity(env),
    member: getE2EMemberIdentity(env),
    secondaryAdmin: getE2ESecondaryAdminIdentity(env),
  };
}

/** Both run-scoped orgs, primary first. */
export function runScopedOrgs(context: RunScopedE2EContext): RunScopedOrg[] {
  return [
    { slot: 'primary', id: context.orgId, name: context.orgName },
    {
      slot: E2E_SECONDARY_ORG_SLOT,
      id: context.secondaryOrgId,
      name: context.secondaryOrgName,
    },
  ];
}

/** Every run-scoped auth user, with the slot and role it must carry. */
export function runScopedIdentities(
  context: RunScopedE2EContext
): RunScopedManagedIdentity[] {
  return [
    { label: 'admin', slot: 'primary', role: 'admin', identity: context.admin },
    {
      label: 'member',
      slot: 'primary',
      role: 'member',
      identity: context.member,
    },
    {
      label: 'secondary-admin',
      slot: E2E_SECONDARY_ORG_SLOT,
      role: 'admin',
      identity: context.secondaryAdmin,
    },
  ];
}

function orgIdForSlot(context: RunScopedE2EContext, slot: E2EOrgSlot): string {
  return slot === 'primary' ? context.orgId : context.secondaryOrgId;
}

export function runScopedAppMetadata(
  context: RunScopedE2EContext,
  managed: RunScopedManagedIdentity
): Record<string, unknown> {
  return {
    org_id: orgIdForSlot(context, managed.slot),
    role: managed.role,
    e2e_managed: true,
    e2e_run_scope: context.scopeKey,
  };
}

function refuse(reason: string): never {
  throw new Error(`Run-scoped E2E fixture access refused: ${reason}`);
}

function slotPrefix(slot: E2EOrgSlot): string {
  return slot === 'primary' ? '' : `${slot} `;
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

  const sharedOrgId = env.E2E_TEST_ORG_ID?.trim().toLowerCase();
  for (const org of runScopedOrgs(context)) {
    const prefix = slotPrefix(org.slot);
    if (org.id !== deriveE2EOrgId(context.scopeKey, org.slot)) {
      refuse(`${prefix}org id is not the run-scoped org id.`);
    }
    if (
      org.id === DEFAULT_E2E_ORG_ID ||
      (sharedOrgId && org.id.toLowerCase() === sharedOrgId)
    ) {
      refuse(`${prefix}org id is a shared E2E organization.`);
    }
    if (org.name !== deriveE2EOrgName(context.scopeKey, org.slot)) {
      refuse(`${prefix}org name is not the run-scoped org name.`);
    }
  }
  if (context.orgId === context.secondaryOrgId) {
    refuse('primary and secondary orgs resolve to the same organization.');
  }

  const marker = e2eScopedEmailMarker(context.scopeKey);
  const managed = runScopedIdentities(context);
  for (const { label, slot, role, identity } of managed) {
    if (
      identity.email !== deriveE2EScopedEmail(context.scopeKey, label) ||
      !identity.email.startsWith(marker)
    ) {
      refuse(`${label} email does not carry the run-scope marker.`);
    }
    if (identity.orgId !== orgIdForSlot(context, slot)) {
      refuse(`${label} org id is not the run-scoped ${slot} org id.`);
    }
    if (identity.role !== role) {
      refuse(`${label} role is not ${role}.`);
    }
  }
  const emails = new Set(managed.map(m => m.identity.email.toLowerCase()));
  if (emails.size !== managed.length) {
    refuse('run-scoped identities do not resolve to distinct users.');
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
  managed: RunScopedManagedIdentity
): void {
  const { label, slot, role, identity } = managed;
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
  if ((user.email ?? '').toLowerCase() !== identity.email.toLowerCase()) {
    refuse(`${label} user email does not match the run-scoped email.`);
  }
  if (meta.e2e_managed !== true) {
    refuse(`${label} user is not marked e2e_managed.`);
  }
  if (meta.e2e_run_scope !== context.scopeKey) {
    refuse(`${label} user belongs to a different run scope.`);
  }
  if (meta.org_id !== orgIdForSlot(context, slot)) {
    refuse(`${label} user belongs to a different organization.`);
  }
  if (meta.role !== role) {
    refuse(`${label} user has a different role.`);
  }
}

async function findOwnedOrganization(
  store: RunScopedE2EStore,
  org: RunScopedOrg
): Promise<boolean> {
  const found = await store.findOrganization(org.id);
  if (!found) return false;
  if (found.name !== org.name) {
    refuse(
      `${slotPrefix(org.slot)}organization with the run-scoped id has an unexpected name.`
    );
  }
  return true;
}

/**
 * Looks up both orgs and all three users, verifying ownership of everything
 * that already exists. Read-only: callers write only after this returns.
 */
async function findOwnedResources(
  store: RunScopedE2EStore,
  context: RunScopedE2EContext
) {
  const orgs: Array<{ org: RunScopedOrg; found: boolean }> = [];
  for (const org of runScopedOrgs(context)) {
    orgs.push({ org, found: await findOwnedOrganization(store, org) });
  }
  const users: Array<{
    managed: RunScopedManagedIdentity;
    user: RunScopedUser | null;
  }> = [];
  for (const managed of runScopedIdentities(context)) {
    const user = await store.findUserByEmail(managed.identity.email);
    if (user) assertRunScopedUserOwnership(user, context, managed);
    users.push({ managed, user });
  }
  return { orgs, users };
}

/**
 * Creates (or, for a rerun of the same scope, re-verifies) this run's two
 * orgs and three users. Never reads or writes another scope's resources:
 * lookups are by the exact derived org ids and emails, and every existing
 * org/user is verified before the first write.
 */
export async function seedRunScopedFixtures(
  store: RunScopedE2EStore,
  context: RunScopedE2EContext,
  env: E2EEnv = process.env
): Promise<RunScopedSeedSummary> {
  assertRunScopedFixtureAccessAllowed(context, env, 'setup');

  const existing = await findOwnedResources(store, context);

  const orgs: RunScopedSeedSummary['orgs'] = [];
  for (const { org, found } of existing.orgs) {
    if (!found) {
      await store.insertOrganization({ id: org.id, name: org.name });
    }
    orgs.push({ slot: org.slot, orgId: org.id, created: !found });
  }

  const users: RunScopedSeedSummary['users'] = [];
  for (const { managed, user } of existing.users) {
    const attributes: RunScopedUserAttributes = {
      email: managed.identity.email,
      password: managed.identity.password,
      email_confirm: true,
      app_metadata: runScopedAppMetadata(context, managed),
    };
    let userId: string;
    if (user) {
      await store.updateUser(user.id, attributes);
      userId = user.id;
    } else {
      userId = (await store.createUser(attributes)).id;
    }
    users.push({
      label: managed.label,
      role: managed.role,
      userId,
      created: !user,
    });
  }

  return { scopeKey: context.scopeKey, orgs, users };
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

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * Deletes exactly this run's two orgs (children cascade), their FK-less
 * api_create_idempotency rows, and the three auth users, then proves nothing
 * remains. Every ownership check runs before the first delete. Safe to call
 * repeatedly, and after a partial setup: whatever is missing is skipped.
 */
export async function cleanupRunScopedFixtures(
  store: RunScopedE2EStore,
  context: RunScopedE2EContext | null,
  env: E2EEnv = process.env
): Promise<RunScopedCleanupSummary> {
  assertRunScopedFixtureAccessAllowed(context, env, 'cleanup');

  const existing = await findOwnedResources(store, context);

  const rowsBefore = new Map<string, Record<string, number>>();
  for (const { org } of existing.orgs) {
    rowsBefore.set(org.id, await countRunScopedRows(store, org.id));
  }

  for (const { org, found } of existing.orgs) {
    for (const table of ORG_SCOPED_TABLES_WITHOUT_ORG_FK) {
      await store.deleteRows(table, 'org_id', org.id);
    }
    if (found) {
      await store.deleteRows('organizations', 'id', org.id);
    }
  }
  const authUsersDeleted: E2EIdentityLabel[] = [];
  for (const { managed, user } of existing.users) {
    if (!user) continue;
    await store.deleteUser(user.id);
    authUsersDeleted.push(managed.label);
  }

  const orgs: RunScopedCleanupSummary['orgs'] = [];
  for (const { org, found } of existing.orgs) {
    orgs.push({
      slot: org.slot,
      orgId: org.id,
      organizationFound: found,
      rowsBefore: rowsBefore.get(org.id) ?? {},
      residual: await countRunScopedRows(store, org.id),
    });
  }
  const authUsersResidual: RunScopedCleanupSummary['authUsersResidual'] = {};
  for (const { label, identity } of runScopedIdentities(context)) {
    authUsersResidual[label] = (await store.findUserByEmail(identity.email))
      ? 1
      : 0;
  }
  const residualTotal =
    sum(orgs.map(org => sum(Object.values(org.residual)))) +
    sum(Object.values(authUsersResidual));

  const summary: RunScopedCleanupSummary = {
    scopeKey: context.scopeKey,
    orgs,
    authUsersDeleted,
    authUsersResidual,
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
