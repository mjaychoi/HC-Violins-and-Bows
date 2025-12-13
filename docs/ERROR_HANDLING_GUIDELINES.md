# 에러 처리 가이드라인

## 개요

이 문서는 애플리케이션 전체에서 일관된 에러 처리 방식을 정의합니다. 에러 표시, 정보 노출 제한, 모니터링 및 알림에 대한 종합 가이드를 제공합니다.

## 에러 타입별 표시 방식

### 1. 폼 에러 (Form Errors) - 인라인 표시

**사용 시기**: 폼 필드 검증 실패, 사용자 입력 오류

**표시 위치**: 필드 바로 아래 또는 폼 상단

**구현 방법**:

```typescript
// Input 컴포넌트 사용
<Input
  label="Email"
  error={errors.email}  // 인라인 에러 표시
  {...props}
/>

// 또는 FormWrapper 사용
<FormWrapper>
  {({ errors, setFieldError }) => (
    // errors 객체를 사용하여 필드별 에러 표시
  )}
</FormWrapper>
```

**예시**:

- 이메일 형식 오류
- 필수 필드 누락
- 비밀번호 길이 부족
- 숫자 범위 초과

### 2. API 에러 (API Errors) - Toast 알림

**사용 시기**: 서버 요청 실패, 네트워크 오류, 데이터베이스 오류

**표시 위치**: 화면 상단 또는 하단 Toast 영역

**구현 방법**:

```typescript
import { useAppFeedback } from '@/hooks/useAppFeedback';

const { ErrorToasts, handleError } = useAppFeedback();

// API 호출 실패 시
try {
  await apiCall();
} catch (error) {
  handleError(error, 'API Context');  // Toast로 표시
}

// 컴포넌트에 ErrorToasts 추가
return (
  <>
    {/* 컴포넌트 내용 */}
    <ErrorToasts />
  </>
);
```

**예시**:

- 데이터 저장 실패
- 서버 연결 오류
- 권한 부족
- 레코드 찾을 수 없음

**주의사항**:

- 폼 제출 실패 시에도 Toast를 사용하되, 가능하면 폼 내부에도 인라인 에러를 표시하는 것을 고려

### 3. 치명적 에러 (Critical Errors) - 모달 또는 ErrorBoundary

**사용 시기**: 애플리케이션 크래시, 복구 불가능한 오류, React 렌더링 오류

**표시 위치**: 전체 화면 또는 모달

**구현 방법**:

```typescript
// ErrorBoundary로 감싸기
<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>

// 또는 명시적 모달 (필요한 경우)
<ErrorModal
  isOpen={hasCriticalError}
  error={criticalError}
  onClose={handleClose}
/>
```

**예시**:

- React 컴포넌트 렌더링 오류
- 메모리 부족
- 치명적인 데이터 손상

## 에러 처리 패턴

### 폼 제출 에러 처리

```typescript
const handleSubmit = async formData => {
  try {
    await submitForm(formData);
    showSuccess('Form submitted successfully');
  } catch (error) {
    // 폼 레벨 에러는 인라인으로 표시
    if (error.field) {
      setFieldError(error.field, error.message);
    } else {
      // 일반 API 에러는 Toast로 표시
      handleError(error, 'Form Submission');
    }
  }
};
```

### API 호출 에러 처리

```typescript
const fetchData = async () => {
  try {
    const data = await api.get('/endpoint');
    return data;
  } catch (error) {
    // Toast로 표시
    handleError(error, 'Data Fetch');
    throw error; // 필요시 상위로 전파
  }
};
```

### 비동기 작업 에러 처리

```typescript
useEffect(() => {
  const loadData = async () => {
    try {
      await fetchData();
    } catch (error) {
      // Toast로 표시
      handleError(error, 'Data Loading');
    }
  };

  loadData();
}, []);
```

## 에러 메시지 작성 가이드

### 좋은 에러 메시지

- ✅ "이메일 형식이 올바르지 않습니다."
- ✅ "서버 연결에 실패했습니다. 인터넷 연결을 확인해주세요."
- ✅ "권한이 없습니다. 관리자에게 문의하세요."

### 나쁜 에러 메시지

