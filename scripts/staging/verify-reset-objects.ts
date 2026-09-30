#!/usr/bin/env tsx
/**
 * Post-reset catalog check for objects the canonical migrations must
 * recreate. Read-only. Does not patch the database. Stdout is one JSON
 * document; connection strings are never printed.
 */
import { pathToFileURL } from 'url';
import {
  requireStagingDatabaseUrl,
  withStagingReadOnlyClient,
} from './reset-db-read';

const REQUIRED_BUCKETS = [
  'instrument-images',
  'instrument-certificates',
  'invoices',
] as const;

const REQUIRED_FUNCTIONS = ['org_id', 'user_role', 'is_admin'] as const;

const REQUIRED_POLICIES = [
  'client_instruments_select',
  'maintenance_tasks_select',
  'sales_history_select',
  'sales_history_insert',
  'invoices_select',
  'clients_insert',
  'clients_update',
  'clients_delete',
  'instruments_insert',
  'instruments_update',
  'instruments_delete',
  'client_instruments_update',
  'client_instruments_delete',
  'maintenance_tasks_update',
  'maintenance_tasks_delete',
  'contact_logs_update',
  'contact_logs_delete',
  'invoices_update',
  'invoices_delete',
  'hc_v_invoice_images_insert',
  'hc_v_invoice_images_select',
  'hc_v_invoice_images_update',
  'hc_v_invoice_images_delete',
] as const;

const REQUIRED_EXTENSIONS = ['pgcrypto', 'pg_cron', 'pg_net'] as const;

const REQUIRED_RUNTIME_CONTRACTS = [
  'api_create_idempotency_exists',
  'api_create_idempotency_columns_ok',
  'api_create_idempotency_unique_ok',
  'create_connection_atomic_hardened',
] as const;

const ORPHAN_CLEANUP_JOB = 'orphan-storage-cleanup';
const ORPHAN_CLEANUP_SCHEDULE = '*/15 * * * *';

export type ResetObjectReport = {
  passed: boolean;
  missingBuckets: string[];
  orphanCleanupCron: boolean;
  missingFunctions: string[];
  missingPolicies: string[];
  missingGrants: string[];
  failedRuntimeContracts: string[];
  missingExtensions: string[];
};

function missingFrom<T extends string>(
  required: readonly T[],
  present: ReadonlySet<string>
): T[] {
  return required.filter(name => !present.has(name));
}

async function main(): Promise<void> {
  const databaseUrl = requireStagingDatabaseUrl(
    process.env.STAGING_DATABASE_URL
  );

  const report = await withStagingReadOnlyClient(
    databaseUrl,
    async (client): Promise<ResetObjectReport> => {
      const buckets = await client.query<{ id: string; is_public: boolean }>(
        `SELECT id, public AS is_public
           FROM storage.buckets
          WHERE id = ANY($1::text[])`,
        [REQUIRED_BUCKETS]
      );
      const presentBuckets = new Set(
        buckets.rows.filter(row => row.is_public === false).map(row => row.id)
      );

      const cron = await client.query<{ active: boolean; schedule: string }>(
        `SELECT active, schedule
           FROM cron.job
          WHERE jobname = $1`,
        [ORPHAN_CLEANUP_JOB]
      );
      const orphanCleanupCron =
        cron.rows.length === 1 &&
        cron.rows[0]?.active === true &&
        cron.rows[0]?.schedule === ORPHAN_CLEANUP_SCHEDULE;

      const functions = await client.query<{ proname: string }>(
        `SELECT p.proname
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = ANY($1::text[])`,
        [REQUIRED_FUNCTIONS]
      );

      const policies = await client.query<{ policyname: string }>(
        `SELECT policyname
           FROM pg_policies
          WHERE policyname = ANY($1::text[])`,
        [REQUIRED_POLICIES]
      );

      const grants = await client.query<{
        authenticated_select: boolean;
        service_role_select: boolean;
        public_select: boolean;
        authenticated_execute_create_connection: boolean;
      }>(
        `SELECT
           has_table_privilege('authenticated', 'public.runtime_contract_checks', 'SELECT')
             AS authenticated_select,
           has_table_privilege('service_role', 'public.runtime_contract_checks', 'SELECT')
             AS service_role_select,
           has_table_privilege('public', 'public.runtime_contract_checks', 'SELECT')
             AS public_select,
           has_function_privilege(
             'authenticated',
             'public.create_connection_atomic(uuid,uuid,text,text)',
             'EXECUTE'
           ) AS authenticated_execute_create_connection`
      );
      const grantRow = grants.rows[0];
      const missingGrants: string[] = [];
      if (!grantRow?.authenticated_select) {
        missingGrants.push(
          'authenticated SELECT on public.runtime_contract_checks'
        );
      }
      if (!grantRow?.service_role_select) {
        missingGrants.push(
          'service_role SELECT on public.runtime_contract_checks'
        );
      }
      if (grantRow?.public_select !== false) {
        missingGrants.push(
          'PUBLIC SELECT on public.runtime_contract_checks must stay revoked'
        );
      }
      if (!grantRow?.authenticated_execute_create_connection) {
        missingGrants.push(
          'authenticated EXECUTE on public.create_connection_atomic(uuid,uuid,text,text)'
        );
      }

      const contracts = await client.query<
        Record<(typeof REQUIRED_RUNTIME_CONTRACTS)[number], boolean>
      >(
        `SELECT
           api_create_idempotency_exists,
           api_create_idempotency_columns_ok,
           api_create_idempotency_unique_ok,
           create_connection_atomic_hardened
         FROM public.runtime_contract_checks`
      );
      const contractRow = contracts.rows[0];
      const failedRuntimeContracts = REQUIRED_RUNTIME_CONTRACTS.filter(
        name => contractRow?.[name] !== true
      );

      const extensions = await client.query<{ extname: string }>(
        `SELECT extname
           FROM pg_extension
          WHERE extname = ANY($1::text[])`,
        [REQUIRED_EXTENSIONS]
      );

      const missingBuckets = missingFrom(REQUIRED_BUCKETS, presentBuckets);
      const missingFunctions = missingFrom(
        REQUIRED_FUNCTIONS,
        new Set(functions.rows.map(row => row.proname))
      );
      const missingPolicies = missingFrom(
        REQUIRED_POLICIES,
        new Set(policies.rows.map(row => row.policyname))
      );
      const missingExtensions = missingFrom(
        REQUIRED_EXTENSIONS,
        new Set(extensions.rows.map(row => row.extname))
      );

      return {
        passed:
          missingBuckets.length === 0 &&
          orphanCleanupCron &&
          missingFunctions.length === 0 &&
          missingPolicies.length === 0 &&
          missingGrants.length === 0 &&
          failedRuntimeContracts.length === 0 &&
          missingExtensions.length === 0,
        missingBuckets,
        orphanCleanupCron,
        missingFunctions,
        missingPolicies,
        missingGrants,
        failedRuntimeContracts,
        missingExtensions,
      };
    }
  );

  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.passed) {
    console.error(
      'RESET_FAILED_POSTFLIGHT: canonical platform objects were not recreated.'
    );
    process.exit(1);
  }
  console.error('Post-reset platform object check passed.');
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectRun()) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
