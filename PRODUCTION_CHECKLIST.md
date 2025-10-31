## 프로덕션 전환 체크리스트

아래 체크리스트를 순서대로 완료해 프로덕션 품질을 확보하세요. 각 항목은 가능한 한 자동화(CI/CD)로 강제하는 것을 권장합니다.

### 1) 환경/런타임
- [x] Node 버전 고정: `.nvmrc=20`, CI Node 20 고정(`.github/workflows/ci.yml`), `package.json`의 `engines.node=20.x`
- [ ] 환경 변수 분리: Production/Preview/Development 별로 Vercel Project Env에 설정
  - [ ] `SUPABASE_URL`, `SUPABASE_ANON_KEY` (클라이언트용)
  - [ ] 서버 작업용 서비스 롤 키는 서버 사이드에서만 사용(노출 금지)
- [x] 비밀/시크릿 검증: 레포 내 시크릿 패턴(Private Key, SUPABASE_*, DATABASE_URL 등) 스캔 — 유출 흔적 없음

### 2) 데이터/Supabase
- [ ] RLS(Row Level Security) 활성화 및 최소권한 정책 적용
  - 예시 템플릿: `scripts/supabase/rls-template.sql` 참고(테이블/컬럼명에 맞게 수정 후 적용)
- [ ] 마이그레이션 적용: 모든 `*.sql` (예: `migration-add-subtype.sql`)을 Prod DB에 적용/검증
  - 방법 1: Vercel/DB 대시보드에서 수동 실행
  - 방법 2: 스크립트 실행
    - Unix/MacOS: `DATABASE_URL="<prod_db_url>" bash scripts/supabase/apply-migrations.sh`
    - 주의: `psql` 설치 필요, 실패 시 즉시 중단(`ON_ERROR_STOP=1`)
- [ ] 롤백 전략 준비: 각 마이그레이션에 대한 롤백 스크립트/절차 문서화
- [ ] 인덱스/성능 점검: 느린 쿼리 점검 및 필요한 인덱스 추가
- [ ] 스토리지/버킷 권한 검증: 퍼블릭/프라이빗 구분, URL 접근 통제

### 3) 앱 품질/성능
- [ ] 번들 분석: 불필요한 대형 의존성 제거, 다이나믹 임포트/코드 스플리팅 적용
  - `next.config.ts`에 `experimental.optimizePackageImports` 적용(부분 임포트 최적화)
  - 코드 레벨에서 `next/dynamic` 도입 권장(무거운 컴포넌트 지연 로딩)
  - 번들 분석은 플러그인 설치 필요(추후 `@next/bundle-analyzer` 도입 권장)
- [x] 캐싱 전략: 정적 자산 장기 캐시, 이미지 최적화(`next/image`)
  - `next.config.ts`에서 정적 파일 `Cache-Control: max-age=31536000, immutable` 헤더 설정
  - `vercel.json`에도 동일 헤더 반영(플랫폼 레벨 캐시 강화)
  - 이미지: AVIF/WEBP 포맷 허용 및 최소 TTL 설정
  - 페이지 캐시 정책(ISR/Route Handlers)은 페이지별 요구사항에 맞춰 개별 설정 필요
- [ ] 접근성(A11y): 키보드 탐색/ARIA 라벨 테스트 통과
- [ ] SEO: `robots.txt`, `sitemap.xml`, 메타/OG 태그 구성

### 4) 보안/헤더
- [ ] 보안 헤더 적용: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `Referrer-Policy`
- [ ] 의존성 스캔: `npm audit`/`pnpm audit`, GitHub Advanced Security/CodeQL 활성화
- [ ] 쿠키/세션 보안: `Secure`, `HttpOnly`, `SameSite` 속성 및 CSRF 고려

### 5) 테스트/품질 게이트
- [x] Lint/Format: ESLint/Prettier 일관 적용, CI에서 강제 (`ci.yml`/`code-quality.yml`에 ESLint+Prettier 체크 포함)
- [x] 타입체크 복구: `tsc --noEmit` CI 통과(Pre-commit에선 비활성 유지, CI에서 필수 실행)
- [ ] 단위/통합 테스트: Jest `--ci` 그린 상태 유지, 비동기 타임아웃 안정화
- [ ] E2E 스모크: Playwright 핵심 시나리오(목록/상세/생성/수정/검색) 통과 및 재시도 설정

### 6) 로깅/관찰성
- [ ] 오류 모니터링: Sentry(또는 동등) DSN 설정 및 릴리스/소스맵 업로드
- [ ] 로그 구조화: `src/utils/logger.ts` JSON 구조, PII 필터링
- [ ] 알림/헬스체크: Sentry Alert Rule, Uptime 모니터(Healthchecks/UptimeRobot) 구성

### 7) CI/CD
- [ ] GitHub Actions 활성화: `.github/workflows/*` 파이프라인에서 아래 수행
  - [ ] Install: `npm ci` (또는 `pnpm i --frozen-lockfile`)
  - [ ] Lint/Type: `eslint .`, `tsc --noEmit`
  - [ ] Test: `jest --ci`
  - [ ] E2E(optional): `npx playwright install --with-deps && npx playwright test`
- [ ] 시크릿 등록: `SUPABASE_*`, `SENTRY_AUTH_TOKEN` 등 GitHub 환경 시크릿 저장
- [ ] 브랜치 보호: `main` 보호 규칙, 필수 리뷰/상태 체크 강제

### 8) Vercel 설정
- [ ] 커스텀 도메인 연결 및 HTTPS 확인
- [ ] 리다이렉트/리라이팅 규칙(`vercel.json`) 검증
- [ ] Edge/Region 선택 및 함수 타임아웃 확인
- [ ] 프리뷰 배포 접근 제한(팀 전용) 필요 시 설정
- [ ] Vercel Analytics 또는 GA4 연동

### 9) 운영 준비물
- [ ] 런북: 배포/롤백, 마이그레이션 절차, 장애 대응 문서
- [ ] 백업: DB 자동 백업/보존 기간 설정, 복구 리허설 1회 이상
- [ ] 버전/릴리스: 태깅, `CHANGELOG.md` 규칙 수립

---

## 빠른 실행 가이드(샘플)

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
# SUPABASE_URL, SUPABASE_ANON_KEY 등
# (CLI 예시)
# vercel env add NEXT_PUBLIC_SUPABASE_URL production
# vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# vercel env add SUPABASE_SERVICE_ROLE_KEY production

# 보안 헤더(CSP) 적용 예시: next.config.ts에서 headers() 활용
# Strict-Transport-Security, X-Frame-Options, Referrer-Policy 등 함께 설정
```

필요 시 각 항목을 자동화하는 PR(.github/workflows 설정, Sentry 연동, CSP/보안 헤더 추가)도 바로 준비할 수 있습니다.


