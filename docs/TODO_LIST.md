# TODO 리스트

## 🔴 High Priority (우선 처리 필요)

### 1. 필터 연산자 구현 (AND/OR 로직)

**위치**: `src/app/dashboard/hooks/useDashboardFilters.ts:27`

```typescript
// TODO: filterOperator is currently unused - implement AND/OR logic for multiple filter combinations
```

**작업 내용**: 여러 필터 조합에 대한 AND/OR 로직 구현
**예상 시간**: 2-3시간

### 2. useClientInstruments 리팩토링

**위치**: `src/app/clients/page.tsx:138`

```typescript
// TODO: Refactor useClientInstruments to use DataContext connections directly
```

**작업 내용**: DataContext의 connections를 직접 사용하도록 리팩토링
**예상 시간**: 1-2시간

### 3. SaleForm 최근 거래 클라이언트 우선 표시

**위치**: `src/app/sales/components/SaleForm.tsx:45`

```typescript
// TODO: 실제로는 판매 기록을 가져와서 최근 거래한 클라이언트를 우선 표시
```

**작업 내용**: 판매 기록을 기반으로 최근 거래한 클라이언트를 우선 표시
**예상 시간**: 1-2시간

### 4. useNotifications 버그 수정

**위치**: `src/hooks/useNotifications.ts:87`

```typescript
* This function incorrectly prioritizes scheduled_date over due_date, causing bugs
```

**작업 내용**: scheduled_date와 due_date 우선순위 로직 수정
**예상 시간**: 1시간

## 🟡 Medium Priority (중간 우선순위)

### 5. Clients 리스트 가상화 활성화

**위치**: `docs/PERFORMANCE_ANALYSIS.md`
**작업 내용**: 200+ 클라이언트 렌더링 성능 개선을 위해 react-window 활성화
**예상 시간**: 1-2시간
**효과**: 대용량 데이터 시 성능 향상

### 6. 인증/인가 강화

**위치**: `docs/PROJECT_CRITIQUE.md:582`
**작업 내용**:

- RLS (Row Level Security) 정책 검토 및 강화
- API 라우트 인증 미들웨어 추가
- 세션 관리 개선
- 권한 기반 접근 제어 구현
  **예상 시간**: 1-2일

### 7. 네비게이션 구조 정리 (완료)

**위치**: `docs/PROJECT_CRITIQUE.md:600`
**작업 내용**:

- 사이드바에 주요 페이지만 남기고 `/instruments` 라우트를 제거하여 Dashboard 중심 구조로 정리
- Dashboard의 Items 화면이 악기 관리 중심이며, 모든 악기 워크플로우가 그 안에 포함됨
- `/clients/analytics` 페이지는 사이드바에 추가되어 접근성이 확보됨
  **예상 시간**: 1-2일 (완료)

### 8. 기능 중복 해결 ✅ 완료

**위치**: `docs/PROJECT_CRITIQUE.md:605`
**작업 내용**:

- ✅ Dashboard vs Instruments 통합 완료 (Instruments 페이지 제거)
- ✅ 각 페이지의 목적 명확히 정의
  **예상 시간**: 2-3일 (실제: 완료)

## 🟢 Low Priority (낮은 우선순위)

### 9. 이미지 최적화

**작업 내용**:

- `next/image` 사용 확대
- Lazy loading 구현
  **예상 시간**: 2-3시간

### 10. 코드 스플리팅 확대

**작업 내용**:

- 페이지별 동적 import 확대
- 차트 라이브러리 (`recharts`) 동적 로딩
  **예상 시간**: 2-3시간

### 11. Context 세분화

**작업 내용**: 불필요한 리렌더링 방지를 위해 Context 분리
**예상 시간**: 4-6시간
**효과**: Context 변경 시 영향 범위 축소

### 12. 추가 컴포넌트 메모이제이션

**작업 내용**: 약 5-10개 컴포넌트에 React.memo 적용
**예상 시간**: 2-3시간
**효과**: 불필요한 리렌더링 방지

### 13. Dashboard 가상화

**작업 내용**: 100+ 아이템 리스트 성능 개선
**예상 시간**: 2-3시간
**효과**: 대용량 아이템 렌더링 성능 개선

### 14. 번들 크기 최적화

**작업 내용**:

- Tree shaking 최적화
- 사용하지 않는 라이브러리 제거
- 큰 라이브러리 lazy loading
  **예상 시간**: 2-4시간
  **효과**: 초기 로딩 속도 개선

## 📝 문서화 개선

### 15. API 문서화

**작업 내용**: API 엔드포인트에 대한 상세 문서 작성
**예상 시간**: 3-4시간

### 16. 컴포넌트 문서화

**작업 내용**: 주요 컴포넌트에 JSDoc 주석 추가
**예상 시간**: 4-6시간

## 🧪 테스트 개선

### 17. 테스트 커버리지 향상

**현재**: 51.04% (Statements)
**목표**: 70%+
**예상 시간**: 1-2주

### 18. E2E 테스트 확대

**작업 내용**: 주요 사용자 플로우에 대한 E2E 테스트 추가
**예상 시간**: 1주

## 🔧 기술 부채

### 19. 긴 함수/컴포넌트 리팩토링

**작업 내용**: 일부 긴 함수와 컴포넌트를 더 작은 단위로 분리
**예상 시간**: 1주

### 20. 타입 안정성 개선

**작업 내용**: `any` 타입 제거 및 타입 정의 강화
**예상 시간**: 3-5일
