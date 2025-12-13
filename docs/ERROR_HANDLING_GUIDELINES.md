# 에러 처리 가이드라인

## 개요

이 문서는 애플리케이션 전체에서 일관된 에러 처리 방식을 정의합니다.

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

## 구현 체크리스트

- [x] 폼 에러는 인라인으로 표시
- [x] API 에러는 Toast로 표시
- [x] 치명적 에러는 ErrorBoundary로 처리
- [ ] 모든 폼에서 일관된 에러 처리
- [ ] 모든 API 호출에서 일관된 에러 처리
- [ ] 에러 메시지가 사용자 친화적
- [ ] 개발 환경에서 상세 에러 정보 제공

## 참고 자료

- `src/components/common/Input.tsx` - 인라인 에러 표시
- `src/components/ErrorToast.tsx` - Toast 에러 표시
- `src/components/common/ErrorBoundary.tsx` - 치명적 에러 처리
- `src/hooks/useAppFeedback.ts` - 에러 처리 훅
- `src/utils/errorHandler.ts` - 에러 핸들러 유틸리티
