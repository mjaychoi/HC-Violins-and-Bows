<!--
Shared notes referenced by the per-task prompts. The runner does NOT inject this
file; it is here so the task prompts can stay short and so humans editing the
prompts have the repo facts in one place.

Repo facts verified against origin/main:

* Critical suite selection: `PLAYWRIGHT_SUITE=critical` greps for `tag: '@critical'`.
  `scripts/assert-critical-e2e-selected.cjs` fails closed when zero tests carry
  the tag, so every new critical test must be tagged `tag: '@critical'`.
* Auth state: `tests/e2e/e2e-identities.ts` exports `ADMIN_AUTH_STATE_PATH`
  (`tests/e2e/.auth/user.json`) and `MEMBER_AUTH_STATE_PATH`
  (`tests/e2e/.auth/member.json`), plus `getE2EAdminIdentity()`,
  `getE2EMemberIdentity()`, `getE2EOrgId()` and `DEFAULT_E2E_ORG_ID`.
* `tests/e2e/global-setup.ts` seeds both identities via the Supabase service
  role key and persists cookie-backed storage state for each.
* Existing critical tests select identity with
  `test.use({ storageState: ADMIN_AUTH_STATE_PATH })` (or MEMBER_...), assert
  with `assertCookieBackedAuth(page)` from `tests/e2e/test-helpers.ts`, and
  drive the API through `page.request.*` rather than the UI where possible.
* API surface (App Router, `src/app/api/**/route.ts`):
    - connections:       GET POST PATCH PUT DELETE
    - notes:             GET POST PATCH DELETE
    - maintenance-tasks: GET POST PATCH DELETE
    - sales:             GET POST PATCH          (no DELETE)
    - sales/summary-by-client: GET
    - invoices:          GET POST
    - invoices/[id]:     GET PUT DELETE
    - instruments:       GET POST ; instruments/[id]: PATCH
    - clients:           GET POST ...
* Admin-only mutations return 403 with `ADMIN_REQUIRED` / "Admin role required"
  (see `requireAdmin` in `src/app/api/_utils`).
* Create endpoints support an `Idempotency-Key` header
  (`src/app/api/_utils/createIdempotency.ts`).
-->
