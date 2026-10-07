# GitHub Actions Workflows

이 레포지토리는 다음과 같은 CI/CD 워크플로를 사용합니다:

## 1. CI/CD Pipeline (`.github/workflows/ci.yml`)

메인 CI/CD 파이프라인:

### Jobs

1. **test**: 테스트 및 코드 품질 검사
   - Node 24.x 환경 설정
   - `npm ci`로 의존성 설치
   - Type check (`npm run type-check`)
   - Lint (`npm run lint`, zero-warning: `eslint . --max-warnings=0`)
   - 단위 테스트 (`npm run test -- --ci --coverage`)
   - Codecov로 커버리지 업로드

2. **build**: 프로덕션 빌드
   - `test` job 완료 후 실행
   - `npm run build`로 빌드
   - 빌드 아티팩트를 업로드

3. **E2E Tests**: 프로덕션 빌드 대상 크리티컬 패스 브라우저 테스트
   - `build` job 완료 후 실행 (blocking, `continue-on-error` 없음)
   - 전용 테스트/스테이징 Supabase 시크릿이 없으면 실패 (silent skip 없음)
   - Chromium만 설치
   - `next build` 후 standalone artifact(`node .next/standalone/server.js`)로 프로덕션 서버를 기동
   - `npm run test:e2e:critical` 실행
   - 실패 시 Playwright HTML 리포트/`test-results` 아티팩트 업로드 (`.env`/세션 파일은 업로드하지 않음)

Firefox/WebKit/모바일 프로젝트는 PR blocking 경로에 포함하지 않습니다. 로컬 또는 필요 시 `npm run test:e2e:all-browsers`로 전체 매트릭스를 실행하세요. 이 저장소에는 별도 nightly E2E 워크플로가 없으며, 이 변경에서 스케줄 아키텍처를 추가하지 않습니다.

This workflow does **not** deploy to Vercel and does **not** run production
migrations. Vercel install/build commands live in `vercel.json`. Production
DB deploy is `.github/workflows/production-db-deploy.yml`. Operator guide:
`docs/DEPLOYMENT.md`.

### 트리거

- Push/PR to `main` or `develop` 브랜치

### 필요 시크릿

- `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`: E2E Tests job용 테스트/스테이징 Supabase
- `STAGING_SUPABASE_PROJECT_REF` (repository variable): E2E Tests가 해당 스테이징 project ref만 사용하도록 allowlist

`ci.yml` does not consume `VERCEL_TOKEN` / `ORG_ID` / `PROJECT_ID`. Those
are not required for repository CI. Production DB secrets belong on the
`production` Environment (`production-db-deploy.yml`).

Git-integrated Vercel production promotion is **not** gated by `/api/ready` or the post-deploy synthetic. The strongest current deployment validation hook is `.github/workflows/hosted-staging-integration.yml` (`workflow_dispatch` + `hosted-staging`): wait for `/api/ready`, then `npm run test:synthetic:postdeploy`. `migration_rehearsal_mode=off` preserves that validation-only path. `inspect` / `apply` add a two-phase hosted pending-migration rehearsal against non-production staging only. That job is a staging release check, not an automatic production blocker.

## 2. Security Scan (`.github/workflows/security.yml`)

보안 스캔. Results are classified in the Actions job summary. Do not treat a
green job as “Snyk passed” when Snyk was skipped.

### Jobs

- Production npm audit (`npm audit --omit=dev --audit-level=high`): **blocking**
- Full npm audit (`npm audit --audit-level=high`): **advisory** (`PASS` / `ADVISORY_FINDINGS` / `TOOL_ERROR`)
- Snyk (`--severity-threshold=high`): **optional supplemental** (`PASS` / `FINDINGS_OR_TOOL_ERROR` / `SKIPPED_NO_TOKEN` / `TOOL_ERROR`)

### 트리거

- Push/PR to `main` or `develop`
- 매주 월요일 오전 2시 (스케줄)

### 필요 시크릿

- `SNYK_TOKEN`: Snyk 토큰 (선택). Absent token ⇒ `SKIPPED_NO_TOKEN`, not PASS.
  Ordinary PR CI does not require this secret.

## 3. Code Quality (`.github/workflows/code-quality.yml`)

코드 품질 검사:

### Jobs

- ESLint 실행
- Prettier 체크
- Type check
- SonarCloud 스캔

### 트리거

- Push/PR to `main` or `develop` 브랜치

### 필요 시크릿

- `SONAR_TOKEN`: SonarCloud 토큰 (선택)

## 설정 방법