- ❌ "Error 500"
- ❌ "Failed"
- ❌ "Something went wrong"

## 에러 심각도별 처리

### LOW (낮음)

- 사용자 입력 경고
- 선택적 기능 실패
- **표시**: 인라인 또는 작은 Toast

### MEDIUM (중간)

- 일반적인 API 오류
- 데이터 로드 실패
- **표시**: Toast 알림

### HIGH (높음)

- 중요한 작업 실패
- 데이터 저장 실패
- **표시**: Toast 알림 (더 눈에 띄게)

### CRITICAL (치명적)

- 애플리케이션 크래시
- 복구 불가능한 오류
- **표시**: ErrorBoundary 또는 모달

## 에러 정보 노출 제한

프로덕션 환경에서 민감한 정보가 노출되지 않도록 에러 메시지를 필터링하고 사용자 친화적인 메시지로 변환합니다.

### 프로덕션 환경 감지

```typescript
import { isProduction, isDevelopment } from '@/utils/errorSanitization';

if (isProduction()) {
  // 프로덕션 환경에서만 실행되는 코드
}
```

### 민감한 정보 마스킹

다음과 같은 민감한 정보가 자동으로 마스킹됩니다:

- API 키, 토큰, 비밀번호
- 이메일 주소
- 전화번호
- 신용카드 번호
- UUID (일부 경우)
- 데이터베이스 연결 문자열
- 파일 경로
- 환경 변수

```typescript
import { maskSensitiveInfo } from '@/utils/errorSanitization';

const sanitized = maskSensitiveInfo('API key: sk_live_1234567890');
// 결과: "API key: sk_******************90"
```

### 안전한 에러 응답 생성

API 라우트에서 사용:

```typescript
import { createSafeErrorResponse } from '@/utils/errorSanitization';

try {
  // ...
} catch (error) {
  const safeError = createSafeErrorResponse(error, 500);
  return NextResponse.json(safeError, { status: 500 });
}
```

**프로덕션 환경 응답 예시:**

```json
{
  "error": "An error occurred",
  "message": "Server error occurred. Please try again later.",
  "statusCode": 500
}
```

**개발 환경 응답 예시:**

```json
{
  "error": "An error occurred",
  "message": "Server error occurred. Please try again later.",
  "statusCode": 500,
  "details": "Error: Database connection failed..."
}
```

### 사용자 친화적 에러 메시지

```typescript
import { getUserFriendlyErrorMessage } from '@/utils/errorSanitization';

const userMessage = getUserFriendlyErrorMessage(error);
// 프로덕션: "Network connection error. Please check your internet connection."
// 개발: 원본 에러 메시지
```

### 로깅용 에러 정보 생성

서버 로그에만 사용되는 상세 정보:

```typescript
import { createLogErrorInfo } from '@/utils/errorSanitization';

const logInfo = createLogErrorInfo(error);
// { message, details, stack, type }
// 이 정보는 클라이언트에 노출되지 않습니다.
```

### 환경별 동작

#### 개발 환경 (`NODE_ENV=development`)

- ✅ 상세한 에러 메시지 표시
- ✅ Stack trace 포함
- ✅ 원본 에러 정보 유지
- ✅ 디버깅 정보 제공

#### 프로덕션 환경 (`NODE_ENV=production`)

- ❌ 민감한 정보 제거
- ❌ Stack trace 숨김
- ✅ 사용자 친화적 메시지만 표시
- ✅ 일반적인 에러 메시지 매핑

### 에러 메시지 매핑

일반적인 에러 패턴이 사용자 친화적인 메시지로 자동 변환됩니다:

| 원본 패턴    | 사용자 메시지                                                    |
| ------------ | ---------------------------------------------------------------- |
| network      | Network connection error. Please check your internet connection. |
| timeout      | Request timeout. Please try again.                               |
| unauthorized | Authentication required. Please log in.                          |
| forbidden    | Access denied. You do not have permission.                       |
| not found    | The requested resource was not found.                            |
| validation   | Please check your input and try again.                           |
| database     | Database error occurred. Please try again later.                 |
| server       | Server error occurred. Please try again later.                   |

### 보안 고려사항

