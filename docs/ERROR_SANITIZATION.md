# 에러 정보 노출 제한 가이드

## 개요

프로덕션 환경에서 민감한 정보가 노출되지 않도록 에러 메시지를 필터링하고 사용자 친화적인 메시지로 변환하는 시스템입니다.

## 주요 기능

### 1. 프로덕션 환경 감지

```typescript
import { isProduction, isDevelopment } from '@/utils/errorSanitization';

if (isProduction()) {
  // 프로덕션 환경에서만 실행되는 코드
}
```

### 2. 민감한 정보 마스킹

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

### 3. 안전한 에러 응답 생성

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

### 4. 사용자 친화적 에러 메시지

```typescript
import { getUserFriendlyErrorMessage } from '@/utils/errorSanitization';

const userMessage = getUserFriendlyErrorMessage(error);
// 프로덕션: "Network connection error. Please check your internet connection."
// 개발: 원본 에러 메시지
```

### 5. 로깅용 에러 정보 생성

서버 로그에만 사용되는 상세 정보:

```typescript
import { createLogErrorInfo } from '@/utils/errorSanitization';

const logInfo = createLogErrorInfo(error);
// { message, details, stack, type }
// 이 정보는 클라이언트에 노출되지 않습니다.
```

## 적용된 위치

### API 라우트

모든 API 라우트에서 `createSafeErrorResponse`를 사용하여 안전한 에러 응답을 반환합니다:

- `/api/clients/route.ts`
- `/api/instruments/route.ts`
- `/api/connections/route.ts`
- `/api/maintenance-tasks/route.ts`
- `/api/sales/route.ts`
- `/api/certificates/[id]/route.tsx`

### 클라이언트 컴포넌트

- `ErrorBoundary.tsx`: 프로덕션 환경에서 에러 상세 정보 숨김
- `ErrorToast.tsx`: 사용자 친화적 메시지 표시

### 로깅 시스템

- `logger.ts`: 프로덕션 환경에서 민감한 정보 마스킹
- `errorHandler.ts`: 사용자 친화적 메시지 생성

## 환경별 동작

### 개발 환경 (`NODE_ENV=development`)

- ✅ 상세한 에러 메시지 표시
- ✅ Stack trace 포함
- ✅ 원본 에러 정보 유지
- ✅ 디버깅 정보 제공

### 프로덕션 환경 (`NODE_ENV=production`)

- ❌ 민감한 정보 제거
- ❌ Stack trace 숨김
- ✅ 사용자 친화적 메시지만 표시
- ✅ 일반적인 에러 메시지 매핑

## 에러 메시지 매핑

일반적인 에러 패턴이 사용자 친화적인 메시지로 자동 변환됩니다:

| 원본 패턴 | 사용자 메시지 |
|---------|------------|
| network | Network connection error. Please check your internet connection. |
| timeout | Request timeout. Please try again. |
| unauthorized | Authentication required. Please log in. |
| forbidden | Access denied. You do not have permission. |
| not found | The requested resource was not found. |
| validation | Please check your input and try again. |
| database | Database error occurred. Please try again later. |
| server | Server error occurred. Please try again later. |

## 보안 고려사항

1. **민감한 정보 마스킹**: API 키, 토큰, 비밀번호 등이 자동으로 마스킹됩니다.
2. **Stack trace 제거**: 프로덕션 환경에서는 파일 경로와 코드 구조 정보가 노출되지 않습니다.
3. **에러 상세 정보 분리**: 로깅용 상세 정보는 서버 로그에만 기록되고 클라이언트에 전송되지 않습니다.
4. **일반적인 메시지**: 구체적인 에러 내용 대신 일반적인 안내 메시지를 제공합니다.

## 사용 예시

### API 라우트에서

```typescript
import { createSafeErrorResponse, createLogErrorInfo } from '@/utils/errorSanitization';

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

function MyComponent() {
  try {
    // ...
  } catch (error) {
    const userMessage = getUserFriendlyErrorMessage(error);
    showToast(userMessage);
  }
}
```

## 테스트

프로덕션 환경에서 테스트하려면:

```bash
NODE_ENV=production npm run build
NODE_ENV=production npm start
```

개발 환경에서는 상세한 에러 정보가 표시되고, 프로덕션 환경에서는 일반적인 메시지만 표시됩니다.
