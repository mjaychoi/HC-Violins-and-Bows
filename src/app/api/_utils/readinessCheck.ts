import { checkMigrations } from '@/app/api/_utils/healthCheck';
import { checkSchemaReadiness } from '@/app/api/_utils/schemaReadiness';
import { checkInstrumentApiContractAdmin } from '@/app/api/instruments/_shared/instrumentApiContract';
import { getAdminSupabase } from '@/lib/supabase-server';
import {
  getStorageConfig,
  validateStorageRuntimeConfig,
} from '@/utils/storage/config';
import {
  READINESS_CHECK_TIMEOUT_MS,
  READINESS_TIMEOUT_MS,
} from '@/app/api/_utils/deploymentHealth';
import {
  BoundedTimeoutError,
  withBoundedTimeout,
} from '@/app/api/_utils/withBoundedTimeout';

export type CheckStatus = 'ok' | 'failed' | 'unknown';

export type ReadinessCheckName = 'configuration' | 'database' | 'schema';

export type ReadinessChecks = Record<ReadinessCheckName, CheckStatus>;

export type ReadinessCode =
  | 'ok'
  | 'missing_supabase_url'
  | 'invalid_supabase_url'
  | 'missing_supabase_anon_key'
  | 'missing_service_role_key'
  | 'invalid_storage_config'
  | 'database_unreachable'
  | 'database_query_failed'
  | 'schema_mismatch'
  | 'instrument_contract_failed'
  | 'catalog_unhealthy'
  | 'timeout'
  | 'check_exception';

export interface CheckOutcome {
  status: CheckStatus;
  code: ReadinessCode;
  durationMs: number;
}

export interface ReadinessResult {
  ready: boolean;
  checks: ReadinessChecks;
  codes: Partial<Record<ReadinessCheckName, ReadinessCode>>;
  durationsMs: Partial<Record<ReadinessCheckName, number>>;
  timedOut: boolean;
}

export interface ConfigurationCheckInput {
  env: Record<string, string | undefined>;
}

export type ReadinessDependencies = {
  checkConfiguration: (
    input: ConfigurationCheckInput
  ) => CheckOutcome | Promise<CheckOutcome>;
  pingDatabase: () => Promise<CheckOutcome>;
  checkSchema: () => Promise<CheckOutcome>;
  now?: () => number;
  timeoutMs?: number;
  checkTimeoutMs?: number;
};

function timedOutcome(
  startedAt: number,
  now: () => number,
  status: CheckStatus,
  code: ReadinessCode
): CheckOutcome {
  return {
    status,
    code,
    durationMs: Math.max(0, now() - startedAt),
  };
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function errorHaystack(error: unknown): string {
  if (!isRecord(error)) {
    return error instanceof Error ? error.message.toLowerCase() : '';
  }

  return [error.message, error.details, error.hint, error.code]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

function isSchemaCompatibilityError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const code = typeof error.code === 'string' ? error.code : '';
  const text = errorHaystack(error);

  return (
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    code === '42703' ||
    code === '42P01' ||
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('could not find the table') ||
    text.includes('column')
  );
}

function isDatabaseUnreachableError(error: unknown): boolean {
  if (error instanceof BoundedTimeoutError) {
    return true;
  }

  const text = errorHaystack(error);
  const name = error instanceof Error ? error.name.toLowerCase() : '';

  return (
    name === 'aborterror' ||
    name === 'fetcherror' ||
    text.includes('fetch failed') ||
    text.includes('econnrefused') ||
    text.includes('enotfound') ||
    text.includes('etimedout') ||
    text.includes('network') ||
    text.includes('socket') ||
    text.includes('connect')
  );
}

export function checkRuntimeConfiguration(
  input: ConfigurationCheckInput
): CheckOutcome {
  const startedAt = Date.now();
  const env = input.env;

  const supabaseUrl =
    env.SUPABASE_URL?.trim() || env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  if (!supabaseUrl) {
    return timedOutcome(startedAt, Date.now, 'failed', 'missing_supabase_url');
  }
  if (!isValidHttpUrl(supabaseUrl)) {
    return timedOutcome(startedAt, Date.now, 'failed', 'invalid_supabase_url');
  }

  const anonKey =
    env.SUPABASE_ANON_KEY?.trim() ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    '';
  if (!anonKey) {
    return timedOutcome(
      startedAt,
      Date.now,
      'failed',
      'missing_supabase_anon_key'
    );
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return timedOutcome(
      startedAt,
      Date.now,
      'failed',
      'missing_service_role_key'
    );
  }

  try {
    validateStorageRuntimeConfig(
      getStorageConfig(env as NodeJS.ProcessEnv),
      env.NODE_ENV
    );
  } catch {
    return timedOutcome(
      startedAt,
      Date.now,
      'failed',
      'invalid_storage_config'
    );
  }

  return timedOutcome(startedAt, Date.now, 'ok', 'ok');
}

export async function pingApplicationDatabase(): Promise<CheckOutcome> {
  const startedAt = Date.now();

  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from('clients').select('id').limit(1);

    if (!error) {
      return timedOutcome(startedAt, Date.now, 'ok', 'ok');
    }

    if (isSchemaCompatibilityError(error)) {
      return timedOutcome(startedAt, Date.now, 'ok', 'ok');
    }

    if (isDatabaseUnreachableError(error)) {
      return timedOutcome(
        startedAt,
        Date.now,
        'failed',
        'database_unreachable'
      );
    }

    return timedOutcome(startedAt, Date.now, 'failed', 'database_query_failed');
  } catch (error) {
    if (isDatabaseUnreachableError(error)) {
      return timedOutcome(
        startedAt,
        Date.now,
        'failed',
        'database_unreachable'
      );
    }

    return timedOutcome(startedAt, Date.now, 'failed', 'database_query_failed');
  }
}