1. **민감한 정보 마스킹**: API 키, 토큰, 비밀번호 등이 자동으로 마스킹됩니다.
2. **Stack trace 제거**: 프로덕션 환경에서는 파일 경로와 코드 구조 정보가 노출되지 않습니다.
3. **에러 상세 정보 분리**: 로깅용 상세 정보는 서버 로그에만 기록되고 클라이언트에 전송되지 않습니다.
4. **일반적인 메시지**: 구체적인 에러 내용 대신 일반적인 안내 메시지를 제공합니다.

## 에러 모니터링 및 알림

애플리케이션은 중앙화된 에러 핸들링 시스템을 통해 모든 에러를 캡처하고, 설정된 심각도 임계값을 초과하는 에러에 대해 웹훅 알림을 전송합니다.

### 자동 에러 캡처

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

### 웹훅 알림

설정된 심각도 임계값을 초과하는 에러는 자동으로 웹훅으로 전송됩니다.

### 환경 변수 설정

`.env.local` 파일에 다음 변수를 추가하세요:

```bash
# 웹훅 알림 활성화
NEXT_PUBLIC_ERROR_WEBHOOK_ENABLED=true

# 웹훅 URL (예: Slack, Discord, 또는 커스텀 엔드포인트)
NEXT_PUBLIC_ERROR_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# 알림을 트리거할 최소 심각도 (LOW, MEDIUM, HIGH, CRITICAL)
NEXT_PUBLIC_ERROR_SEVERITY_THRESHOLD=HIGH
```

### 웹훅 페이로드 형식

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

### 웹훅 설정 예시

#### Slack 웹훅

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

#### Discord 웹훅

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

#### 커스텀 엔드포인트

자체 서버 엔드포인트를 사용할 수도 있습니다:

```bash
NEXT_PUBLIC_ERROR_WEBHOOK_ENABLED=true
NEXT_PUBLIC_ERROR_WEBHOOK_URL=https://your-api.com/api/errors
NEXT_PUBLIC_ERROR_SEVERITY_THRESHOLD=HIGH
```

### 수동 에러 캡처

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

### 알림 비활성화

웹훅 알림을 비활성화하려면:

```bash
NEXT_PUBLIC_ERROR_WEBHOOK_ENABLED=false
```

또는 환경 변수를 제거하면 자동으로 비활성화됩니다.

### 모니터링 서비스 통합

향후 다음 서비스와의 통합을 고려할 수 있습니다:

- **Sentry**: `captureException` 내부에서 Sentry SDK 호출
- **LogRocket**: 세션 재생 및 에러 추적
- **Datadog**: APM 및 로그 관리
- **New Relic**: 성능 모니터링

통합 예시는 `src/utils/errorHandler.ts`의 `sendToExternalLogger` 메서드에 주석으로 포함되어 있습니다.

### 문제 해결

#### 웹훅이 작동하지 않음

1. 환경 변수가 올바르게 설정되었는지 확인
2. 웹훅 URL이 유효한지 확인
3. 브라우저 콘솔에서 웹훅 관련 경고 확인
4. 네트워크 탭에서 웹훅 요청 확인

#### 너무 많은 알림

심각도 임계값을 높이세요:

```bash
NEXT_PUBLIC_ERROR_SEVERITY_THRESHOLD=CRITICAL
```

#### 알림이 전송되지 않음

1. `NEXT_PUBLIC_ERROR_WEBHOOK_ENABLED=true` 확인
2. 웹훅 URL이 올바른지 확인
3. 에러 심각도가 임계값을 초과하는지 확인

## 구현 체크리스트

- [x] 폼 에러는 인라인으로 표시
  - ✅ `Input` 컴포넌트에 `error` prop 지원
  - ✅ `FormWrapper`와 `useFormState`로 에러 관리
  - ✅ 주요 폼에서 인라인 에러 표시 구현 (ItemForm, ClientForm, SaleForm 등)

- [x] API 에러는 Toast로 표시
  - ✅ `useAppFeedback` 훅으로 `ErrorToasts`와 `handleError` 제공
  - ✅ 12개 주요 페이지에서 사용 중 (Dashboard, Clients, Calendar, Sales, Instruments, Connections 등)
  - ✅ `useErrorHandler` 훅으로 일관된 에러 처리

