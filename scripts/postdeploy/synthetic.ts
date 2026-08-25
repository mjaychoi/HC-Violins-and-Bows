import { createClient } from '@supabase/supabase-js';
import {
  redactSensitiveText,
  safeErrorMessage,
} from '../auth-matrix/secret-redact';
import { buildCookieHeaderFromSession } from '../auth-matrix/hosted-session';
import {
  assertPostDeployTargetAllowlisted,
  assertSyntheticCredentialsPresent,
} from './allowlist';
import { fetchWithTimeout, joinUrl } from './http';
import type {
  AuthenticateFn,
  AuthenticatedSession,
  EnvMap,
  FetchLike,
  StepName,
  StepResult,
  SyntheticLogger,
} from './types';

export const DEFAULT_SYNTHETIC_REQUEST_TIMEOUT_MS = 15_000;

const STEP_LABELS: Record<StepName, string> = {
  allowlist: 'allowlist',
  credentials: 'credentials',
  readiness: 'readiness',
  authentication: 'authentication',
  authenticated_read: 'authenticated read',
  create: 'create',
  read_after_write: 'read-after-write',
  cleanup: 'cleanup',
};

export type SyntheticDeps = {
  fetchImpl: FetchLike;
  authenticate: AuthenticateFn;
  now?: () => number;
  randomId?: () => string;
  logger?: SyntheticLogger;
  requestTimeoutMs?: number;
};

