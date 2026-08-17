import type { SupabaseClient } from '@supabase/supabase-js';

import { AUTH_MATRIX_ORG_A_ID, AUTH_MATRIX_ORG_B_ID } from './constants';
import type { RuntimeFixtureManifest } from './runtime-manifest';
import { parseRuntimeManifest } from './runtime-manifest';

export type HostedCleanupPlan = {
  runId: string;
  deleteClientsById: string[];
  deleteInstrumentsById: string[];
  deleteOrganizationsById: string[];
  deleteAuthUsersById: string[];
};

const CHILD_DELETES: Array<{
  table: string;
  column: 'instrument_id' | 'client_id';
  source: 'instrumentIds' | 'clientIds';
}> = [
  { table: 'client_instruments', column: 'client_id', source: 'clientIds' },
  {
    table: 'client_instruments',
    column: 'instrument_id',
    source: 'instrumentIds',
  },
  {
    table: 'instrument_certificates',
    column: 'instrument_id',
    source: 'instrumentIds',
  },
  {
    table: 'instrument_images',
    column: 'instrument_id',
    source: 'instrumentIds',
  },
  {
    table: 'maintenance_tasks',
    column: 'instrument_id',
    source: 'instrumentIds',
  },
  { table: 'sales_history', column: 'instrument_id', source: 'instrumentIds' },
  { table: 'sales_history', column: 'client_id', source: 'clientIds' },
];

function isAlreadyGone(
  error: {
    message?: string;
    code?: string;
  } | null
): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  const message = (error.message ?? '').toLowerCase();
  return (
    code === 'PGRST116' ||
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('already deleted')
  );
}

export function planHostedCleanup(
  manifest: RuntimeFixtureManifest
): HostedCleanupPlan {
  const parsed = parseRuntimeManifest(manifest);
  return {
    runId: parsed.runId,
    deleteClientsById: [...parsed.clientIds],
    deleteInstrumentsById: [...parsed.instrumentIds],
    deleteOrganizationsById: [...parsed.orgIds],
    deleteAuthUsersById: [...parsed.authUserIds],
  };
}

async function deleteByIds(
  admin: SupabaseClient,
  table: string,
  column: string,
  ids: string[],
  errors: string[]
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const { error } = await admin.from(table).delete().in(column, ids);
  if (error && !isAlreadyGone(error)) {
    errors.push(`${table}.${column}: ${error.message}`);
  }
}

export async function executeHostedCleanup(
  admin: SupabaseClient,
  manifest: RuntimeFixtureManifest
): Promise<HostedCleanupPlan> {
  const plan = planHostedCleanup(manifest);
  const errors: string[] = [];

  for (const child of CHILD_DELETES) {
    const ids =
      child.source === 'clientIds'
        ? plan.deleteClientsById
        : plan.deleteInstrumentsById;
    await deleteByIds(admin, child.table, child.column, ids, errors);
  }

  await deleteByIds(admin, 'clients', 'id', plan.deleteClientsById, errors);
  await deleteByIds(
    admin,
    'instruments',
    'id',
    plan.deleteInstrumentsById,
    errors
  );
  await deleteByIds(
    admin,
    'organizations',
    'id',
    plan.deleteOrganizationsById,
    errors
  );

  for (const userId of plan.deleteAuthUsersById) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !isAlreadyGone(error)) {
      errors.push(`auth.user:${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Auth matrix cleanup failed: ${errors.join('; ')}`);
  }

  return plan;
}

export async function cleanupLocalAuthMatrixFixtures(
  admin: SupabaseClient
): Promise<void> {
  const localOrgIds = [AUTH_MATRIX_ORG_A_ID, AUTH_MATRIX_ORG_B_ID];
  const errors: string[] = [];

  await deleteByIds(admin, 'clients', 'org_id', localOrgIds, errors);
  await deleteByIds(admin, 'instruments', 'org_id', localOrgIds, errors);
  await deleteByIds(admin, 'organizations', 'id', localOrgIds, errors);

  if (errors.length > 0) {
    throw new Error(`Local auth matrix cleanup failed: ${errors.join('; ')}`);
  }
}
