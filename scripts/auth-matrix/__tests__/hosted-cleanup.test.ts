/** @jest-environment node */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  cleanupLocalAuthMatrixFixtures,
  executeHostedCleanup,
  planHostedCleanup,
} from '../hosted-cleanup';
import type { RuntimeFixtureManifest } from '../runtime-manifest';
import { AUTH_MATRIX_ORG_A_ID, AUTH_MATRIX_ORG_B_ID } from '../constants';

const RUN_A = 'runaaaaaaaaaaaaaaaaaaaa';
const RUN_B = 'runbbbbbbbbbbbbbbbbbbbb';

function manifest(
  overrides: Partial<RuntimeFixtureManifest> & { runId: string }
): RuntimeFixtureManifest {
  return {
    version: 1,
    orgIds: [],
    instrumentIds: [],
    clientIds: [],
    authUserIds: [],
    labels: {},
    ...overrides,
  };
}

function createAdminMock() {
  const deleted: Array<{ table: string; column: string; ids: string[] }> = [];
  const deletedUsers: string[] = [];

  const admin = {
    from: (table: string) => ({
      delete: () => ({
        in: async (column: string, ids: string[]) => {
          deleted.push({ table, column, ids: [...ids] });
          return { error: null };
        },
      }),
    }),
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          deletedUsers.push(id);
          return { error: null };
        },
      },
    },
  };

  return { admin: admin as unknown as SupabaseClient, deleted, deletedUsers };
}

describe('hosted cleanup', () => {
  const orgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const orgB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  const instrumentA = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  const clientA = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
  const userA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
  const userB = 'ffffffff-ffff-4fff-8fff-fffffffffff1';

  it('plans explicit IDs only', () => {
    const plan = planHostedCleanup(
      manifest({
        runId: RUN_A,
        orgIds: [orgA],
        instrumentIds: [instrumentA],
        clientIds: [clientA],
        authUserIds: [userA],
      })
    );

    expect(plan.deleteOrganizationsById).toEqual([orgA]);
    expect(plan.deleteInstrumentsById).toEqual([instrumentA]);
    expect(plan.deleteClientsById).toEqual([clientA]);
    expect(plan.deleteAuthUsersById).toEqual([userA]);
    expect(plan.deleteOrganizationsById).not.toContain(AUTH_MATRIX_ORG_A_ID);
  });

  it('does not let one runtime manifest delete another run’s IDs', () => {
    const planA = planHostedCleanup(
      manifest({
        runId: RUN_A,
        orgIds: [orgA],
        authUserIds: [userA],
      })
    );
    const planB = planHostedCleanup(
      manifest({
        runId: RUN_B,
        orgIds: [orgB],
        authUserIds: [userB],
      })
    );

    expect(planA.deleteOrganizationsById).not.toContain(orgB);
    expect(planA.deleteAuthUsersById).not.toContain(userB);
    expect(planB.deleteOrganizationsById).not.toContain(orgA);
    expect(planB.deleteAuthUsersById).not.toContain(userA);
  });

  it('never confuses auth user IDs with database row IDs', async () => {
    const { admin, deleted, deletedUsers } = createAdminMock();

    await executeHostedCleanup(
      admin,
      manifest({
        runId: RUN_A,
        orgIds: [orgA],
        instrumentIds: [instrumentA],
        clientIds: [clientA],
        authUserIds: [userA],
      })
    );

    expect(deletedUsers).toEqual([userA]);
    expect(deletedUsers).not.toContain(instrumentA);
    expect(
      deleted.some(
        entry => entry.table === 'instruments' && entry.ids.includes(userA)
      )
    ).toBe(false);
    expect(
      deleted.find(
        entry => entry.table === 'instruments' && entry.column === 'id'
      )?.ids
    ).toEqual([instrumentA]);
  });

  it('is idempotent when run twice', async () => {
    const { admin, deletedUsers } = createAdminMock();
    const payload = manifest({
      runId: RUN_A,
      orgIds: [orgA],
      authUserIds: [userA],
    });

    await executeHostedCleanup(admin, payload);
    await executeHostedCleanup(admin, payload);

    expect(deletedUsers).toEqual([userA, userA]);
  });

  it('accepts a partial bootstrap manifest', async () => {
    const { admin, deleted, deletedUsers } = createAdminMock();

    await executeHostedCleanup(
      admin,
      manifest({
        runId: RUN_A,
        orgIds: [orgA],
        authUserIds: [userA],
      })
    );

    expect(deletedUsers).toEqual([userA]);
    expect(deleted.find(entry => entry.table === 'organizations')?.ids).toEqual(
      [orgA]
    );
    expect(
      deleted.find(
        entry => entry.table === 'instruments' && entry.column === 'id'
      )
    ).toBeUndefined();
  });

  it('refuses a malformed manifest before deleting', async () => {
    const { admin, deleted, deletedUsers } = createAdminMock();

    await expect(
      executeHostedCleanup(admin, {
        version: 1,
        runId: RUN_A,
        password: 'nope',
      } as unknown as RuntimeFixtureManifest)
    ).rejects.toThrow(/forbidden/i);

    expect(deleted).toEqual([]);
    expect(deletedUsers).toEqual([]);
  });

  it('local cleanup only targets the documented local org IDs', async () => {
    const { admin, deleted } = createAdminMock();
    await cleanupLocalAuthMatrixFixtures(admin);

    const orgDeletes = deleted.filter(entry => entry.ids.includes(orgA));
    expect(orgDeletes).toEqual([]);
    expect(
      deleted.some(entry => entry.ids.includes(AUTH_MATRIX_ORG_A_ID))
    ).toBe(true);
    expect(
      deleted.some(entry => entry.ids.includes(AUTH_MATRIX_ORG_B_ID))
    ).toBe(true);
  });
});
