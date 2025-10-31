# 🚀 프로덕션 배포 가이드

이 문서는 HC Violins and Bows 앱을 프로덕션 환경에 배포하기 위한 단계별 가이드를 제공합니다.

## ✅ 사전 준비 완료 사항

다음 항목들이 이미 완료되었습니다:

- ✅ Node 20.x 버전 고정
- ✅ RLS 보안 정책 적용
- ✅ 번들 최적화 및 캐싱 전략
- ✅ 보안 헤더 설정
- ✅ 의존성 보안 스캔 (0 vulnerabilities)
- ✅ Lint/Type/Test 통과
- ✅ CI/CD 파이프라인 구성

## 📋 배포 전 체크리스트

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

**또는 CLI 사용:**

```bash
# 설정
export DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"

# 마이그레이션 실행
bash scripts/supabase/apply-migrations.sh
```

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

## 🚀 배포 프로세스

### 자동 배포 (GitHub Actions)

`main` 브랜치에 push하면 자동으로:

1. ✅ Lint/Type 체크
2. ✅ 테스트 실행 (203 tests)
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

## 🔍 배포 후 검증

### 1. 기본 기능 확인

✅ 로그인/인증
✅ Clients CRUD
✅ Instruments CRUD
✅ Dashboard 로딩
✅ 검색/필터
✅ 정렬

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

## 📊 모니터링

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

## 📝 핵심 사항

1. **Environment Variables**: Production/Preview/Development 분리 필수
2. **서비스 롤 키**: 서버 사이드 전용 (절대 클라이언트 노출 금지)
3. **RLS 정책**: 모든 테이블에 적용 확인
4. **보안 헤더**: CSP는 동적 콘텐츠와 충돌로 제외
5. **자동 배포**: `main` 브랜치 push 시 트리거
6. **브랜치 보호**: 필수 리뷰 + 상태 체크 통과

---

**배포 준비 완료! 🎉**