### 1. GitHub Secrets 추가

E2E/staging secrets are listed above. Do not add production `DATABASE_URL`
as a repository-level secret for CI.

### 2. Vercel 프로젝트 연결

Vercel dashboard Git integration (if enabled) is platform-side. It is not
implemented by `ci.yml`. Install/build: `npm ci` / `npm run deploy:build`.

### 3. 브랜치 보호 규칙

Settings > Branches에서 `main` 브랜치 보호 규칙 추가:

- Required status checks:
  - `Test & Lint`
  - `Build`
  - `E2E Tests` (Chromium critical-path suite against the production standalone artifact)
- Require pull request reviews before merging

## 로컬에서 재현

### CI 검증 (로컬)

```bash
npm ci
npm run type-check
npm run lint
npm run test -- --ci --coverage
npm run test:readiness
npm run test:synthetic
npm run build
npm run test:e2e:install:chromium
npm run test:e2e:critical
```

PR CI의 blocking 게이트는 `npm run test:e2e:critical`입니다. 이 명령은
`next build` 후 standalone artifact를 기동하고 Chromium에서 `@critical`
태그가 붙은 시나리오만 실행합니다. 이미 빌드된 `.next`가 있으면
`PLAYWRIGHT_SKIP_BUILD=true npm run test:e2e:critical`로 서버만 다시 띄울 수
있습니다. 개발 서버 대상 빠른 반복은 `npm run test:e2e:critical:dev` 또는
기존 `npm run test:e2e`를 사용하세요.

전체 브라우저 매트릭스(Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari)는
`npm run test:e2e:install` 후 `npm run test:e2e:all-browsers`로 실행합니다.
`test:e2e`와 `test:e2e:invoice-settings`는 Chromium-only입니다.

### E2E에 필요한 시크릿 (테스트/스테이징 전용)

`E2E Tests` job은 실제 프로덕션 자격 증명을 사용하지 않습니다. GitHub Actions
repository secrets에 전용 테스트 또는 스테이징 Supabase 값을 넣으세요. 이
값들은 `production-db-deploy.yml`이 쓰는 `NEXT_PUBLIC_SUPABASE_*` /
`SUPABASE_SERVICE_ROLE_KEY`와 분리되어 있어야 합니다:

- `STAGING_SUPABASE_URL`
- `STAGING_SUPABASE_ANON_KEY`
- `STAGING_SUPABASE_SERVICE_ROLE_KEY`

Repository variable (identifier, not a credential):

- `STAGING_SUPABASE_PROJECT_REF`: E2E Tests allowlist. The Supabase URL host must match this ref; mismatch fail-closes. Do not point this at production.

선택:

- `E2E_TEST_PASSWORD` / `E2E_TEST_MEMBER_PASSWORD` (기본값 `test123`) — run-scoped admin/member 비밀번호
- `E2E_TEST_ORG_ID` — CI에서는 cleanup deny target으로만 사용 (run org가 이 값과 같으면 거부)
- `E2E_TEST_EMAIL` / `E2E_TEST_MEMBER_EMAIL` — 로컬 legacy 모드 전용 (기본값 `test@test.com` / `e2e-member@test.com`). CI는 더 이상 매핑하지 않습니다.

시크릿이 비어 있으면 job은 성공으로 skip하지 않고 실패합니다.

### Staging storage E2E (S3, optional until provisioned)

Operator handoff: [`docs/ops/staging-storage-e2e.md`](../../docs/ops/staging-storage-e2e.md).
Until provisioned, the job keeps the inert `e2e-ci-placeholder` bucket and no
storage credentials. Names (repository level):

- variables: `E2E_STAGING_STORAGE_ENABLED` (`true` / `false` / unset),
  `E2E_STAGING_S3_BUCKET_NAME`, `E2E_STAGING_S3_REGION`,
  `PRODUCTION_S3_BUCKET_NAME` (deny target)
- secrets: `E2E_STAGING_AWS_ACCESS_KEY_ID`, `E2E_STAGING_AWS_SECRET_ACCESS_KEY`

`Configure staging storage E2E (fail-closed)` fails on partial or
non-staging configuration; when enabled it exports the validated bucket,
credentials, and `STORAGE_E2E_KEY_PREFIX=e2e/<scopeKey>`, and a cleanup step
deletes exactly `e2e/<scopeKey>/`. Never map the legacy repo `S3_*` /
`STORAGE_TYPE` secrets into the E2E job.

### Run-scoped E2E identities (`E2E_RUN_SCOPE`)

