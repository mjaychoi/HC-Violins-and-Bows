# 번들 최적화 가이드

## 완료된 최적화 작업

### 1. Sentry 클라이언트 번들 최소화 ✅

**변경 파일:**

- `src/utils/monitoring.ts` - Sentry dynamic import
- `src/app/global-error.tsx` - Sentry dynamic import
- `src/instrumentation-client.ts` - Sentry dynamic import (사용자 적용)

**효과:**

- Sentry SDK가 모든 페이지 초기 번들에서 제외
- 에러 발생 시에만 동적으로 로드
- `orchestration_js.js` 크기 감소 기대

### 2. Supabase 초기화 최적화 ✅

**변경 파일:**

- `src/lib/supabase-client.ts` - Lazy initialization

**효과:**

- 모듈 로드 시 즉시 초기화 제거
- 실제 사용 시에만 초기화 (AuthContext 등)
- 초기 번들 크기 감소

### 3. 차트/캘린더 라이브러리 ✅

**이미 적용됨:**

- `SalesCharts` (recharts) - Dynamic import
- `CalendarView` (react-big-calendar) - Dynamic import
- `ConnectionsList` (dnd-kit) - Dynamic import

## 추가 최적화 가능 사항

### 1. Webpack SplitChunks 설정 미세 조정 (선택사항)

현재 `next.config.ts`에 이미 잘 설정되어 있으나, 다음을 고려할 수 있습니다:

```typescript
// 현재 설정은 이미 최적화되어 있음
// - Sentry: priority 60 (최우선)
// - React Big Calendar: priority 50
// - Supabase: priority 40
// - Recharts: priority 45
```

**추가 고려사항:**

- `maxInitialRequests`를 30으로 증가 (현재 25)
- `minSize`를 15000으로 감소하여 더 세밀한 분리 가능

### 2. AWS SDK 클라이언트 번들 제외 확인

**현재 상태:**

- `src/utils/storage/s3Storage.ts`에서만 사용 (서버 전용)
- 타입만 import하고 실제 SDK는 dynamic import 사용

**확인 필요:**

```bash
npm run build:analyze
# @aws-sdk가 클라이언트 번들에 포함되는지 확인
```

만약 포함된다면 `next.config.ts`에 추가:

```typescript
serverExternalPackages: [
  '@react-pdf/renderer',
  '@react-pdf/reconciler',
  '@react-pdf/render',
  '@aws-sdk/client-s3',  // 추가
  '@aws-sdk/s3-request-presigner',  // 추가
],
```

### 3. Context Providers 최적화 (현재 상태 양호)

**현재 구조:**

- Context가 세분화되어 있어 불필요한 리렌더링 최소화
- 모든 Context가 필수적이므로 lazy load 불필요

**추가 개선 가능 (복잡도 대비 효과 낮음):**

- 특정 페이지에서만 필요한 Context를 lazy load
- 예: ConnectionsContext를 connections 페이지에서만 로드
- ⚠️ 주의: 이는 복잡도를 크게 증가시키므로 권장하지 않음

### 4. Date-fns 최적화 (이미 적용됨)

**현재 상태:**

- `next.config.ts`의 `optimizePackageImports`에 `date-fns` 포함
- Tree-shaking이 자동으로 적용됨

### 5. Barrel Export 최적화 (현재 상태 양호)

**확인 결과:**

- `src/components/common/index.ts` - 큰 라이브러리 없음
- `src/utils/index.ts` - 큰 라이브러리 없음
- 추가 작업 불필요

## 번들 분석 실행 방법

```bash
# 번들 크기 분석
npm run build:analyze

# 프로덕션 빌드
npm run build
```

## 예상 효과

### 초기 번들 크기

- **Sentry 제거**: ~2-3MB 감소 (각 페이지별)
- **Supabase Lazy Load**: 인증이 필요한 페이지에서만 로드
- **orchestration_js.js**: 크기 감소 및 중복 제거

### 로딩 성능

- **First Contentful Paint (FCP)**: 개선
- **Time to Interactive (TTI)**: 개선
- **Largest Contentful Paint (LCP)**: 개선

## 모니터링

빌드 후 다음을 확인:

1. `orchestration_js.js` 크기 변화
2. 각 페이지별 초기 번들 크기
3. Sentry 관련 청크가 별도로 분리되었는지
4. Supabase 청크가 필요한 페이지에서만 로드되는지

## 참고 사항

- `instrumentation-client.ts`는 Next.js 특수 파일이므로 모든 페이지에 포함되지만, Sentry는 dynamic import로 최적화됨
- Webpack 설정은 이미 잘 최적화되어 있으므로 추가 조정은 선택사항
- Context providers는 현재 구조가 최적이므로 추가 최적화 불필요
