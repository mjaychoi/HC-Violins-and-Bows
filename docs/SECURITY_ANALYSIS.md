# 보안 분석 보고서

**최종 업데이트**: 2025-01-15

## 🔒 보안 상태 개요

이 레포지토리는 전반적으로 **양호한 보안 상태**를 보여줍니다. 주요 보안 기능들이 구현되어 있으며, 몇 가지 개선 사항이 있습니다.

---

## ✅ 잘 구현된 보안 기능

### 1. **의존성 보안**

- ✅ `npm audit`: **0개 취약점** (critical, high, moderate, low 모두 0)
- ✅ 정기적인 보안 스캔 (GitHub Actions, 매주 월요일 2시)
- ✅ Snyk 통합 (고위험 취약점 모니터링)

### 2. **민감한 정보 보호**

- ✅ `.gitignore`에 `.env*` 파일 제외 (`.env.template`만 포함)
- ✅ 환경 변수 템플릿 제공 (`env.template`)
- ✅ **에러 sanitization 구현** (`src/utils/errorSanitization.ts`)
  - API 키, 토큰, JWT 마스킹
  - 이메일, 전화번호 마스킹
  - 데이터베이스 연결 문자열 마스킹
  - 프로덕션 환경에서 stack trace 제거

### 3. **SQL Injection 방지**

- ✅ **Supabase ORM 사용** (파라미터화된 쿼리)
- ✅ **Whitelist 검증** (`validateSortColumn` 함수)
- ✅ 검색어 sanitization (`sanitizeSearchTerm`)
- ✅ UUID 검증 (`validateUUID`)

```typescript
// 예시: Whitelist 기반 컬럼 검증
export const ALLOWED_SORT_COLUMNS = {
  clients: ['created_at', 'first_name', 'last_name', ...],
  instruments: ['created_at', 'type', 'maker', ...],
  // ...
} as const;
```

### 4. **XSS (Cross-Site Scripting) 방지**

- ✅ 입력 sanitization (`sanitizeString` 함수)
- ✅ HTML 태그 제거 (`<`, `>` 문자 제거)
- ✅ 제어 문자 제거
- ⚠️ `dangerouslySetInnerHTML` 사용 검토 필요 (테스트 파일에서만 발견)

### 5. **인증 및 인가**

- ✅ Supabase Auth 통합
- ✅ **Row Level Security (RLS) 활성화** (모든 주요 테이블)
- ✅ 세션 관리 및 갱신
- ✅ Protected routes 구현
- ✅ API 라우트 레벨 인증 미들웨어 (`withAuthRoute`) 적용
  - `src/app/api/_utils/withAuthRoute.ts`
  - `clients, instruments, sales, connections, contacts, maintenance-tasks, sales/summary-by-client` 등 주요 라우트에 Supabase JWT 기반 인증 강제
  - 테스트 환경(`NODE_ENV=test`)에서는 기존 유닛 테스트 보존을 위해 인증 우회

### 6. **보안 헤더 (Vercel 설정)**

```json
{
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
}
```

### 7. **에러 처리**

- ✅ 프로덕션 환경에서 민감한 정보 제거
- ✅ 사용자 친화적인 에러 메시지
- ✅ Sentry 통합 (에러 모니터링)

### 8. **입력 검증**

- ✅ Zod 스키마 검증 (`validateClient`, `validateInstrument` 등)
- ✅ 타입 가드 함수
- ✅ 날짜/URL/UUID 검증

---

## ⚠️ 개선 권장 사항

### 1. **RLS 정책** ✅ org-scoped + admin write 적용됨

구버전 문서의 `Allow all operations for authenticated users` 정책은 더 이상 사용하지 않습니다.
현재 마이그레이션(`00000000000002_rls_policies.sql`) 기준:

- SELECT → 동일 `org_id` 멤버
- INSERT/UPDATE/DELETE → `public.is_admin()` (알림 설정·일부 contact_logs 예외)

```sql
-- 현재 정책 모델 (요약)
CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY clients_insert ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());
```

**남은 선택 개선:**

- 리소스별 세분 role이 필요해지면 permission 매트릭스 확장
- 릴리즈 전 `scripts/supabase/tenant_isolation_audit.sql` / health diagnostics로 정책 회귀 확인

### 2. **Service Role Key 사용 제한**

Service Role Key는 RLS를 우회하므로 신중하게 사용해야 합니다.

**현재 상태:**

- ✅ API routes에서만 사용 (서버 사이드)
- ✅ 환경 변수로 관리 (클라이언트 노출 방지)
- ✅ 인증 미들웨어(`withAuthRoute`)와 조합하여, 인증 없는 공개 접근을 기본적으로 차단

**권장 개선:**

- Service Role Key가 필요한 경우만 사용
- 가능한 경우 anon key + RLS 정책 활용

### 3. **CSRF 보호**

- ⚠️ CSRF 토큰 검증이 명시적으로 구현되지 않음
- ✅ Next.js의 기본 CSRF 보호 활용 (쿠키 기반)
- 권장: 중요한 작업(POST/PATCH/DELETE)에 추가 CSRF 검증 고려