Hosted critical E2E runs share one staging Supabase project, so each run gets
its own users, organization, and data:

- CI sets `E2E_RUN_SCOPE=${{ github.run_id }}-${{ github.run_attempt }}-critical`
  automatically — different per workflow run and per rerun attempt, stable
  within the job. Never derive it from `github.sha`.
- The raw scope is hashed to a 12-hex `scopeKey`; nothing else from it reaches
  an email, org name, or database id. From the key, `tests/e2e/e2e-identities.ts`
  derives:
  - admin `hcve2e-<scopeKey>-admin@example.test`, member
    `hcve2e-<scopeKey>-member@example.test` (RFC 6761 reserved domain: no mail
    is ever delivered; users are created with `email_confirm: true`);
  - logout admin `hcve2e-<scopeKey>-logout-admin@example.test`, a dedicated
    primary-org admin whose sessions the logout E2E may globally revoke;
  - org id: a deterministic UUIDv5 (`deriveE2EOrgId(scopeKey, slot)`), named
    `HC Violins E2E <scopeKey>`;
  - a second, cross-tenant org (`slot = 'secondary'`, named
    `HC Violins E2E <scopeKey> secondary`) with its own admin
    `hcve2e-<scopeKey>-secondary-admin@example.test`
    (`getE2ESecondaryAdminIdentity()`), used by
    `tests/e2e/cross-tenant.critical.spec.ts` as "the other tenant";
  - `app_metadata` `{ org_id, role, e2e_managed: true, e2e_run_scope: <scopeKey> }`
    (`org_id` is the secondary org for the secondary admin);
  - storage E2E object keys under `e2e/<scopeKey>/` (S3 instrument images /
    certificates; see the staging storage section above).
- **Fail-closed:** with `CI=true`, or `PLAYWRIGHT_SUITE=critical` plus
  `STAGING_SUPABASE_PROJECT_REF`, a missing `E2E_RUN_SCOPE` stops global setup.
  There is no fallback to the shared identities.
- **Local:** without `E2E_RUN_SCOPE`, local runs keep the old `E2E_TEST_*`
  behaviour unchanged. Setting it locally requires the staging allowlist env
  (setup and cleanup both run `assertE2EStagingProjectAllowlist`).
- **Cleanup is scope-bound.** Playwright `globalTeardown`, plus an
  `if: always()` CI step (`tests/e2e/cleanup-run-scoped-e2e.ts`) for a
  globalSetup that failed part-way. Cleanup deletes only the two derived org
  ids (children cascade; the FK-less `api_create_idempotency` is deleted by
  `org_id`) and the four derived users. It runs only after every ownership
  check passes for both orgs and all four users: exact email, `e2e_managed`,
  matching `e2e_run_scope` / `org_id` / `role`, org name, and the staging
  allowlist. It then verifies zero residual rows across every `org_id` table
  of both orgs and zero residual users, tolerates a partial setup (missing
  org/user is skipped), and calling it twice is a verified no-op.
  It never deletes by pattern (no `e2e%`, no name prefix, no age), so one run
  can't remove another active run's resources. Orphans left by a crashed
  runner are a separate janitor task.
- Hosted E2E runs execute in parallel, with no concurrency mutex. Two
  scoped critical runs were proven isolated while running concurrently on
  staging. Any new hosted E2E resource must also be derived from the run
  scope (`deriveE2EOrgId`, `deriveE2EScopedEmail`, `e2e/<scopeKey>/`); a
  shared identity would bring back the cross-run races.

### Security 검증

```bash
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
```

The production command is the blocking gate. The full-tree command is
advisory; high findings there are `ADVISORY_FINDINGS`, not a repository PASS.

### Code Quality 검증

```bash
npm run lint
npx prettier --check .
npm run type-check
```

## 문제 해결

### 빌드 실패

- Node 버전 확인 (24.x)
- 의존성 충돌 확인: `rm -rf node_modules package-lock.json && npm install`
- 캐시 클리어: GitHub Actions에서 `Actions` 탭 > `Clear caches`

### 테스트 실패

- 로컬에서 재현 시도
- Playwright 브라우저 재설치: `npx playwright install --with-deps`

### 배포 실패

Vercel failures are diagnosed in the Vercel project (env, Git integration,
build logs). GitHub CI green does not imply Preview/Production health. As of
`main` `2886c5e`, `hc-violins-staging` deploys successfully while
`hc-violins-and-bows` fails with an unconfirmed root cause, because its
build logs are not readable from the Vercel scope available here. See
`docs/DEPLOYMENT.md`.
