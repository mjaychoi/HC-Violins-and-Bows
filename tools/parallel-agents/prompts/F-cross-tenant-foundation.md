Build the _foundation_ that future cross-tenant isolation tests will stand on.

## Scope discipline — read this first

**Do not add many cross-tenant assertions in this task.** This task delivers
setup, identity, and teardown contracts only. The tests that exercise
cross-tenant leakage come later, as separate tasks, and they must be able to
build on what you produce here without changing it again.

One minimal smoke assertion proving org B's identity authenticates and is
scoped to org B is welcome. A full isolation matrix is not.

## Deliverable

A second organization and an admin identity for it, wired into the existing E2E
setup:

- org B, distinct from the current `DEFAULT_E2E_ORG_ID`
  (`00000000-0000-4000-8000-0000000000e2`)
- an admin user belonging to org B
- isolated, separately-persisted auth state for that identity
- a deterministic, safe setup and teardown contract

You may change:

    tests/e2e/global-setup.ts
    tests/e2e/e2e-identities.ts

and add new files under:

    tests/e2e/cross-tenant/

## Do not break the existing setup

This is the hard requirement. `tests/e2e/global-setup.ts` currently seeds the
admin and member identities for the single E2E org and persists cookie-backed
storage state for each; `critical-path.spec.ts` and every other spec depend on
`ADMIN_AUTH_STATE_PATH` and `MEMBER_AUTH_STATE_PATH` continuing to exist with
the same meaning.

Therefore:

- Keep `ADMIN_AUTH_STATE_PATH`, `MEMBER_AUTH_STATE_PATH`, `getE2EOrgId()`,
  `getE2EAdminIdentity()`, `getE2EMemberIdentity()` and `DEFAULT_E2E_ORG_ID`
  exporting the same names with the same semantics. Add alongside; do not
  rename, repurpose, or remove.
- Follow the existing shape: new org B values come from env vars with
  deterministic defaults, exactly as `getE2EOrgId()` does.
- Org B seeding must fail **closed** in CI. The existing setup already throws
  when `SUPABASE_SERVICE_ROLE_KEY` is missing and `requiresDeterministicSeed()`
  is true — org B must behave the same way, never silently fall back to org A.
- An org B auth state file must never be reused for an org A identity, and vice
  versa. Give it its own path under `tests/e2e/.auth/`.
- Note in your report whether the new auth state path needs a `.gitignore`
  entry. `tests/e2e/.auth/member.json` is currently ignored and `.gitignore` is
  **outside your allowed scope** — report it, do not edit it.

## Teardown contract

Document, in code comments and in your final report:

- what org B setup creates
- what is safe to delete and what must be left alone on shared staging
- how a later cross-tenant test should allocate its own fixtures without
  touching org A data

Do not write destructive teardown against shared staging.

## Conventions to follow

- Tag any test you add `tag: '@critical'` only if it must block CI; a
  foundation smoke test probably should.
- Keep `npm run type-check` and `npm run lint` clean.

## Hard constraints

- Do not weaken or skip assertions. No `test.skip`.
- Do not modify sibling specs, `tests/e2e/test-helpers.ts`, or
  `tests/e2e/critical-path.spec.ts`.
- Do not run the hosted E2E suite locally.
