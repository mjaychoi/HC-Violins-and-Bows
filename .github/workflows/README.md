# GitHub Actions Workflows

이 레포지토리는 다음과 같은 CI/CD 워크플로를 사용합니다:

## 1. CI/CD Pipeline (`.github/workflows/ci.yml`)

메인 CI/CD 파이프라인:

### Jobs

1. **test**: 테스트 및 코드 품질 검사
   - Node 20.x 환경 설정
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

4. **deploy**: Vercel 배포
   - `main` 브랜치에서만 실행
   - Vercel 프로덕션 환경으로 배포

### 트리거

- Push/PR to `main` or `develop` 브랜치

### 필요 시크릿

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: production-db workflows only
- `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`: E2E Tests job용 테스트/스테이징 Supabase
- `STAGING_SUPABASE_PROJECT_REF` (repository variable): E2E Tests가 해당 스테이징 project ref만 사용하도록 allowlist
- `VERCEL_TOKEN`: Vercel 토큰
- `ORG_ID`: Vercel Org ID
- `PROJECT_ID`: Vercel Project ID

배포 job은 Vercel 시크릿 3개가 모두 설정된 경우에만 실행됩니다.

Git-integrated Vercel production promotion is **not** gated by `/api/ready` or the post-deploy synthetic. The strongest current deployment validation hook is `.github/workflows/hosted-staging-integration.yml` (`workflow_dispatch` + `hosted-staging`): wait for `/api/ready`, then `npm run test:synthetic:postdeploy`. That job is a staging release check, not an automatic production blocker.

## 2. Security Scan (`.github/workflows/security.yml`)

보안 스캔. Results are classified in the Actions job summary. Do not treat a
green job as “Snyk passed” when Snyk was skipped.

### Jobs

- Production npm audit (`npm audit --omit=dev --audit-level=high`): **blocking**
- Full npm audit (`npm audit --audit-level=high`): **advisory** (`PASS` / `ADVISORY_FINDINGS` / `TOOL_ERROR`)
- Snyk (`--severity-threshold=high`): **optional supplemental** (`PASS` / `FINDINGS` / `SKIPPED_NO_TOKEN` / `TOOL_ERROR`)

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

레포지토리 Settings > Secrets and variables > Actions에서 다음 시크릿을 추가하세요:

```bash
VERCEL_TOKEN=your_token_here
ORG_ID=your_org_id_here
PROJECT_ID=your_project_id_here
```

### 2. Vercel 프로젝트 연결

Vercel 대시보드에서:

1. 프로젝트 설정
2. Git 연결
3. 자동 배포 활성화

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

- `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` (기본값 `test@test.com` / `test123`)
- `E2E_TEST_MEMBER_EMAIL` / `E2E_TEST_MEMBER_PASSWORD` (기본값 `e2e-member@test.com` / `test123`)
- `E2E_TEST_ORG_ID`

시크릿이 비어 있으면 job은 성공으로 skip하지 않고 실패합니다.

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

- Node 버전 확인 (20.x)
- 의존성 충돌 확인: `rm -rf node_modules package-lock.json && npm install`
- 캐시 클리어: GitHub Actions에서 `Actions` 탭 > `Clear caches`

### 테스트 실패

- 로컬에서 재현 시도
- Playwright 브라우저 재설치: `npx playwright install --with-deps`

### 배포 실패

- Vercel 토큰 확인
- 환경 변수 확인
- Vercel 프로젝트 설정 확인
