Add end-to-end critical coverage for the sale lifecycle.

## Deliverable

A new spec file:

    tests/e2e/sale-lifecycle.critical.spec.ts

Do **not** modify `tests/e2e/critical-path.spec.ts` or `tests/e2e/sales.spec.ts`.

## Coverage required

As the seeded **admin** identity:

1. `POST /api/sales` creates a sale for an instrument this spec created.
2. The instrument's status becomes `Sold` (assert via the instruments API).
3. Idempotency replay: repeat the same `POST` with the **same**
   `Idempotency-Key` header and assert it does not create a second sale. Read
   `src/app/api/_utils/createIdempotency.ts` and the sales handler for the real
   replay contract before asserting.
4. Refund/cancel behaviour via `PATCH /api/sales` — assert the resulting sale
   state and the instrument's status transition.
5. Invoice removal: `DELETE /api/invoices/[id]` then `GET /api/invoices/[id]`
   returns **404**.

## Cleanup: investigate before you implement

**Do not invent destructive cleanup against shared staging.**
**Investigate and report a safe cleanup strategy before adding one.**

Facts to start from, which you must verify yourself:

- `/api/sales` exposes `GET`, `POST`, and `PATCH` — there is **no** `DELETE`
  route. A sale created by this spec therefore cannot simply be deleted the way
  connections or maintenance tasks can.
- The hosted E2E target is a **shared** staging Supabase project. Other specs
  and other engineers depend on its data. Blind deletes, table truncation, or
  service-role cleanup scripts are not acceptable.

So, before writing cleanup:

1. Read the sale, instrument, and invoice handlers and the relevant migrations
   in `supabase/migrations/` to find what a sale actually mutates.
2. Decide whether a safe strategy exists — for example reversing the sale
   through the supported `PATCH` transition, leaving uniquely-tagged fixture
   rows in place, or scoping fixtures so they are inert.
3. Write your conclusion into a comment block at the top of the spec: what you
   chose, what you deliberately leave behind, and what an operator would need to
   do for a full teardown.

If no safe automated cleanup exists, say so explicitly and leave the fixtures
uniquely tagged and identifiable instead of deleting data you do not own. A
documented leak is better than an unsafe delete on shared staging.

## Conventions to follow

- Tag every test `tag: '@critical'`.
- `test.use({ storageState: ADMIN_AUTH_STATE_PATH })`, then
  `assertCookieBackedAuth(page)`.
- Unique suffix on every fixture; drive the API with `page.request.*`.

## Hard constraints

- Do not weaken or skip assertions to get green. No `test.skip`.
- Do not add a migration, and do not modify application code.
- Do not run the hosted E2E suite locally.
