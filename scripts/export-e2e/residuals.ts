import type { SupabaseClient } from '@supabase/supabase-js';

import type { RuntimeFixtureManifest } from '../auth-matrix/runtime-manifest';
import { exportRunToken } from './constants';

export type ResidualCount = {
  resource: string;
  count: number;
};

async function countWhere(
  admin: SupabaseClient,
  table: string,
  column: string,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }
  const { count, error } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .in(column, ids);
  if (error) {
    throw new Error(
      `Residual count ${table}.${column} failed: ${error.message}`
    );
  }
  return count ?? 0;
}

export async function countExportResiduals(
  admin: SupabaseClient,
  manifest: RuntimeFixtureManifest
): Promise<ResidualCount[]> {
  const token = exportRunToken(manifest.runId);
  const counts: ResidualCount[] = [];

  const tableCounts: Array<[string, string, string[]]> = [
    ['organizations', 'id', manifest.orgIds],
    ['instruments', 'id', manifest.instrumentIds],
    ['clients', 'id', manifest.clientIds],
    ['sales_history', 'org_id', manifest.orgIds],
    ['client_instruments', 'org_id', manifest.orgIds],
    ['instrument_certificates', 'instrument_id', manifest.instrumentIds],
    ['instrument_images', 'instrument_id', manifest.instrumentIds],
    ['maintenance_tasks', 'instrument_id', manifest.instrumentIds],
    ['audit_log', 'org_id', manifest.orgIds],
  ];

  for (const [table, column, ids] of tableCounts) {
    counts.push({
      resource: `${table}.${column}`,
      count: await countWhere(admin, table, column, ids),
    });
  }

  const { count: serialCount, error: serialError } = await admin
    .from('instruments')
    .select('id', { count: 'exact', head: true })
    .ilike('serial_number', `%${token}%`);
  if (serialError) {
    throw new Error(`Residual serial scan failed: ${serialError.message}`);
  }
  counts.push({
    resource: 'instruments.serial_token',
    count: serialCount ?? 0,
  });

  const { count: emailCount, error: emailError } = await admin
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .ilike('email', `export-e2e-${manifest.runId}%`);
  if (emailError) {
    throw new Error(`Residual client email scan failed: ${emailError.message}`);
  }
  counts.push({ resource: 'clients.email_token', count: emailCount ?? 0 });

  const { count: noteCount, error: noteError } = await admin
    .from('sales_history')
    .select('id', { count: 'exact', head: true })
    .ilike('notes', `%${token}%`);
  if (noteError) {
    throw new Error(`Residual sale note scan failed: ${noteError.message}`);
  }
  counts.push({ resource: 'sales_history.notes_token', count: noteCount ?? 0 });

  let authUsers = 0;
  for (const userId of manifest.authUserIds) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes('not found') || message.includes('user not found')) {
        continue;
      }
      throw new Error(`Residual auth user lookup failed: ${error.message}`);
    }
    if (data.user) {
      authUsers += 1;
    }
  }
  counts.push({ resource: 'auth.users', count: authUsers });
  return counts;
}

export function residualTotal(counts: ResidualCount[]): number {
  return counts.reduce((sum, item) => sum + item.count, 0);
}
