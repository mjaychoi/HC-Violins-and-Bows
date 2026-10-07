/**
 * ONE-OFF (disposable proof PR only — never merged). Read-only evidence for
 * the concurrent run-scoped hosted E2E proof.
 *
 *   snapshot  record the shared/default org row counts, shared legacy users'
 *             sign-in/update stamps, and the total auth user count
 *   verify    re-derive both slot scopes, assert their orgs/users/rows are
 *             gone, and print the shared snapshot again for comparison
 *
 * Prints ids, counts and timestamps only — never emails, keys, or sessions.
 */
import { createClient } from '@supabase/supabase-js';

import { assertE2EStagingProjectAllowlist } from '../../scripts/assert-e2e-staging-project-allowlist';
import {
  DEFAULT_E2E_ORG_ID,
  deriveE2EOrgId,
  deriveE2EScopedEmail,
  normalizeE2ERunScope,
} from './e2e-identities';
import {
  ORG_SCOPED_TABLES,
  createSupabaseRunScopedE2EStore,
} from './run-scoped-fixtures';

async function main(): Promise<void> {
  const mode = process.argv[2];
  assertE2EStagingProjectAllowlist(process.env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('Supabase URL / service role missing.');

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store = createSupabaseRunScopedE2EStore(admin);

  const sharedOrgIds = [
    ...new Set(
      [process.env.E2E_TEST_ORG_ID?.trim(), DEFAULT_E2E_ORG_ID].filter(
        (id): id is string => Boolean(id)
      )
    ),
  ];
  const shared: Record<string, unknown> = {};
  for (const [index, orgId] of sharedOrgIds.entries()) {
    const counts: Record<string, number> = {
      organizations: await store.countRows('organizations', 'id', orgId),
    };
    for (const table of ORG_SCOPED_TABLES) {
      counts[table] = await store.countRows(table, 'org_id', orgId);
    }
    shared[`sharedOrg${index}`] = { orgIdPrefix: orgId.slice(0, 8), counts };
  }
  for (const [label, name] of [
    ['legacyAdmin', 'E2E_TEST_EMAIL'],
    ['legacyMember', 'E2E_TEST_MEMBER_EMAIL'],
  ] as const) {
    const email = process.env[name]?.trim();
    const user = email ? await store.findUserByEmail(email) : null;
    const full = user as {
      id: string;
      updated_at?: string;
      last_sign_in_at?: string;
    } | null;
    shared[label] = full
      ? {
          id: full.id,
          updated_at: full.updated_at ?? null,
          last_sign_in_at: full.last_sign_in_at ?? null,
        }
      : null;
  }
  let totalUsers = 0;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(error.message);
    totalUsers += data.users.length;
    if (data.users.length < 1000) break;
  }
  shared.totalAuthUsers = totalUsers;

  const output: Record<string, unknown> = { mode, shared };

  if (mode === 'verify') {
    const base = process.env.PROOF_SCOPE_BASE?.trim();
    if (!base) throw new Error('PROOF_SCOPE_BASE missing.');
    const slots: Record<string, unknown> = {};
    for (const slot of ['a', 'b']) {
      const scopeKey = normalizeE2ERunScope(`${base}-${slot}`);
      const orgId = deriveE2EOrgId(scopeKey);
      const counts: Record<string, number> = {
        organizations: await store.countRows('organizations', 'id', orgId),
      };
      for (const table of ORG_SCOPED_TABLES) {
        counts[table] = await store.countRows(table, 'org_id', orgId);
      }
      const users = {
        admin: Boolean(
          await store.findUserByEmail(deriveE2EScopedEmail(scopeKey, 'admin'))
        ),
        member: Boolean(
          await store.findUserByEmail(deriveE2EScopedEmail(scopeKey, 'member'))
        ),
      };
      const residual =
        Object.values(counts).reduce((a, b) => a + b, 0) +
        Number(users.admin) +
        Number(users.member);
      slots[slot] = { scopeKey, orgId, counts, users, residual };
    }
    output.slots = slots;
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'evidence failed');
  process.exit(1);
});