### 4. **Rate Limiting**

- ⚠️ API rate limiting이 구현되지 않음
- 권장: Vercel Edge Functions 또는 미들웨어로 rate limiting 추가

### 5. **Content Security Policy (CSP)**

- ⚠️ CSP 헤더가 설정되지 않음
- 권장: `Content-Security-Policy` 헤더 추가

```json
{
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
}
```

### 6. **비밀번호 정책**

- ⚠️ 클라이언트 사이드 비밀번호 정책 확인 필요
- 권장: 최소 길이, 복잡도 요구사항 명시

### 7. **환경 변수 검증**

- ⚠️ 애플리케이션 시작 시 필수 환경 변수 검증 필요
- 권장: 시작 시 모든 필수 환경 변수 확인 및 에러 메시지 제공

---

## 🔍 보안 체크리스트

### 코드 보안

- [x] SQL Injection 방지 (ORM + whitelist)
- [x] XSS 방지 (입력 sanitization)
- [x] 민감한 정보 마스킹 (에러 로깅)
- [x] 환경 변수 보호 (.gitignore)
- [ ] CSRF 보호 (기본만 있음, 강화 권장)
- [ ] Rate limiting (미구현)
- [ ] CSP 헤더 (미구현)

### 인증/인가

- [x] 사용자 인증 (Supabase Auth)
- [x] RLS 활성화 (모든 테이블)
- [x] 세분화된 RLS 정책 (org-scoped + admin write)
- [x] API `withAuthRoute` / `requireAdmin`
- [x] Protected routes (`src/middleware.ts` + AppLayout)
- [x] `/api/health` diagnostics gated by `HEALTH_CHECK_SECRET` (production fail-closed)

> 운영 노트: 프로덕션에서 상세 health 진단을 쓰려면 호스트 env에 `HEALTH_CHECK_SECRET`을 설정해야 한다. 미설정이어도 liveness는 동작하며 진단 필드는 노출되지 않는다.

### 인프라 보안

- [x] 의존성 취약점 스캔 (npm audit, Snyk)
- [x] 보안 헤더 (일부 구현)
- [x] HTTPS 강제 (Vercel 기본)
- [ ] CSP 헤더 (추가 권장)

### 모니터링

- [x] 에러 추적 (Sentry)
- [x] 보안 로깅 (sanitized)
- [ ] 보안 이벤트 알림 (일부만 구현)

---

## 📊 보안 점수 (주관적 평가)

| 카테고리    | 점수       | 비고                                    |
| ----------- | ---------- | --------------------------------------- |
| 의존성 보안 | ⭐⭐⭐⭐⭐ | 취약점 0개                              |
| 입력 검증   | ⭐⭐⭐⭐☆  | 잘 구현됨, 일부 개선 가능               |
| 인증/인가   | ⭐⭐⭐⭐⭐ | org RLS + API auth + admin/member RBAC  |
| 데이터 보호 | ⭐⭐⭐⭐⭐ | 민감 정보 마스킹 잘 구현                |
| 인프라 보안 | ⭐⭐⭐☆☆   | 기본 헤더 있음, CSP 추가 권장           |
| 모니터링    | ⭐⭐⭐⭐☆  | Sentry 통합, 보안 이벤트 알림 개선 가능 |

**종합 점수: ⭐⭐⭐⭐☆ (4/5)**

---

## 🚀 즉시 개선 가능한 항목

### 1. 환경 변수 검증 추가

```typescript
// src/lib/env-check.ts
export function validateRequiredEnvVars() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}
```

### 2. CSP 헤더 추가 (vercel.json)

```json
{
  "headers": [
    {
      "source": "/:path*",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;"
        }
      ]
    }
  ]
}
```

### 3. Rate Limiting 미들웨어 추가

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const rateLimitMap = new Map<string, number[]>();

export function middleware(request: NextRequest) {
  const ip = request.ip || 'unknown';
  const now = Date.now();
  const windowMs = 60000; // 1분
  const maxRequests = 100;

  const requests = rateLimitMap.get(ip) || [];
  const recentRequests = requests.filter(time => now - time < windowMs);

  if (recentRequests.length >= maxRequests) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  recentRequests.push(now);
  rateLimitMap.set(ip, recentRequests);

  return NextResponse.next();
}
```

---

## 📝 결론

이 레포지토리는 **기본적인 보안 기능들이 잘 구현**되어 있습니다:

- ✅ 의존성 취약점 없음
- ✅ SQL Injection 방지
- ✅ XSS 방지 (입력 sanitization)
- ✅ 민감한 정보 보호
- ✅ RLS 활성화

**개선이 필요한 영역:**

- CSP 헤더 추가
- Rate limiting 전역화 (현재 sales export 등 일부만)
- 환경 변수 검증 강화

전반적으로 **양호한 보안 상태**이며, 인증/인가·org RLS는 적용되어 있습니다. 위의 개선 사항들을 적용하면 더욱 안전해질 수 있습니다.
