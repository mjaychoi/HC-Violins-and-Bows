# Application / E2E audit — 2026-10-09

Audited merged main: `43098665da78978126f8e0855b3bb4f9962b48e7`.
Verdict: **local regression passed; final hosted/CI closeout remains incomplete**.
No production workflow was dispatched, no production secret was changed, and
no main merge was performed.

## Latest-main run evidence

[CI run 37680342904](https://github.com/mjaychoi/HC-Violins-and-Bows/actions/runs/37680342904):
Test & Lint and Build passed. E2E job `112996606357` was cancelled during
`playwright install --with-deps chromium`: Ubuntu apt mirror requests stopped
progressing until the 45-minute job timeout. The runtime guard self-test,
application build inside the E2E job, and critical browser suite never ran.
This is installation infrastructure evidence, not an application-test failure.

The cancelled attempt's always-run identity cleanup reported
`residualTotal: 0` across both scoped organizations and all four scoped users.
Setup had not created fixtures yet. This proves absence of residue for this
attempt; it does not prove cleanup after a completed latest-main regression or
absence of unrelated historical test data.

A request to re-run that exact E2E job returned HTTP 403,
`Resource not accessible by integration`, from the connected GitHub app.
The run was not re-executed. Actions write access or an authorized GitHub UI
fallback is still needed. Do not substitute a PR-head run for merged-main proof.

Publication is also blocked: branch creation and pull-request creation returned
the same HTTP 403. Git push had no available GitHub authentication. The proposed
changes exist as local commits only; no remote branch or PR was created.

## Coverage and findings

`PLAYWRIGHT_SUITE=critical playwright test --list` selects **32 tests in 7 files**.

| Area                | Reviewed evidence                                                                                                                                                                                                 | Remaining boundary                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-tenant        | Separate primary/secondary orgs; clients, instruments, maintenance, invoices, connection CRUD/reorder; foreign vs nonexistent response parity and owner re-reads after denied writes                              | All 6 selected cross-tenant tests still need a completed latest-main run                                                                     |
| Auth / roles        | Unauthenticated redirect/API denial, fresh login, dedicated logout identity, 9 member authorization tests, financial-field hiding; notes filter both org and owner                                                | Hosted auth matrix was not executed in this session                                                                                          |
| Invoices            | Scoped queries and reference validation, required idempotency/CAS, atomic update contracts; UI unit test verifies second Save adopts returned timestamp; critical invoice update/PDF and draft delete coverage    | Hosted UI two-save plus refresh persistence is still outstanding; critical invoice workflow currently performs one API update                |
| Cleanup             | LIFO route cleanup fails on non-2xx; original body failures retain cleanup diagnostics; global teardown plus CI `always()` safety net; staging allowlist, run ownership, shared-org deny target, residual recount | Completed final regression must also end with `residualTotal=0`; no historical global cleanup was attempted                                  |
| Runtime / retry     | Every critical spec uses the automatic same-origin API 5xx/pageerror guard                                                                                                                                        | Runtime browser self-test could not run locally: browser download unavailable; retain CI self-test                                           |
| Auth state exposure | `tests/e2e/.auth/user.json` is tracked on audited main; member state alone was ignored                                                                                                                            | This PR removes it and ignores the entire directory. Existing Git history and session revocation/rotation require separate operator evidence |

## Local validation on audited main

- Fixture, staging allowlist, tenant/provider, middleware auth, invoice API,
  notes, maintenance: **22 suites, 370 passed, 6 skipped**.
- Connections, sales, instruments, clients, auth matrix selection, existing
  PostgreSQL CA/TLS tests: **29 suites, 414 passed, 7 skipped**.
- Invoice-detail two-save UI contract: **1 suite, 1 passed**, explicitly selected
  by filename (application source unchanged from audited main).
- Runtime guard unit contracts: **1 suite, 28 passed** (application source
  unchanged from audited main); these do not replace the browser self-test.
- Total: **53 suites, 813 passed, 13 skipped**. Six skips are pre-existing PDF
  mock-heavy unit cases; seven are the opt-in hosted auth-matrix suite without
  its environment. Neither group is counted as a pass.
- Critical suite discovery: 32 tests, no suite execution or hosted mutation.

## Changes proposed by this PR

1. Bound apt HTTP/HTTPS waits to 30 seconds with two retries; cap Chromium
   installation at 10 minutes and bound browser connection waits. This avoids
   spending the whole E2E budget on a silent mirror stall and leaves time for
   cleanup. It cannot guarantee a third-party mirror is available.
2. Set `failOnFlakyTests` for critical CI runs. Retries remain diagnostic, but a
   retry-pass cannot satisfy clean closeout. An offline Playwright probe failed
   its first attempt, passed its retry, and correctly exited 1 as `1 flaky`.
3. Remove tracked authentication state and ignore all `tests/e2e/.auth/` files.
   Global setup generates fresh run-scoped state before actual tests.

Changed config passed TypeScript, ESLint, formatting, and diff checks. Final
acceptance must still use one reviewed merged-main SHA, all required critical
tests, runtime guard, no unexplained flakiness, and zero run-scoped residue.
`APPLICATION_E2E_CLOSEOUT_COMPLETE` is **not awarded** by this audit.