export async function checkApplicationSchema(): Promise<CheckOutcome> {
  const startedAt = Date.now();

  try {
    const [schema, instrumentContract] = await Promise.all([
      checkSchemaReadiness({ bypassCache: true }),
      checkInstrumentApiContractAdmin(),
    ]);

    if (!schema.ready) {
      return timedOutcome(startedAt, Date.now, 'failed', 'schema_mismatch');
    }

    if (!instrumentContract.ok) {
      return timedOutcome(
        startedAt,
        Date.now,
        'failed',
        'instrument_contract_failed'
      );
    }

    if (process.env.DATABASE_URL?.trim()) {
      const migrations = await checkMigrations();
      if (migrations.catalogAccessFailed || !migrations.allHealthy) {
        return timedOutcome(startedAt, Date.now, 'failed', 'catalog_unhealthy');
      }
    }

    return timedOutcome(startedAt, Date.now, 'ok', 'ok');
  } catch (error) {
    if (isDatabaseUnreachableError(error)) {
      return timedOutcome(
        startedAt,
        Date.now,
        'failed',
        'database_unreachable'
      );
    }

    return timedOutcome(startedAt, Date.now, 'failed', 'check_exception');
  }
}

function unknownChecks(): ReadinessChecks {
  return {
    configuration: 'unknown',
    database: 'unknown',
    schema: 'unknown',
  };
}

export function createDefaultReadinessDependencies(): Omit<
  ReadinessDependencies,
  'timeoutMs' | 'checkTimeoutMs' | 'now'
> {
  return {
    checkConfiguration: checkRuntimeConfiguration,
    pingDatabase: pingApplicationDatabase,
    checkSchema: checkApplicationSchema,
  };
}

export async function runReadinessChecks(
  env: Record<string, string | undefined>,
  deps: ReadinessDependencies
): Promise<ReadinessResult> {
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? READINESS_TIMEOUT_MS;
  const checkTimeoutMs = deps.checkTimeoutMs ?? READINESS_CHECK_TIMEOUT_MS;
  const checks = unknownChecks();
  const codes: ReadinessResult['codes'] = {};
  const durationsMs: ReadinessResult['durationsMs'] = {};

  const apply = (name: ReadinessCheckName, outcome: CheckOutcome) => {
    checks[name] = outcome.status;
    codes[name] = outcome.code;
    durationsMs[name] = outcome.durationMs;
  };

  const failTimeout = (name: ReadinessCheckName, startedAt: number) => {
    apply(name, timedOutcome(startedAt, now, 'failed', 'timeout'));
  };

  try {
    return await withBoundedTimeout(
      (async () => {
        const configurationStartedAt = now();
        try {
          const configuration = await withBoundedTimeout(
            Promise.resolve(deps.checkConfiguration({ env })),
            checkTimeoutMs,
            'configuration'
          );
          apply('configuration', configuration);
          if (configuration.status !== 'ok') {
            return {
              ready: false,
              checks,
              codes,
              durationsMs,
              timedOut: false,
            };
          }
        } catch (error) {
          if (error instanceof BoundedTimeoutError) {
            failTimeout('configuration', configurationStartedAt);
            return {
              ready: false,
              checks,
              codes,
              durationsMs,
              timedOut: true,
            };
          }
          apply(
            'configuration',
            timedOutcome(
              configurationStartedAt,
              now,
              'failed',
              'check_exception'
            )
          );
          return {
            ready: false,
            checks,
            codes,
            durationsMs,
            timedOut: false,
          };
        }

        const databaseStartedAt = now();
        try {
          const database = await withBoundedTimeout(
            deps.pingDatabase(),
            checkTimeoutMs,
            'database'
          );
          apply('database', database);
          if (database.status !== 'ok') {
            return {
              ready: false,
              checks,
              codes,
              durationsMs,
              timedOut: false,
            };
          }
        } catch (error) {
          if (error instanceof BoundedTimeoutError) {
            failTimeout('database', databaseStartedAt);
            return {
              ready: false,
              checks,
              codes,
              durationsMs,
              timedOut: true,
            };
          }
          apply(
            'database',
            timedOutcome(
              databaseStartedAt,
              now,
              'failed',
              'database_unreachable'
            )
          );
          return {
            ready: false,
            checks,
            codes,
            durationsMs,
            timedOut: false,
          };
        }

        const schemaStartedAt = now();
        try {
          const schema = await withBoundedTimeout(
            deps.checkSchema(),
            checkTimeoutMs,
            'schema'
          );
          apply('schema', schema);
          return {
            ready: schema.status === 'ok',
            checks,
            codes,
            durationsMs,
            timedOut: false,
          };
        } catch (error) {
          if (error instanceof BoundedTimeoutError) {
            failTimeout('schema', schemaStartedAt);
            return {
              ready: false,
              checks,
              codes,
              durationsMs,
              timedOut: true,
            };
          }
          apply(
            'schema',
            timedOutcome(schemaStartedAt, now, 'failed', 'check_exception')
          );
          return {
            ready: false,
            checks,
            codes,
            durationsMs,
            timedOut: false,
          };
        }
      })(),
      timeoutMs,
      'readiness'
    );
  } catch (error) {
    if (error instanceof BoundedTimeoutError) {
      if (checks.configuration === 'unknown') {
        failTimeout('configuration', now());
      } else if (checks.database === 'unknown') {
        failTimeout('database', now());
      } else if (checks.schema === 'unknown') {
        failTimeout('schema', now());
      }
      return {
        ready: false,
        checks,
        codes,
        durationsMs,
        timedOut: true,
      };
    }

    return {
      ready: false,
      checks,
      codes,
      durationsMs,
      timedOut: false,
    };
  }
}
