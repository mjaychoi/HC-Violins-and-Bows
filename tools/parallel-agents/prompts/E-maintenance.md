Add end-to-end critical coverage for the maintenance-task CRUD lifecycle.

## Deliverable

A new spec file:

    tests/e2e/maintenance.critical.spec.ts

Do **not** modify `tests/e2e/critical-path.spec.ts` or
`tests/e2e/calendar.spec.ts`.

## Coverage required

As the seeded **admin** identity:

1. `POST /api/maintenance-tasks` — create a task against an instrument this
   spec created.
2. `GET /api/maintenance-tasks` — the new task appears in the list.
3. Calendar/UI visibility — **only if it is stable**. Check how
   `tests/e2e/calendar.spec.ts` locates maintenance entries. If that surface is
   flaky or depends on data this spec does not own, skip the UI assertion and
   note in a comment why it was left out. Do not add a flaky assertion to the
   blocking critical suite.
4. `PATCH /api/maintenance-tasks` — update it and assert the change.
5. `DELETE /api/maintenance-tasks` — remove it.
6. `GET`/list — confirm it is absent.

## Fixture discipline

Modify and delete **only** fixtures this spec created. Never PATCH or DELETE a
maintenance task, instrument, or client that the spec did not create: hosted
staging is shared, and other specs rely on its rows.

Give each fixture a unique suffix, track created ids, and clean up in reverse
order with failure-tolerant cleanup.

## Conventions to follow

- Tag every test `tag: '@critical'`.
- `test.use({ storageState: ADMIN_AUTH_STATE_PATH })`, then
  `assertCookieBackedAuth(page)`.
- Read `src/app/api/maintenance-tasks/route.ts` for the real payload and
  response shapes before asserting. Do not guess field names.

## Hard constraints

- Do not weaken or skip assertions to get green. No `test.skip`.
- Do not run the hosted E2E suite locally.
