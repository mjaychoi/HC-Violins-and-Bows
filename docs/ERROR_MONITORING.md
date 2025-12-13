# 에러 모니터링 및 알림 설정

이 문서는 애플리케이션의 에러 모니터링 및 웹훅 알림 기능에 대한 설정 가이드입니다.

## 개요

애플리케이션은 중앙화된 에러 핸들링 시스템을 통해 모든 에러를 캡처하고, 설정된 심각도 임계값을 초과하는 에러에 대해 웹훅 알림을 전송합니다.

## 주요 기능

### 1. 자동 에러 캡처

다음 위치에서 자동으로 에러가 캡처됩니다:

- **API 클라이언트** (`src/utils/apiClient.ts`)
  - 모든 CRUD 작업 (query, create, update, delete)
  - 네트워크 에러 및 데이터베이스 에러

- **에러 핸들러** (`src/utils/errorHandler.ts`)
  - Critical 심각도 에러

- **에러 훅** (`src/hooks/useErrorHandler.ts`)
  - 모든 `handleError` 호출

- **에러 바운더리** (`src/components/common/ErrorBoundary.tsx`)
  - React 컴포넌트 에러 (항상 Critical)

### 2. 웹훅 알림

설정된 심각도 임계값을 초과하는 에러는 자동으로 웹훅으로 전송됩니다.

## 환경 변수 설정

`.env.local` 파일에 다음 변수를 추가하세요:

```bash
# 웹훅 알림 활성화
NEXT_PUBLIC_ERROR_WEBHOOK_ENABLED=true

# 웹훅 URL (예: Slack, Discord, 또는 커스텀 엔드포인트)
NEXT_PUBLIC_ERROR_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# 알림을 트리거할 최소 심각도 (LOW, MEDIUM, HIGH, CRITICAL)
NEXT_PUBLIC_ERROR_SEVERITY_THRESHOLD=HIGH
```

## 심각도 레벨

에러 심각도는 다음 4단계로 구분됩니다:

1. **LOW**: 경미한 에러, 사용자 경험에 큰 영향 없음
2. **MEDIUM**: 일반적인 에러, 일부 기능에 영향
3. **HIGH**: 중요한 에러, 주요 기능에 영향
4. **CRITICAL**: 치명적인 에러, 애플리케이션 동작 중단

## 웹훅 페이로드 형식

웹훅으로 전송되는 데이터 형식:

```json
{
  "message": "에러 메시지",
  "code": "ERROR_CODE",
  "stack": "에러 스택 트레이스",
  "context": "에러 발생 컨텍스트",
  "metadata": {
    "table": "instruments",
    "operation": "query",
    "duration": 150
  },
  "timestamp": "2025-01-13T12:00:00.000Z",
  "environment": "production",
  "url": "https://example.com/dashboard",
  "userAgent": "Mozilla/5.0..."
}
```

## 웹훅 설정 예시

### Slack 웹훅

1. Slack 웹훅 URL 생성:
   - https://api.slack.com/messaging/webhooks
   - Incoming Webhooks 앱 추가
   - 웹훅 URL 복사

2. 환경 변수 설정:
```bash
NEXT_PUBLIC_ERROR_WEBHOOK_ENABLED=true
NEXT_PUBLIC_ERROR_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
NEXT_PUBLIC_ERROR_SEVERITY_THRESHOLD=HIGH
```

### Discord 웹훅

1. Discord 웹훅 URL 생성:
   - Discord 채널 설정 > 연동 > 웹후크
   - 새 웹후크 생성
   - 웹후크 URL 복사

2. 환경 변수 설정:
```bash
NEXT_PUBLIC_ERROR_WEBHOOK_ENABLED=true
NEXT_PUBLIC_ERROR_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/WEBHOOK/URL
NEXT_PUBLIC_ERROR_SEVERITY_THRESHOLD=HIGH
```

### 커스텀 엔드포인트

자체 서버 엔드포인트를 사용할 수도 있습니다:

```bash
NEXT_PUBLIC_ERROR_WEBHOOK_ENABLED=true
NEXT_PUBLIC_ERROR_WEBHOOK_URL=https://your-api.com/api/errors
NEXT_PUBLIC_ERROR_SEVERITY_THRESHOLD=HIGH
```

## 수동 에러 캡처

코드에서 직접 에러를 캡처하려면:

```typescript
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity } from '@/types/errors';

try {
  // 작업 수행
} catch (error) {
  captureException(
    error,
    'MyComponent',
    { userId: '123', action: 'save' },
    ErrorSeverity.HIGH
  );
}
```

## 알림 비활성화

웹훅 알림을 비활성화하려면:

```bash
NEXT_PUBLIC_ERROR_WEBHOOK_ENABLED=false
```

또는 환경 변수를 제거하면 자동으로 비활성화됩니다.

## 보안 고려사항

1. **웹훅 URL 보호**: 웹훅 URL에는 민감한 정보가 포함될 수 있으므로 환경 변수로 관리하세요.

2. **Rate Limiting**: 웹훅 서버에서 rate limiting을 구현하여 스팸을 방지하세요.

3. **인증**: 가능하면 웹훅 엔드포인트에 인증을 추가하세요.

## 모니터링 서비스 통합

향후 다음 서비스와의 통합을 고려할 수 있습니다:

- **Sentry**: `captureException` 내부에서 Sentry SDK 호출
- **LogRocket**: 세션 재생 및 에러 추적
- **Datadog**: APM 및 로그 관리
- **New Relic**: 성능 모니터링

통합 예시는 `src/utils/errorHandler.ts`의 `sendToExternalLogger` 메서드에 주석으로 포함되어 있습니다.

## 문제 해결

### 웹훅이 작동하지 않음

1. 환경 변수가 올바르게 설정되었는지 확인
2. 웹훅 URL이 유효한지 확인
3. 브라우저 콘솔에서 웹훅 관련 경고 확인
4. 네트워크 탭에서 웹훅 요청 확인

### 너무 많은 알림

심각도 임계값을 높이세요:

```bash
NEXT_PUBLIC_ERROR_SEVERITY_THRESHOLD=CRITICAL
```

### 알림이 전송되지 않음

1. `NEXT_PUBLIC_ERROR_WEBHOOK_ENABLED=true` 확인
2. 웹훅 URL이 올바른지 확인
3. 에러 심각도가 임계값을 초과하는지 확인

## 관련 파일

- `src/utils/monitoring.ts` - 모니터링 및 웹훅 로직
- `src/utils/errorHandler.ts` - 중앙 에러 핸들러
- `src/utils/apiClient.ts` - API 클라이언트 에러 캡처
- `src/hooks/useErrorHandler.ts` - 에러 핸들링 훅
- `src/components/common/ErrorBoundary.tsx` - React 에러 바운더리

