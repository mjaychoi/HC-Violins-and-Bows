import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RUN_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const FORBIDDEN_KEY_RE =
  /password|access_token|refresh_token|service_role|anon_key|cookie|jwt|session|authorization|secret|token/i;

export const RUNTIME_MANIFEST_VERSION = 1 as const;

export type RuntimeFixtureManifest = {
  version: typeof RUNTIME_MANIFEST_VERSION;
  runId: string;
  orgIds: string[];
  instrumentIds: string[];
  clientIds: string[];
  authUserIds: string[];
  labels: Record<string, string>;
};

export function createEmptyRuntimeManifest(
  runId: string
): RuntimeFixtureManifest {
  if (!RUN_ID_RE.test(runId)) {
    throw new Error('Runtime manifest runId is malformed.');
  }

  return {
    version: RUNTIME_MANIFEST_VERSION,
    runId,
    orgIds: [],
    instrumentIds: [],
    clientIds: [],
    authUserIds: [],
    labels: {},
  };
}

function assertNoForbiddenKeys(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertNoForbiddenKeys(item, `${path}[${index}]`);
    });
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_RE.test(key)) {
      throw new Error(
        `Runtime manifest contains forbidden secret-like field "${key}".`
      );
    }
    assertNoForbiddenKeys(child, `${path}.${key}`);
  }
}

function parseIdList(value: unknown, field: string): string[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`Runtime manifest field "${field}" must be an array.`);
  }

  return value.map((item, index) => {
    if (typeof item !== 'string' || !UUID_RE.test(item)) {
      throw new Error(
        `Runtime manifest field "${field}[${index}]" is not a UUID.`
      );
    }
    return item;
  });
}

function parseLabels(value: unknown): Record<string, string> {
  if (value == null) {
    return {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Runtime manifest field "labels" must be an object.');
  }

  const labels: Record<string, string> = {};
  for (const [key, child] of Object.entries(value)) {
    if (typeof child !== 'string' || !child.trim()) {
      throw new Error(
        `Runtime manifest label "${key}" must be a non-empty string.`
      );
    }
    labels[key] = child;
  }
  return labels;
}

export function parseRuntimeManifest(value: unknown): RuntimeFixtureManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Runtime manifest must be a JSON object.');
  }

  assertNoForbiddenKeys(value, 'manifest');

  const record = value as Record<string, unknown>;
  const version = record.version;
  if (version !== RUNTIME_MANIFEST_VERSION) {
    throw new Error('Runtime manifest version is missing or unsupported.');
  }

  if (typeof record.runId !== 'string' || !RUN_ID_RE.test(record.runId)) {
    throw new Error('Runtime manifest runId is missing or malformed.');
  }

  return {
    version: RUNTIME_MANIFEST_VERSION,
    runId: record.runId,
    orgIds: parseIdList(record.orgIds, 'orgIds'),
    instrumentIds: parseIdList(record.instrumentIds, 'instrumentIds'),
    clientIds: parseIdList(record.clientIds, 'clientIds'),
    authUserIds: parseIdList(record.authUserIds, 'authUserIds'),
    labels: parseLabels(record.labels),
  };
}

export function resolveRuntimeManifestPath(
  env: Record<string, string | undefined> = process.env
): string {
  const configured = env.AUTH_MATRIX_RUNTIME_MANIFEST?.trim();
  if (configured) {
    return configured;
  }
  throw new Error(
    'AUTH_MATRIX_RUNTIME_MANIFEST is required so cleanup can target this run only.'
  );
}

export async function readRuntimeManifestFile(
  filePath: string
): Promise<RuntimeFixtureManifest | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    if (!raw.trim()) {
      return null;
    }
    return parseRuntimeManifest(JSON.parse(raw) as unknown);
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeRuntimeManifestFile(
  filePath: string,
  manifest: RuntimeFixtureManifest
): Promise<void> {
  const parsed = parseRuntimeManifest(manifest);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}
