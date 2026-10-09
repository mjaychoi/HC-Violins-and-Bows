Add an end-to-end denial matrix proving the member role cannot perform
admin-only mutations.

## Deliverable

A new spec file:

    tests/e2e/member-authz.critical.spec.ts

Do **not** modify `tests/e2e/critical-path.spec.ts` or `tests/e2e/auth.spec.ts`.

## Coverage required

As the seeded **member** identity (`MEMBER_AUTH_STATE_PATH`), assert that a
representative set of admin-only mutations is denied. Cover at least one
mutation per domain, for example:

- `POST /api/sales`
- `POST /api/connections`
- `POST /api/instruments` (and/or `PATCH /api/instruments/[id]`)
- `POST /api/invoices` or `DELETE /api/invoices/[id]`

For each: assert status **403** and a body matching
`/ADMIN_REQUIRED|Admin role required/i`.

Also assert that financial/cost fields stay redacted for a member wherever the
API exposes them — read the handlers to find which responses redact what, and
assert the redaction that actually exists rather than inventing a contract.

## Keep the fixture surface small

These mutations must **fail**, so they do not need real, valid target rows. Use
syntactically valid but non-existent ids (as `critical-path.spec.ts` does with
`'00000000-0000-4000-8000-000000000001'`) and assert the authorization check
fires before any lookup. Create real fixtures only where a 403 genuinely cannot
be observed otherwise, and clean up anything you do create.

This matters: a denial test that needs admin-created fixtures reintroduces the
coupling this split was meant to remove.

## Conventions to follow

- Tag every test `tag: '@critical'`.
- `test.use({ storageState: MEMBER_AUTH_STATE_PATH })`, then
  `assertCookieBackedAuth(page)`.
- Assert that the member auth state file exists before relying on it, with a
  clear failure message, the way `critical-path.spec.ts` does.
- Drive the API with `page.request.*`.

## Hard constraints

- Do not weaken or skip assertions to get green. No `test.skip`.
- Do not change any application or API code to make a denial pass. If a mutation
  is _not_ actually denied, that is a finding: report it, do not paper over it.
- Do not run the hosted E2E suite locally.
