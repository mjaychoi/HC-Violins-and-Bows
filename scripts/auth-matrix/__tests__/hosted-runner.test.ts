/** @jest-environment node */

import { mkdtemp, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  AUTH_MATRIX_ORG_A_CONSIGNMENT_PRICE,
  AUTH_MATRIX_ORG_A_COST_PRICE,
} from '../constants';
import { executeHostedCleanup } from '../hosted-cleanup';
import { runHostedCookieAuthMatrix } from '../hosted-runner';
import { parseRuntimeManifest } from '../runtime-manifest';
import type { AuthMatrixEnvironment } from '../../../tests/integration/auth-matrix/env-guard';

const env: AuthMatrixEnvironment = {
  supabaseUrl: 'https://stagingexample1234.supabase.co',
  supabaseAnonKey: 'anon-key',
  serviceRoleKey: 'service-key',
  baseUrl: 'http://127.0.0.1:3000',
  projectRef: 'stagingexample1234',
  productionProjectRef: 'prodrefexample9999',
};

function nextUuid(counter: { value: number }): string {
  counter.value += 1;
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(counter.value).padStart(12, '0')}`;
}

type CreatedFixtures = {
  orgIds: string[];
  instrumentIds: string[];
  clientIds: string[];
};

function createAdminMock(options?: {
  failOnInstrument?: boolean;
  failOnUser?: number;
}) {
  const ids = { value: 10 };
  const created: CreatedFixtures = {
    orgIds: [],
    instrumentIds: [],
    clientIds: [],
  };
  const createdUsers: string[] = [];
  const deletedUsers: string[] = [];
  const deletedRows: Array<{ table: string; ids: string[] }> = [];
  let userCreates = 0;

  const admin = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        if (table === 'organizations') {
          if (typeof row.id === 'string') {
            created.orgIds.push(row.id);
          }
          return Promise.resolve({ error: null });
        }
        if (table === 'instruments' && options?.failOnInstrument) {
          return {
            select: () => ({
              single: async () => ({
                data: null,
                error: { message: 'instrument insert failed' },
              }),
            }),
          };
        }
        const id = nextUuid(ids);
        if (table === 'instruments') created.instrumentIds.push(id);
        if (table === 'clients') created.clientIds.push(id);
        const result = { data: { id, org_id: row.org_id }, error: null };
        return {
          select: () => ({
            single: async () => result,
          }),
        };
      },
      delete: () => ({
        in: async (_column: string, values: string[]) => {
          deletedRows.push({ table, ids: [...values] });
          return { error: null };
        },
      }),
    }),
    auth: {
      admin: {
        createUser: async () => {
          userCreates += 1;
          if (options?.failOnUser === userCreates) {
            return {
              data: { user: null },
              error: { message: 'second user create failed' },
            };
          }
          const id = nextUuid(ids);
          createdUsers.push(id);
          return { data: { user: { id } }, error: null };
        },
        deleteUser: async (id: string) => {
          deletedUsers.push(id);
          return { error: null };
        },
      },
    },
  };

  return {
    admin: admin as unknown as SupabaseClient,
    created,
    createdUsers,
    deletedUsers,
    deletedRows,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function createPassingFetch(created: CreatedFixtures) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const url = String(input);
    const method = init?.method ?? 'GET';
    const cookie = headers.get('Cookie') ?? '';
    const orgAId = created.orgIds[0];
    const instrumentA = created.instrumentIds[0];
    const instrumentB = created.instrumentIds[1];

    if (!headers.has('Cookie')) {
      return jsonResponse(401, {
        error_code: 'UNAUTHORIZED',
        success: false,
      });
    }
    if (method === 'POST') {
      return jsonResponse(403, { error_code: 'ADMIN_REQUIRED' });
    }
    if (url.includes('/api/clients?id=')) {
      return jsonResponse(404, { error: 'Client not found', success: false });
    }
    if (instrumentB && url.includes(`/api/instruments?id=${instrumentB}`)) {
      return jsonResponse(404, {
        error: 'Instrument not found',
        success: false,
      });
    }
    if (instrumentA && url.includes(`/api/instruments?id=${instrumentA}`)) {
      if (!cookie.includes('orgA')) {
        return jsonResponse(404, {
          error: 'Instrument not found',
          success: false,
        });
      }
      const row: Record<string, unknown> = {
        id: instrumentA,
        org_id: orgAId,
        maker: 'A',
      };
      if (cookie.includes('orgAAdmin')) {
        row.cost_price = AUTH_MATRIX_ORG_A_COST_PRICE;
        row.consignment_price = AUTH_MATRIX_ORG_A_CONSIGNMENT_PRICE;
      }
      return jsonResponse(200, { data: [row] });
    }
    return jsonResponse(200, {
      data: [{ id: instrumentA, org_id: orgAId, maker: 'A' }],
    });
  };
}

describe('hosted runner failure paths', () => {
  async function manifestPath(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'auth-matrix-runner-'));
    return join(dir, 'hc-auth-matrix-runtime.json');
  }

  it('cleans the first user when the second user creation fails', async () => {
    const { admin, created, createdUsers, deletedUsers } = createAdminMock({
      failOnUser: 2,
    });
    const filePath = await manifestPath();

    await expect(
      runHostedCookieAuthMatrix({
        env,
        admin,
        manifestPath: filePath,
        generateId: (() => {
          const counter = { value: 0 };
          return () => nextUuid(counter);
        })(),
        generatePassword: () => 'ephemeral-password',
        fetchImpl: createPassingFetch(created),
      })
    ).rejects.toThrow(/second user create failed/i);

    expect(createdUsers).toHaveLength(1);
    expect(deletedUsers).toEqual(createdUsers);
    const raw = await readFile(filePath, 'utf8');
    expect(raw).not.toMatch(/password|ephemeral-password|Cookie/i);
    const manifest = parseRuntimeManifest(JSON.parse(raw));
    expect(manifest.authUserIds).toEqual(createdUsers);
  });

  it('records and cleans partial fixture bootstrap', async () => {
    const { admin, created, deletedRows } = createAdminMock({
      failOnInstrument: true,
    });
    const filePath = await manifestPath();

    await expect(
      runHostedCookieAuthMatrix({
        env,
        admin,
        manifestPath: filePath,
        generateId: (() => {
          const counter = { value: 0 };
          return () => nextUuid(counter);
        })(),
        fetchImpl: createPassingFetch(created),
      })
    ).rejects.toThrow(/instrument insert failed/i);

    const raw = await readFile(filePath, 'utf8');
    const manifest = parseRuntimeManifest(JSON.parse(raw));
    expect(manifest.orgIds).toHaveLength(2);
    expect(manifest.instrumentIds).toEqual([]);
    expect(
      deletedRows.some(
        entry =>
          entry.table === 'organizations' &&
          entry.ids.includes(manifest.orgIds[0])
      )
    ).toBe(true);
  });

  it('cleans users and fixtures when session mint fails', async () => {
    const { admin, created, createdUsers, deletedUsers } = createAdminMock();
    const filePath = await manifestPath();

    await expect(
      runHostedCookieAuthMatrix({
        env,
        admin,
        manifestPath: filePath,
        generateId: (() => {
          const counter = { value: 0 };
          return () => nextUuid(counter);
        })(),
        generatePassword: () => 'ephemeral-password',
        mintSession: async () => {
          throw new Error('sign-in failed');
        },
        fetchImpl: createPassingFetch(created),
      })
    ).rejects.toThrow(/sign-in failed/i);

    expect(createdUsers).toHaveLength(4);
    expect(deletedUsers).toEqual(createdUsers);
  });

  it('still cleans up when a matrix assertion fails', async () => {
    const { admin, createdUsers, deletedUsers } = createAdminMock();
    const filePath = await manifestPath();
    let cleanupCalls = 0;

    await expect(
      runHostedCookieAuthMatrix({
        env,
        admin,
        manifestPath: filePath,
        generateId: (() => {
          const counter = { value: 0 };
          return () => nextUuid(counter);
        })(),
        generatePassword: () => 'ephemeral-password',
        mintSession: async ({ actorLabel }) => `hcv-sb-auth=${actorLabel}`,
        fetchImpl: async () => jsonResponse(200, { data: [] }),
        cleanup: async (cleanupAdmin, manifest) => {
          cleanupCalls += 1;
          return executeHostedCleanup(cleanupAdmin, manifest);
        },
      })
    ).rejects.toThrow(/failed/i);

    expect(cleanupCalls).toBe(1);
    expect(deletedUsers).toEqual(createdUsers);
  });

  it('leaves the manifest in place when primary cleanup fails', async () => {
    const { admin, created, createdUsers } = createAdminMock();
    const filePath = await manifestPath();
    let cleanupCalls = 0;

    await expect(
      runHostedCookieAuthMatrix({
        env,
        admin,
        manifestPath: filePath,
        generateId: (() => {
          const counter = { value: 0 };
          return () => nextUuid(counter);
        })(),
        generatePassword: () => 'ephemeral-password',
        mintSession: async ({ actorLabel }) => `hcv-sb-auth=${actorLabel}`,
        fetchImpl: createPassingFetch(created),
        cleanup: async () => {
          cleanupCalls += 1;
          throw new Error('primary cleanup failed');
        },
      })
    ).rejects.toThrow(/primary cleanup failed/i);

    expect(cleanupCalls).toBe(1);
    const raw = await readFile(filePath, 'utf8');
    const manifest = parseRuntimeManifest(JSON.parse(raw));
    expect(manifest.authUserIds).toEqual(createdUsers);

    const fallback = createAdminMock();
    await executeHostedCleanup(fallback.admin, manifest);
    expect(fallback.deletedUsers).toEqual(createdUsers);
  });
});
