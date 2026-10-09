Add end-to-end critical-path coverage for the Connections API lifecycle.

## Deliverable

A new spec file:

    tests/e2e/connections.critical.spec.ts

Do **not** modify `tests/e2e/critical-path.spec.ts`. The point of this task is
that connections coverage lands in its own file so several people can work on
the critical suite at once. `tests/e2e/connections-detailed.spec.ts` is also
off-limits.

## Coverage required

As the seeded **admin** identity (`ADMIN_AUTH_STATE_PATH`):

1. Create the fixtures the test needs (a client and an instrument) through the
   API, and remember their ids.
2. `POST /api/connections` — create a connection between them.
3. `GET /api/connections` filtered by that client — the new connection is present.
4. `PATCH /api/connections` — update it, and assert the change is reflected.
5. `PUT /api/connections` — reorder, and assert the resulting order.
6. `DELETE /api/connections` — remove it.
7. `GET` again — confirm it is absent.

As the seeded **member** identity (`MEMBER_AUTH_STATE_PATH`):

8. `POST /api/connections` returns **403**, and the body matches
   `/ADMIN_REQUIRED|Admin role required/i`.

## Conventions to follow

- Tag every test `tag: '@critical'`. `scripts/assert-critical-e2e-selected.cjs`
  fails the gate when the critical suite selects zero tagged tests.
- Pick the identity per `test.describe` block with
  `test.use({ storageState: ADMIN_AUTH_STATE_PATH })`, exactly as
  `critical-path.spec.ts` does, and call `assertCookieBackedAuth(page)` first.
- Drive the API with `page.request.*`. Only touch the UI if an assertion is
  impossible at the API level.
- Read the real request/response shapes from
  `src/app/api/connections/route.ts` before writing assertions. Do not guess
  field names.
- Give every fixture a unique suffix so parallel or repeated runs never collide.
- Clean up everything this spec creates, in reverse order, and make cleanup
  tolerant of a failed mid-test state. Delete only ids this spec created.

## Hard constraints

- Do not weaken or skip assertions to get green. No `test.skip`.
- Do not run the hosted E2E suite; it needs shared staging credentials and is
  CI's job. Local verification is `npm run type-check` and `npm run lint`.
- If you conclude the coverage is impossible without editing a file outside your
  allowed scope, stop and write out why instead of editing it.
