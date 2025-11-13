# GitHub Actions Workflows

이 레포지토리는 다음과 같은 CI/CD 워크플로를 사용합니다:

## 1. CI/CD Pipeline (`.github/workflows/ci.yml`)

메인 CI/CD 파이프라인:

### Jobs

1. **test**: 테스트 및 코드 품질 검사
   - Node 20.x 환경 설정
   - `npm ci`로 의존성 설치
   - Type check (`npm run type-check`)
   - Lint (`npm run lint`)
   - 단위 테스트 (`npm run test -- --ci --coverage`)
   - Codecov로 커버리지 업로드

2. **build**: 프로덕션 빌드
   - `test` job 완료 후 실행
   - `npm run build`로 빌드
   - 빌드 아티팩트를 업로드

3. **e2e-tests**: E2E 테스트
   - `build` job 완료 후 실행
   - Playwright 브라우저 설치
   - 빌드 아티팩트 다운로드
   - E2E 테스트 실행 (`npm run test:e2e`)
   - 실패 시 리포트 업로드

4. **deploy**: Vercel 배포
   - `main` 브랜치에서만 실행
   - Vercel 프로덕션 환경으로 배포

### 트리거

- Push/PR to `main` or `develop` 브랜치

### 필요 시크릿

- `VERCEL_TOKEN`: Vercel 토큰
- `ORG_ID`: Vercel Org ID
- `PROJECT_ID`: Vercel Project ID

## 2. Security Scan (`.github/workflows/security.yml`)

보안 스캔:

### Jobs

- npm audit 실행
- Snyk 취약점 스캔

### 트리거

- Push/PR to `main` or `develop`
- 매주 월요일 오전 2시 (스케줄)

### 필요 시크릿

- `SNYK_TOKEN`: Snyk 토큰 (선택)

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
  - `E2E Tests`
- Require pull request reviews before merging

## 로컬에서 재현

### CI 검증 (로컬)

```bash
npm ci
npm run type-check
npm run lint
npm run test -- --ci --coverage
npm run build
npm run test:e2e
```

### Security 검증

```bash
npm audit --audit-level=moderate
```

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
