Add end-to-end critical coverage proving note ownership is enforced on mutation.

## Deliverable

A new spec file:

    tests/e2e/notes-ownership.critical.spec.ts

Do **not** modify `tests/e2e/critical-path.spec.ts`.

**Invoice settings are out of scope for this task.** Do not touch
`tests/e2e/invoice-settings.spec.ts` and do not add invoice-settings coverage
here, even if it looks adjacent.

## Coverage required

1. As the seeded **admin** identity, create a note via `POST /api/notes`
   against a fixture this spec created.
2. As a **different** principal — the seeded member identity
   (`MEMBER_AUTH_STATE_PATH`) — attempt to mutate that note:
   - `PATCH /api/notes`
   - `DELETE /api/notes`
3. Assert the enforced outcome. Read `src/app/api/notes/route.ts` first and
   assert what the handler actually does: a `403` (`ADMIN_REQUIRED` /
   "Admin role required"), a `404` where the row is filtered out of the
   caller's scope before the ownership check, or whatever the real contract is.
   **Both 403 and 404 are legitimate denials** — assert the one that is
   implemented, and say in a comment which it is and why.
4. Confirm the note still exists and is unchanged afterwards, read back as the
   admin identity. A denial that silently mutated anything is a bug worth
   reporting.
5. As the admin owner, clean the note up at the end.

## Conventions to follow

- Tag every test `tag: '@critical'`.
- Select the identity per `test.describe` block with
  `test.use({ storageState: ... })`; do not mix identities inside one block.
  Call `assertCookieBackedAuth(page)` after switching.
- Assert the member auth state file exists before relying on it, with a clear
  message, as `critical-path.spec.ts` does.
- Unique suffix on every fixture; drive the API with `page.request.*`.
- Modify or delete only rows this spec created.

## Hard constraints

- Do not weaken or skip assertions to get green. No `test.skip`.
- Do not change application or API code. If ownership is _not_ enforced, that
  is a finding: report it clearly instead of writing a test that passes anyway.
- Do not run the hosted E2E suite locally.