- [x] 치명적 에러는 ErrorBoundary로 처리
  - ✅ `ErrorBoundary` 컴포넌트 구현 완료
  - ✅ 주요 페이지에서 사용 중 (Dashboard, Clients, Calendar, Sales, Instruments, Connections 등)
  - ✅ 프로덕션 환경에서 민감한 정보 숨김
  - ✅ 개발 환경에서 상세 에러 정보 제공

- [x] 모든 폼에서 일관된 에러 처리
  - ✅ 주요 폼이 `useFormState` 또는 자체 에러 상태 관리 사용
  - ✅ 폼 검증 에러는 인라인으로 표시
  - ✅ API 에러는 Toast로 표시 (부모 컴포넌트에서 처리)

- [x] 모든 API 호출에서 일관된 에러 처리
  - ✅ 모든 API 라우트에서 `createSafeErrorResponse` 사용
  - ✅ 클라이언트 측 API 호출에서 `handleError` 사용
  - ✅ `useSupabaseQuery`, `useSalesHistory` 등 커스텀 훅에서 일관된 에러 처리

- [x] 에러 메시지가 사용자 친화적
  - ✅ `getUserFriendlyMessage` 함수로 사용자 친화적 메시지 제공
  - ✅ `getUserFriendlyErrorMessage` 함수로 에러 타입별 메시지 매핑
  - ✅ 프로덕션 환경에서 일반적인 메시지만 표시

- [x] 개발 환경에서 상세 에러 정보 제공
  - ✅ `ErrorBoundary`에서 `!isProduction()` 조건으로 상세 정보 표시
  - ✅ API 라우트에서 `createSafeErrorResponse`가 환경에 따라 다르게 동작
  - ✅ 개발 환경에서는 stack trace 및 상세 에러 정보 포함

- [x] 프로덕션 환경에서 민감한 정보 보호
  - ✅ `maskSensitiveInfo` 함수로 민감한 정보 마스킹
  - ✅ `createSafeErrorResponse`로 안전한 에러 응답 생성
  - ✅ 모든 API 라우트에서 적용

- [x] 에러 모니터링 및 알림
  - ✅ 자동 에러 캡처 시스템 구현
  - ✅ 웹훅 알림 시스템 구현
  - ✅ 수동 에러 캡처 함수 제공

## 구현 상태

### ✅ 완료된 구현

#### 1. 폼 에러 인라인 표시

- ✅ `Input` 컴포넌트에 `error` prop 지원
- ✅ `FormWrapper`와 `useFormState`로 에러 관리
- ✅ 주요 폼에서 사용 중:
  - `ItemForm` - `useDashboardForm` 사용
  - `ClientForm` - `useFormState` 직접 사용
  - `SaleForm` - 자체 에러 상태 관리

#### 2. API 에러 Toast 표시

- ✅ `useAppFeedback` 훅으로 통합 에러 처리
- ✅ `ErrorToasts` 컴포넌트로 Toast 표시
- ✅ 주요 페이지에서 사용 중:
  - Dashboard, Clients, Calendar, Sales, Instruments, Connections 등 12개 페이지

#### 3. 치명적 에러 ErrorBoundary

- ✅ 루트 레이아웃(`app/layout.tsx`)에서 전역 ErrorBoundary 적용
- ✅ 주요 페이지에서 추가 ErrorBoundary 사용
- ✅ 프로덕션 환경에서 민감한 정보 숨김
- ✅ 개발 환경에서 상세 에러 정보 제공

#### 4. API 라우트 안전한 에러 응답

- ✅ 모든 API 라우트에서 `createSafeErrorResponse` 사용
- ✅ 프로덕션 환경에서 상세 정보 제거
- ✅ 개발 환경에서 디버깅 정보 포함

#### 5. 사용자 친화적 에러 메시지

- ✅ `getUserFriendlyMessage` 함수로 메시지 변환
- ✅ 에러 타입별 메시지 매핑 (network, timeout, unauthorized 등)
- ✅ 프로덕션 환경에서 일반적인 메시지만 표시

#### 6. 에러 정보 노출 제한

