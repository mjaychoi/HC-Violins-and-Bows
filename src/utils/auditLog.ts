import { getAdminSupabase } from '@/lib/supabase-server';
import { logError } from '@/utils/logger';

export type AuditAction =
  | 'instrument.create'
  | 'instrument.delete'
  | 'instrument.update_financial'
  | 'invoice.create'
  | 'invoice.delete'
  | 'invoice.update_financials'
  | 'invoice.update_status'
  | 'client.create'
  | 'client.delete'
  | 'client.update'
  | 'sale.create'
  | 'sale.update';

export type AuditResourceType = 'instrument' | 'invoice' | 'client' | 'sale';

export interface AuditEntry {
  orgId: string;
  actorId: string;
  actorRole: 'admin' | 'member' | 'service';
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append one row to audit_log via the service-role client.
 * Failures are logged but never rethrown — audit must not break the primary path.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const admin = getAdminSupabase();
    const { error } = await admin.from('audit_log').insert({
      org_id: entry.orgId,
      actor_id: entry.actorId,
      actor_role: entry.actorRole,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId,
      metadata: entry.metadata ?? null,
    });
    if (error) {
      logError('auditLog insert failed', new Error(error.message), 'auditLog', {
        entry,
      });
    }
  } catch (err) {
    logError(
      'auditLog unexpected error',
      err instanceof Error ? err : new Error(String(err)),
      'auditLog',
      { entry }
    );
  }
}
