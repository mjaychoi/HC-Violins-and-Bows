# 캘린더 기능 구현 현황

## ✅ 완료된 작업

### 1. 데이터베이스 스키마 설계
- ✅ `migration-maintenance-tasks.sql` 파일 생성
- ✅ `maintenance_tasks` 테이블 정의
- ✅ 인덱스 및 RLS 정책 설정
- ✅ `updated_at` 자동 업데이트 트리거

### 2. TypeScript 타입 정의
- ✅ `TaskType`, `TaskStatus`, `TaskPriority` 타입 정의
- ✅ `MaintenanceTask` 인터페이스 정의
- ✅ `CalendarEvent`, `TaskFilters` 인터페이스 정의
- ✅ `src/types/index.ts`에 추가 완료

### 3. Supabase Helper 함수
- ✅ `fetchMaintenanceTasks()` - 필터링 지원
- ✅ `fetchMaintenanceTaskById()` - 단일 작업 조회
- ✅ `fetchTasksByDateRange()` - 날짜 범위 조회
- ✅ `createMaintenanceTask()` - 작업 생성
- ✅ `updateMaintenanceTask()` - 작업 수정
- ✅ `deleteMaintenanceTask()` - 작업 삭제
- ✅ `fetchTasksByScheduledDate()` - 예약일별 조회
- ✅ `fetchOverdueTasks()` - 지연된 작업 조회

### 4. Custom Hook
- ✅ `useMaintenanceTasks` hook 구현
- ✅ CRUD 작업 지원
- ✅ 에러 핸들링 통합
- ✅ 로딩 상태 관리

---

## 🚧 다음 단계

### 1. 데이터베이스 마이그레이션 실행 (필수)
```bash
# Supabase 대시보드에서 SQL Editor 열기
# migration-maintenance-tasks.sql 파일 내용 실행
```

### 2. 캘린더 UI 구현
- [ ] 캘린더 페이지 생성 (`src/app/calendar/page.tsx`)
- [ ] 캘린더 뷰 컴포넌트 (월별/주별)
- [ ] 작업 카드 컴포넌트
- [ ] 작업 목록 뷰

### 3. 작업 관리 UI
- [ ] 작업 추가 모달
- [ ] 작업 수정 모달
- [ ] 작업 상세 뷰
- [ ] 작업 필터 컴포넌트

### 4. 테스팅
- [ ] E2E 테스트 (`tests/e2e/calendar.spec.ts`)
- [ ] 통합 테스트
- [ ] 단위 테스트 (hook, utils)

---

## 📋 구현 계획 상세

### Phase 1: 기본 캘린더 뷰 (예상 2-3일)
1. **캘린더 라이브러리 설치**
   ```bash
   npm install react-big-calendar date-fns
   npm install --save-dev @types/react-big-calendar
   ```

2. **캘린더 페이지 생성**
   - 월별 뷰
   - 작업 표시
   - 날짜 클릭 시 작업 목록 표시

3. **기본 스타일링**
   - Tailwind CSS 활용
   - 반응형 디자인

### Phase 2: 작업 관리 기능 (예상 2일)
1. **작업 추가 모달**
   - 악기 선택
   - 작업 타입 선택
   - 날짜 설정 (접수일, 납기일, 개인 목표일, 예약일)
   - 우선순위 설정
   - 설명 입력

2. **작업 수정 모달**
   - 기존 작업 정보 표시
   - 상태 변경
   - 날짜 수정
   - 노트 추가

### Phase 3: 고급 기능 (예상 2일)
1. **필터링**
   - 상태별 필터
   - 작업 타입별 필터
   - 우선순위별 필터
   - 날짜 범위 필터

2. **알림**
   - 지연된 작업 알림
   - 오늘 예정된 작업 알림
   - 납기일 임박 알림

3. **드래그 앤 드롭**
   - 작업 날짜 변경
   - 스케줄 조정

### Phase 4: 테스팅 (예상 2일)
1. **E2E 테스트**
   - 캘린더 페이지 접근
   - 작업 추가/수정/삭제
   - 필터링 테스트
   - 날짜 변경 테스트

2. **통합 테스트**
   - API 호출 테스트
   - 데이터 동기화 테스트

---

## 🎯 주요 기능 요구사항

### 1. 작업 관리
- ✅ 활 A, B, C, D 등이 있고 각각 누구의 것인지 (ownership)
- ✅ 언제 받았고 (received_date) 언제까지 완료해야 하는지 (due_date)
- ✅ 스케줄 추가 기능 (악기/활 수리, 활털 갈기 등)
- ✅ 내일은 활털 A, B를 갈기로 되어있다 (scheduled_date)
- ✅ 개인적으로 언제까지 끝내고 싶다 표시 (personal_due_date)

### 2. 캘린더 뷰
- 월별 뷰
- 주별 뷰 (선택사항)
- 일별 뷰 (선택사항)
- 작업 수 표시
- 색상으로 우선순위/상태 구분

### 3. 작업 목록
- 대기 중인 작업
- 진행 중인 작업
- 오늘 예정된 작업
- 지연된 작업

---

## 📝 다음 작업 지시사항

1. **데이터베이스 마이그레이션 실행**
   - Supabase 대시보드 접속
   - SQL Editor에서 `migration-maintenance-tasks.sql` 실행
   - 테이블 생성 확인

2. **캘린더 라이브러리 설치**
   ```bash
   npm install react-big-calendar date-fns
   npm install --save-dev @types/react-big-calendar
   ```

3. **기본 캘린더 페이지 생성**
   - `src/app/calendar/page.tsx` 생성
   - 기본 레이아웃 설정
   - 캘린더 컴포넌트 통합

---

## 🔍 확인 사항

### 질문 1: 활(bow)과 악기(instrument) 구분
- 현재 `instruments` 테이블의 `type` 필드로 구분 가능한가?
- 예: `type = 'Bow'` 또는 `type = 'Violin'`
- 아니면 별도 `bows` 테이블이 필요한가?

### 질문 2: 작업 우선순위
- 현재 정의한 4단계 (low, medium, high, urgent)로 충분한가?

### 질문 3: 알림 방식
- 브라우저 알림? 토스트? 이메일?

### 질문 4: 캘린더 뷰
- 월별만? 주별? 일별도 필요한가?

### 질문 5: 드래그 앤 드롭
- 필수인가? 아니면 수동 입력만으로도 충분한가?

---

## 📚 참고 문서

- [구현 계획서](./IMPLEMENTATION_PLAN.md)
- [데이터베이스 마이그레이션](../migration-maintenance-tasks.sql)
- [타입 정의](../src/types/index.ts)
- [Hook 구현](../src/hooks/useMaintenanceTasks.ts)