- ✅ 프로덕션 환경 감지 (`isProduction`, `isDevelopment`)
- ✅ 민감한 정보 마스킹 (`maskSensitiveInfo`)
- ✅ 안전한 에러 응답 생성 (`createSafeErrorResponse`)
- ✅ 사용자 친화적 에러 메시지 (`getUserFriendlyErrorMessage`)
- ✅ 로깅용 에러 정보 생성 (`createLogErrorInfo`)

#### 7. 에러 모니터링 및 알림

- ✅ 자동 에러 캡처 시스템
  - API 클라이언트에서 모든 CRUD 작업 에러 캡처
  - 에러 핸들러에서 Critical 심각도 에러 캡처
  - 에러 훅에서 모든 `handleError` 호출 캡처
  - ErrorBoundary에서 React 컴포넌트 에러 캡처
- ✅ 웹훅 알림 시스템
  - 환경 변수 기반 설정
  - 심각도 임계값 기반 필터링
  - Slack, Discord, 커스텀 엔드포인트 지원
- ✅ 수동 에러 캡처
  - `captureException` 함수 제공
  - 메타데이터 및 컨텍스트 정보 포함

### 📊 적용 통계

- **ErrorBoundary 사용**: 10개 이상 페이지
- **useAppFeedback 사용**: 12개 페이지
- **API 라우트 안전한 응답**: 7개 API 라우트
  - `/api/clients/route.ts`
  - `/api/instruments/route.ts`
  - `/api/connections/route.ts`
  - `/api/maintenance-tasks/route.ts`
  - `/api/sales/route.ts`
  - `/api/certificates/[id]/route.tsx`
  - `/api/health/route.ts` ⭐ NEW
- **폼 인라인 에러**: 주요 폼 모두 적용
- **자동 에러 캡처 위치**: 4곳
  - API 클라이언트 (`apiClient.ts`)
  - 에러 핸들러 (`errorHandler.ts`)
  - 에러 훅 (`useErrorHandler.ts`)
  - ErrorBoundary (`ErrorBoundary.tsx`)

## 사용 예시

### API 라우트에서

```typescript
import {
  createSafeErrorResponse,
  createLogErrorInfo,
} from '@/utils/errorSanitization';

export async function GET(request: NextRequest) {
  try {
    // ...
  } catch (error) {
    // 로깅용 상세 정보 (서버 로그에만 기록)
    const logInfo = createLogErrorInfo(error);
    console.error('Detailed error:', logInfo);

    // 클라이언트용 안전한 응답
    const safeError = createSafeErrorResponse(error, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}
```

### 클라이언트 컴포넌트에서

```typescript
import { getUserFriendlyErrorMessage } from '@/utils/errorSanitization';
import { useAppFeedback } from '@/hooks/useAppFeedback';

function MyComponent() {
  const { ErrorToasts, handleError } = useAppFeedback();

  try {
    // ...
  } catch (error) {
    const userMessage = getUserFriendlyErrorMessage(error);
    handleError(error, 'MyComponent');
  }

  return (
    <>
      {/* 컴포넌트 내용 */}
      <ErrorToasts />
    </>
  );
}
```

## 테스트

프로덕션 환경에서 테스트하려면:

```bash
NODE_ENV=production npm run build
NODE_ENV=production npm start
```

개발 환경에서는 상세한 에러 정보가 표시되고, 프로덕션 환경에서는 일반적인 메시지만 표시됩니다.

## 참고 자료

### 구현 파일

- `src/components/common/Input.tsx` - 인라인 에러 표시
- `src/components/ErrorToast.tsx` - Toast 에러 표시
- `src/components/common/ErrorBoundary.tsx` - 치명적 에러 처리
- `src/hooks/useAppFeedback.ts` - 에러 처리 훅
- `src/hooks/useErrorHandler.ts` - 에러 핸들러 훅
- `src/utils/errorHandler.ts` - 에러 핸들러 유틸리티
- `src/utils/errorSanitization.ts` - 에러 정보 노출 제한
- `src/utils/monitoring.ts` - 에러 모니터링 및 웹훅
- `src/utils/apiClient.ts` - API 클라이언트 에러 캡처
