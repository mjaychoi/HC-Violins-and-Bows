# 🚀 프로덕션 배포 가이드

이 문서는 HC Violins and Bows 앱을 프로덕션 환경에 배포하기 위한 완전한 가이드와 체크리스트를 제공합니다.

## 📋 목차

1. [사전 준비 사항](#사전-준비-사항)
2. [배포 전 체크리스트](#배포-전-체크리스트)
3. [환경 설정](#환경-설정)
4. [배포 프로세스](#배포-프로세스)
5. [배포 후 검증](#배포-후-검증)
6. [모니터링 및 알림](#모니터링-및-알림)
7. [문제 해결](#문제-해결)

---

## ✅ 사전 준비 사항

다음 항목들이 이미 완료되었습니다:

- ✅ Node 20.x 버전 고정
- ✅ RLS 보안 정책 적용
- ✅ 번들 최적화 및 캐싱 전략
- ✅ 보안 헤더 설정
- ✅ 의존성 보안 스캔 (0 vulnerabilities)
- ✅ Lint/Type/Test 통과
- ✅ CI/CD 파이프라인 구성

---

## 📋 배포 전 체크리스트

### 1. 환경/런타임

- [x] Node 버전 고정: `.nvmrc=20`, CI Node 20 고정, `package.json`의 `engines.node=20.x`, `vercel.json` 함수 런타임 20 지정
- [ ] 환경 변수 분리: Production/Preview/Development 별로 Vercel Project Env에 설정
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (클라이언트용)
  - [ ] 서버 작업용 서비스 롤 키는 서버 사이드에서만 사용(노출 금지)
- [x] 비밀/시크릿 검증: 레포 내 시크릿 패턴(Private Key, SUPABASE\_\*, DATABASE_URL 등) 스캔 — 유출 흔적 없음

### 2. 데이터/Supabase

- [x] RLS(Row Level Security) 활성화 및 최소권한 정책 적용
  - `database-schema.sql`에 모든 테이블에 대한 RLS 정책 적용 완료
  - 인증된 사용자 모든 작업 허용 정책 설정 (`auth.role() = 'authenticated'`)
  - 스토리지 버킷(`instrument-images`) 업로드/조회/삭제 정책 설정
- [ ] 마이그레이션 적용: 모든 `*.sql` (예: `migration-add-subtype.sql`, `migration-maintenance-tasks.sql`)을 Prod DB에 적용/검증
  - 방법 1: Supabase 대시보드에서 수동 실행
  - 방법 2: 스크립트 실행 (`scripts/supabase/apply-migrations.sh`)
- [ ] 롤백 전략 준비: 각 마이그레이션에 대한 롤백 스크립트/절차 문서화
- [ ] 인덱스/성능 점검: 느린 쿼리 점검 및 필요한 인덱스 추가
- [ ] 스토리지/버킷 권한 검증: 퍼블릭/프라이빗 구분, URL 접근 통제

### 3. 앱 품질/성능

- [x] 번들 분석: 불필요한 대형 의존성 제거, 다이나믹 임포트/코드 스플리팅 적용
  - `next.config.ts`에 `experimental.optimizePackageImports` 적용
  - `date-fns`, `react-window` 최적화 설정 완료
  - 코드 레벨에서 `next/dynamic` 도입
  - 번들 분석기 준비: `ANALYZE=1 next build`
- [x] 캐싱 전략: 정적 자산 장기 캐시, 이미지 최적화(`next/image`)
  - `next.config.ts`에서 정적 파일 `Cache-Control: max-age=31536000, immutable` 헤더 설정
  - `vercel.json`에도 동일 헤더 반영
  - 이미지: AVIF/WEBP 포맷 허용 및 최소 TTL 설정
- [ ] 접근성(A11y): 키보드 탐색/ARIA 라벨 테스트 통과
- [ ] SEO: `robots.txt`, `sitemap.xml`, 메타/OG 태그 구성

### 4. 보안/헤더

- [x] 보안 헤더 적용: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`
  - `next.config.ts`와 `vercel.json`에 보안 헤더 설정 완료
  - CSP는 동적 콘텐츠와 충돌로 제외
- [x] 의존성 스캔: `npm audit`, GitHub Advanced Security/CodeQL 활성화
  - CI 워크플로(`security.yml`)에 npm audit 및 Snyk 스캔 설정
  - npm audit: 0 vulnerabilities
- [ ] 쿠키/세션 보안: `Secure`, `HttpOnly`, `SameSite` 속성 및 CSRF 고려 (Supabase 인증 사용 중)

### 5. 테스트/품질 게이트

- [x] Lint/Format: ESLint/Prettier 일관 적용, CI에서 강제
- [x] 타입체크: `tsc --noEmit` CI 통과
- [x] 단위/통합 테스트: Jest `--ci` 그린 상태 유지 (713 tests passed)
- [ ] E2E 스모크: Playwright 핵심 시나리오(목록/상세/생성/수정/검색) 통과 및 재시도 설정

### 6. 로깅/관찰성

- [ ] 오류 모니터링: Sentry(또는 동등) DSN 설정 및 릴리스/소스맵 업로드
- [ ] 로그 구조화: `src/utils/logger.ts` JSON 구조, PII 필터링
- [ ] 알림/헬스체크: Sentry Alert Rule, Uptime 모니터(Healthchecks/UptimeRobot) 구성

### 7. CI/CD

- [x] GitHub Actions 활성화: `.github/workflows/*` 파이프라인에서 아래 수행
  - [x] Install: `npm ci`
  - [x] Lint/Type: `eslint .`, `tsc --noEmit`
  - [x] Test: `jest --ci`
  - [x] E2E(optional): `npx playwright install --with-deps && npx playwright test`
- [ ] 시크릿 등록: `SUPABASE_*`, `SENTRY_AUTH_TOKEN` 등 GitHub 환경 시크릿 저장
- [ ] 브랜치 보호: `main` 보호 규칙, 필수 리뷰/상태 체크 강제

### 8. Vercel 설정

- [ ] 커스텀 도메인 연결 및 HTTPS 확인
- [ ] 리다이렉트/리라이팅 규칙(`vercel.json`) 검증
- [ ] Edge/Region 선택 및 함수 타임아웃 확인
- [ ] 프리뷰 배포 접근 제한(팀 전용) 필요 시 설정
- [ ] Vercel Analytics 또는 GA4 연동

### 9. 운영 준비물

- [ ] 런북: 배포/롤백, 마이그레이션 절차, 장애 대응 문서
- [ ] 백업: DB 자동 백업/보존 기간 설정, 복구 리허설 1회 이상
- [ ] 버전/릴리스: 태깅, `CHANGELOG.md` 규칙 수립

---

## 환경 설정

### 1. GitHub 환경 설정

#### GitHub Secrets 등록

레포지토리 Settings > Secrets and variables > Actions에서 다음 추가:

```bash
# 필수 (Vercel 배포용)
VERCEL_TOKEN=your_vercel_token
ORG_ID=your_vercel_org_id
PROJECT_ID=your_vercel_project_id

# 선택 (보안/모니터링용)
SNYK_TOKEN=your_snyk_token
SONAR_TOKEN=your_sonarcloud_token
SENTRY_AUTH_TOKEN=your_sentry_token
```

**Vercel 토큰 발급 방법:**

1. Vercel Dashboard > Settings > Tokens
2. "Create Token" 클릭
3. 이름 입력 및 "Full Account" 선택
4. 생성된 토큰 복사

**Org ID & Project ID 찾기:**

1. Vercel Dashboard > Settings > General
2. Team ID 및 Project Settings에서 확인

#### 브랜치 보호 규칙 설정

Settings > Branches > Add rule for `main`:

```
Branch name pattern: main
☑ Require pull request reviews before merging
☑ Require status checks to pass before merging
  ☑ Test & Lint
  ☑ Build
  ☑ E2E Tests
☑ Require conversation resolution before merging
☑ Include administrators
```

### 2. Vercel 프로젝트 설정

#### 프로젝트 연결

1. Vercel Dashboard > "Add New" > "Project"
2. GitHub 레포지토리 선택
3. Framework: Next.js
4. Root Directory: `./` (기본값)

#### 환경 변수 설정

Settings > Environment Variables에서 다음 추가:

**Production:**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
NODE_ENV=production
```

**Preview:**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=https://your-preview.vercel.app
NODE_ENV=preview
```

**Development:**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

⚠️ **중요:** Supabase Service Role Key는 **절대** 클라이언트 사이드에 노출되면 안 됩니다!

#### 빌드 설정 확인

Settings > General:
```
Framework Preset: Next.js
Build Command: npm run build
Output Directory: .next
Install Command: npm ci
Development Command: npm run dev
Node.js Version: 20.x
```

### 3. Supabase 데이터베이스 설정

#### 마이그레이션 적용

1. Supabase Dashboard > SQL Editor
2. 다음 파일 순서대로 실행:
   - `database-schema.sql` (RLS 정책 포함)
   - `migration-add-subtype.sql` (subtype 컬럼 추가)
   - `migration-maintenance-tasks.sql` (캘린더 기능용)

**또는 CLI 사용:**
```bash
# 설정
export DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"

# 마이그레이션 실행
bash scripts/supabase/apply-migrations.sh
```

자세한 내용은 [데이터베이스 마이그레이션 가이드](./DATABASE_MIGRATION.md)를 참조하세요.

#### Storage 버킷 설정

1. Storage > "instrument-images" 버킷 생성
2. Settings > Policies에서 다음 정책 활성화:

```sql
-- View/Download policy
CREATE POLICY "Anyone can view images"
ON storage.objects FOR SELECT
USING (bucket_id = 'instrument-images');

-- Upload policy (authenticated only)
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'instrument-images' AND
  auth.role() = 'authenticated'
);

-- Delete policy (authenticated only)
CREATE POLICY "Authenticated users can delete images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'instrument-images' AND
  auth.role() = 'authenticated'
);
```

### 4. 커스텀 도메인 (선택)

1. Vercel > Project > Settings > Domains
2. "Add Domain" 클릭
3. 도메인 입력 후 DNS 설정 안내 따르기
4. HTTPS 자동 설정됨

### 5. 모니터링 설정 (선택)

#### Sentry 통합

1. Sentry 계정 생성 및 프로젝트 생성
2. Environment Variables 추가:
   ```
   SENTRY_DSN=your_sentry_dsn
   SENTRY_ORG=your_org
   SENTRY_PROJECT=your_project
   ```
3. GitHub Secret 추가: `SENTRY_AUTH_TOKEN`

#### Vercel Analytics

1. Vercel > Project > Analytics
2. "Enable Analytics" 활성화
3. Web Vitals 추적 시작

---

## 🚀 배포 프로세스

### 자동 배포 (GitHub Actions)

`main` 브랜치에 push하면 자동으로:

1. ✅ Lint/Type 체크
2. ✅ 테스트 실행 (713 tests)
3. ✅ 빌드 검증
4. ✅ E2E 테스트
5. ✅ Vercel 프로덕션 배포

**포함 워크플로:**

- `ci.yml` - 메인 CI/CD 파이프라인
- `code-quality.yml` - 코드 품질 검사
- `security.yml` - 보안 스캔 (주간 실행)

### 수동 배포 (CLI)

```bash
# Vercel CLI 설치
npm i -g vercel

# 로그인
vercel login

# 프로덕션 배포
vercel --prod
```

---

## 🔍 배포 후 검증

### 1. 기본 기능 확인

✅ 로그인/인증  
✅ Clients CRUD  
✅ Instruments CRUD  
✅ Dashboard 로딩  
✅ 검색/필터  
✅ 정렬  
✅ Calendar 기능

### 2. 보안 헤더 확인

```bash
curl -I https://your-domain.vercel.app | grep -i "x-frame-options\|x-content-type-options\|referrer-policy"
```

예상 출력:
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

### 3. 성능 확인

```bash
# Lighthouse 테스트
npx lighthouse https://your-domain.vercel.app --view

# 또는 브라우저 DevTools > Lighthouse
```

목표 점수:
- Performance: 90+
- Accessibility: 95+
- Best Practices: 95+
- SEO: 90+

---

## 📊 모니터링 및 알림

### 체크리스트

- [ ] Vercel Analytics 활성화
- [ ] Error Tracking (Sentry) 확인
- [ ] Performance Monitoring 설정
- [ ] Uptime Monitoring (UptimeRobot)
- [ ] 로그 수집 확인

### 알림 설정

- [ ] 빌드 실패 알림 (GitHub)
- [ ] 에러 알림 (Sentry)
- [ ] 다운타임 알림 (Uptime)
- [ ] 보안 취약점 알림 (Snyk)

---

## 🔄 롤백 절차

### 즉시 롤백 (Vercel)

```bash
# 이전 배포로 롤백
vercel rollback --prod
```

### 데이터베이스 롤백

```bash
# Supabase Dashboard > Database > Backups
# 또는 SQL로 수동 복구
```

---

## 🆘 문제 해결

### 빌드 실패

```bash
# 로컬 재현
npm ci
npm run build

# 캐시 클리어
rm -rf .next node_modules
npm ci && npm run build
```

### 환경 변수 누락

Vercel Dashboard > Settings > Environment Variables 확인

### 데이터베이스 연결 실패

Supabase Dashboard > Settings > API에서 URL/Key 확인

### CI 실패

GitHub Actions > Failed Workflow > View logs

---

## 📝 핵심 사항

1. **Environment Variables**: Production/Preview/Development 분리 필수
2. **서비스 롤 키**: 서버 사이드 전용 (절대 클라이언트 노출 금지)
3. **RLS 정책**: 모든 테이블에 적용 확인
4. **보안 헤더**: CSP는 동적 콘텐츠와 충돌로 제외
5. **자동 배포**: `main` 브랜치 push 시 트리거
6. **브랜치 보호**: 필수 리뷰 + 상태 체크 통과

---

## 🚀 빠른 시작

```bash
# CI 품질 게이트(로컬 재현)
npm ci
npm run lint
npm run type-check
npm test -- --ci

# E2E(옵션)
npx playwright install --with-deps
npx playwright test

# Vercel 환경 변수 설정(대시보드에서 수동 등록 권장)
# NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 등
```

---

## 📚 관련 문서

- [데이터베이스 마이그레이션 가이드](./DATABASE_MIGRATION.md)
- [캘린더 설정 가이드](./CALENDAR_SETUP_GUIDE.md)
- [프로젝트 README](../README.md)

---

**배포 준비 완료! 🎉**

