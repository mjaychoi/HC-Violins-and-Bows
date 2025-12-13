# 보안 및 입력 검증 가이드

## 개요

이 문서는 애플리케이션의 보안 및 입력 검증 구현에 대한 가이드를 제공합니다.

## SQL Injection 방지

### Supabase의 자동 보호

Supabase는 자동으로 파라미터화된 쿼리를 사용하므로 SQL Injection 공격으로부터 보호됩니다.

**예시:**

```typescript
// ✅ 안전함 - Supabase가 자동으로 파라미터화
const { data } = await supabase.from('clients').select('*').eq('id', userId); // userId는 자동으로 이스케이프됨

// ❌ 위험함 - 하지만 Supabase는 이를 허용하지 않음
// Supabase는 raw SQL 쿼리를 직접 실행하지 않으므로 안전함
```

### 추가 보안 조치

1. **동적 필드 화이트리스트 검증**
   - `orderBy` 같은 동적 필드는 화이트리스트로 검증
   - `validateSortColumn()` 함수 사용

2. **UUID 형식 검증**
   - 모든 ID 파라미터는 UUID 형식 검증
   - `validateUUID()` 함수 사용

3. **검색어 Sanitization**
   - 검색어에서 SQL 와일드카드 제거
   - `sanitizeSearchTerm()` 함수 사용

## 입력 검증 계층

### 1. 클라이언트 측 검증

**위치:** `src/utils/validationUtils.ts`

- 폼 제출 전 실시간 검증
- 사용자 경험 향상
- **주의:** 클라이언트 측 검증만으로는 충분하지 않음

**예시:**

```typescript
import { clientValidation, validateForm } from '@/utils/validationUtils';

const validation = validateForm(formData, {
  first_name: clientValidation.firstName,
  email: clientValidation.email,
});
```

### 2. 서버 측 검증 (API 라우트)

**위치:** `src/app/api/**/route.ts`

- 모든 API 요청에 대한 검증
- Zod 스키마 기반 타입 검증
- **필수:** 모든 입력은 서버에서 검증되어야 함

**예시:**

```typescript
import { validateClient, safeValidate } from '@/utils/typeGuards';

// POST 요청
const validationResult = safeValidate(body, validateClient);
if (!validationResult.success) {
  return NextResponse.json(
    { error: `Invalid data: ${validationResult.error}` },
    { status: 400 }
  );
}

// PATCH 요청 (부분 업데이트)
const validationResult = safeValidate(updates, validatePartialClient);
if (!validationResult.success) {
  return NextResponse.json(
    { error: `Invalid update data: ${validationResult.error}` },
    { status: 400 }
  );
}
```

### 3. 데이터베이스 제약조건

- NOT NULL 제약조건
- CHECK 제약조건 (enum 값 등)
- UNIQUE 제약조건
- 외래 키 제약조건

## 입력 Sanitization

### 문자열 Sanitization

**위치:** `src/utils/inputValidation.ts`

```typescript
import {
  sanitizeString,
  sanitizeEmail,
  sanitizeSearchTerm,
} from '@/utils/inputValidation';

// HTML 태그 제거 및 길이 제한
const sanitized = sanitizeString(userInput, 100);

// 이메일 형식 검증 및 정규화
const email = sanitizeEmail(userInput);

// 검색어에서 SQL 와일드카드 제거
const searchTerm = sanitizeSearchTerm(userInput);
```

### 숫자 Sanitization

```typescript
import { sanitizeNumber } from '@/utils/inputValidation';

// 숫자 변환 및 범위 검증
const price = sanitizeNumber(userInput, 0, 1000000);
```

## 동적 필드 검증

### 정렬 컬럼 화이트리스트

```typescript
import { validateSortColumn } from '@/utils/inputValidation';

// 허용된 컬럼만 사용
const orderBy = validateSortColumn('clients', searchParams.get('orderBy'));
```

### 허용된 컬럼 목록

- **clients**: `created_at`, `first_name`, `last_name`, `email`, `contact_number`, `client_number`
- **instruments**: `created_at`, `type`, `maker`, `serial_number`, `status`, `price`
- **connections**: `created_at`, `relationship_type`
- **maintenance_tasks**: `created_at`, `received_date`, `due_date`, `scheduled_date`, `priority`, `status`
- **sales_history**: `created_at`, `sale_date`, `sale_price`

## 타입 검증 (Zod)

### 스키마 정의

**위치:** `src/utils/typeGuards.ts`

- 모든 주요 데이터 타입에 대한 Zod 스키마
- 런타임 타입 검증
- TypeScript 타입과 동기화

### 사용 예시

```typescript
import { validateClient, validateInstrument } from '@/utils/typeGuards';

// 전체 객체 검증
const client = validateClient(data);

// 부분 업데이트 검증
import { validatePartialClient } from '@/utils/typeGuards';
const updates = validatePartialClient(updateData);

// 안전한 검증 (에러 발생하지 않음)
import { safeValidate } from '@/utils/typeGuards';
const result = safeValidate(data, validateClient);
if (!result.success) {
  // 에러 처리
}
```

## UUID 검증

모든 ID 파라미터는 UUID 형식으로 검증됩니다.

```typescript
import { validateUUID } from '@/utils/inputValidation';

if (!validateUUID(id)) {
  return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
}
```

## 날짜 검증

날짜 문자열은 YYYY-MM-DD 형식으로 검증됩니다.

```typescript
import { validateDateString } from '@/utils/inputValidation';

if (!validateDateString(date)) {
  return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
}
```

## 구현된 검증

### ✅ 완료된 검증

1. **API 라우트 입력 검증**
   - ✅ POST 요청 본문 검증
   - ✅ PATCH 요청 업데이트 데이터 검증
   - ✅ UUID 형식 검증
   - ✅ 동적 필드 화이트리스트 검증

2. **입력 Sanitization**
   - ✅ 문자열 sanitization
   - ✅ 검색어 sanitization
   - ✅ 이메일 sanitization
   - ✅ 숫자 sanitization

3. **타입 검증**
   - ✅ Zod 스키마 정의
   - ✅ 전체 객체 검증
   - ✅ 부분 업데이트 검증
   - ✅ 배열 검증

4. **SQL Injection 방지**
   - ✅ Supabase 자동 보호
   - ✅ 동적 필드 화이트리스트
   - ✅ 검색어 sanitization

## 보안 체크리스트

### API 라우트 구현 시

- [ ] 모든 입력 파라미터 검증
- [ ] UUID 형식 검증 (ID 파라미터)
- [ ] 동적 필드 화이트리스트 검증
- [ ] 요청 본문 Zod 스키마 검증
- [ ] 부분 업데이트 검증 (PATCH)
- [ ] 검색어 sanitization
- [ ] 날짜 형식 검증

### 폼 구현 시

- [ ] 클라이언트 측 검증 (UX)
- [ ] 서버 측 검증 (필수)
- [ ] 입력 sanitization
- [ ] 에러 메시지 표시

## 참고 자료

- [Zod 문서](https://zod.dev/)
- [Supabase 보안 가이드](https://supabase.com/docs/guides/auth/security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