function padLabel(name: StepName): string {
  return STEP_LABELS[name].padEnd(18, '.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractOrgId(user: {
  app_metadata?: Record<string, unknown>;
}): string | null {
  const appMeta = user.app_metadata ?? {};
  for (const value of [appMeta.org_id, appMeta.orgId]) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function formatStepSummary(steps: StepResult[]): string {
  return steps.map(step => `${padLabel(step.name)} ${step.status}`).join('\n');
}

export async function mintSyntheticCookieSession(
  env: EnvMap
): Promise<AuthenticatedSession> {
  const credentials = assertSyntheticCredentialsPresent(env);
  const supabase = createClient(credentials.supabaseUrl, credentials.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (error || !data.session || !data.user) {
    throw new Error('Synthetic sign-in failed.');
  }

  return {
    cookieHeader: buildCookieHeaderFromSession(data.session),
    orgId: extractOrgId(data.user),
  };
}

function createStep(
  name: StepName,
  status: StepResult['status'],
  startedAt: number,
  now: () => number,
  extra: Partial<StepResult> = {}
): StepResult {
  return {
    name,
    status,
    durationMs: Math.max(0, now() - startedAt),
    ...extra,
  };
}

async function readJson(
  response: Awaited<ReturnType<FetchLike>>
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function runPostDeploySynthetic(
  env: EnvMap,
  deps: SyntheticDeps
): Promise<{ exitCode: number; steps: StepResult[]; summary: string }> {
  const now = deps.now ?? Date.now;
  const requestTimeoutMs =
    deps.requestTimeoutMs ?? DEFAULT_SYNTHETIC_REQUEST_TIMEOUT_MS;
  const steps: StepResult[] = [];
  const log = (message: string) => {
    deps.logger?.info(redactSensitiveText(message));
  };
  const logError = (message: string) => {
    deps.logger?.error(redactSensitiveText(message));
  };

  const fail = (
    name: StepName,
    startedAt: number,
    extra: Partial<StepResult> = {}
  ) => {
    steps.push(createStep(name, 'FAIL', startedAt, now, extra));
    const summary = formatStepSummary(steps);
    logError(summary);
    return { exitCode: 1, steps, summary };
  };

  const pass = (
    name: StepName,
    startedAt: number,
    extra: Partial<StepResult> = {}
  ) => {
    steps.push(createStep(name, 'PASS', startedAt, now, extra));
  };

  let baseUrl = '';
  const allowlistStarted = now();
  try {
    baseUrl = assertPostDeployTargetAllowlisted(env).baseUrl;
    pass('allowlist', allowlistStarted);
  } catch (error) {
    return fail('allowlist', allowlistStarted, {
      detail: safeErrorMessage(error),
    });
  }

  const credentialsStarted = now();
  try {
    assertSyntheticCredentialsPresent(env);
    pass('credentials', credentialsStarted);
  } catch (error) {
    return fail('credentials', credentialsStarted, {
      detail: safeErrorMessage(error),
    });
  }

  const readinessStarted = now();
  try {
    const response = await fetchWithTimeout(
      deps.fetchImpl,
      joinUrl(baseUrl, '/api/ready'),
      { method: 'GET' },
      requestTimeoutMs
    );
    const body = await readJson(response);
    const ready =
      response.status === 200 && isRecord(body) && body.status === 'ready';
    if (!ready) {
      return fail('readiness', readinessStarted, {
        httpStatus: response.status,
        detail: 'Readiness endpoint was not ready.',
      });
    }
    pass('readiness', readinessStarted, { httpStatus: response.status });
  } catch (error) {
    return fail('readiness', readinessStarted, {
      detail: safeErrorMessage(error),
    });
  }

  let session: AuthenticatedSession;
  const authStarted = now();
  try {
    session = await deps.authenticate(env);
    if (!session.cookieHeader?.trim()) {
      return fail('authentication', authStarted, {
        detail: 'Authentication did not produce a cookie-backed session.',
      });
    }
    pass('authentication', authStarted);
  } catch (error) {
    return fail('authentication', authStarted, {
      detail: safeErrorMessage(error),
    });
  }

  const cookieHeaders = { Cookie: session.cookieHeader };

  const readStarted = now();
  try {
    const response = await fetchWithTimeout(
      deps.fetchImpl,
      joinUrl(baseUrl, '/api/clients?pageSize=1'),
      { method: 'GET', headers: cookieHeaders },
      requestTimeoutMs
    );
    if (response.status >= 400) {
      return fail('authenticated_read', readStarted, {
        httpStatus: response.status,
        detail: 'Authenticated read failed.',
      });
    }
    pass('authenticated_read', readStarted, { httpStatus: response.status });
  } catch (error) {
    return fail('authenticated_read', readStarted, {
      detail: safeErrorMessage(error),
    });
  }

  const marker = `synthetic-${deps.randomId?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  let createdId = '';
  const createStarted = now();
  try {
    const response = await fetchWithTimeout(
      deps.fetchImpl,
      joinUrl(baseUrl, '/api/clients'),
      {
        method: 'POST',
        headers: {
          ...cookieHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: 'Synthetic',
          last_name: marker,
          note: marker,
          tags: ['synthetic-postdeploy'],
        }),
      },
      requestTimeoutMs
    );
    const body = await readJson(response);
    const data = isRecord(body) && isRecord(body.data) ? body.data : null;
    const id = data && typeof data.id === 'string' ? data.id : '';
    if (response.status >= 400 || !id) {
      return fail('create', createStarted, {
        httpStatus: response.status,
        detail: 'Synthetic create failed or returned no id.',
      });
    }
    createdId = id;
    pass('create', createStarted, {
      httpStatus: response.status,
      resourceId: createdId,
    });
    log(`created synthetic client id=${createdId}`);
  } catch (error) {
    return fail('create', createStarted, {
      detail: safeErrorMessage(error),
    });
  }

  const readAfterWriteStarted = now();
  try {
    const response = await fetchWithTimeout(
      deps.fetchImpl,
      joinUrl(baseUrl, `/api/clients?id=${encodeURIComponent(createdId)}`),
      { method: 'GET', headers: cookieHeaders },
      requestTimeoutMs
    );
    const body = await readJson(response);
    const data = isRecord(body) && isRecord(body.data) ? body.data : null;
    const lastName =
      data && typeof data.last_name === 'string' ? data.last_name : '';
    const note = data && typeof data.note === 'string' ? data.note : '';
    if (
      response.status >= 400 ||
      !data ||
      lastName !== marker ||
      note !== marker
    ) {
      return fail('read_after_write', readAfterWriteStarted, {
        httpStatus: response.status,
        resourceId: createdId,
        detail: 'Read-after-write did not return the synthetic client.',
      });
    }
    pass('read_after_write', readAfterWriteStarted, {
      httpStatus: response.status,
      resourceId: createdId,
    });
  } catch (error) {
    return fail('read_after_write', readAfterWriteStarted, {
      resourceId: createdId,
      detail: safeErrorMessage(error),
    });
  }

  const cleanupStarted = now();
  try {
    const response = await fetchWithTimeout(
      deps.fetchImpl,
      joinUrl(baseUrl, `/api/clients?id=${encodeURIComponent(createdId)}`),
      { method: 'DELETE', headers: cookieHeaders },
      requestTimeoutMs
    );
    if (response.status >= 400) {
      logError(
        `cleanup failed for synthetic client id=${createdId}; operator cleanup required`
      );
      return fail('cleanup', cleanupStarted, {
        httpStatus: response.status,
        resourceId: createdId,
        detail: 'Cleanup failed.',
      });
    }
    pass('cleanup', cleanupStarted, {
      httpStatus: response.status,
      resourceId: createdId,
    });
  } catch (error) {
    logError(
      `cleanup failed for synthetic client id=${createdId}; operator cleanup required`
    );
    return fail('cleanup', cleanupStarted, {
      resourceId: createdId,
      detail: safeErrorMessage(error),
    });
  }

  const summary = formatStepSummary(steps);
  log(summary);
  return { exitCode: 0, steps, summary };
}
