# 레포지토리 남은 작업 요약

## ✅ 최근 완료된 작업

### 1. 캘린더 기능 개선 (완료)

- ✅ `maintenance_tasks`에 `client_id` 추가 (마이그레이션 파일 생성)
- ✅ 날짜 정보 UI 개선 (received_date, due_date, personal_due_date, scheduled_date)
- ✅ 여러 작업 그룹화 표시 기능 추가 ("내일은 활털 a,b를 갈기로 되어있다")
- ✅ `GroupedTaskList` 컴포넌트 생성
- ✅ 클라이언트 정보 표시 기능 추가
- ✅ 모든 TypeScript 오류 수정

---

## 🔴 우선순위 높음 (즉시 수행 필요)

### 1. 데이터베이스 마이그레이션 실행

**상태**: 마이그레이션 파일 생성 완료, 실행 필요

**파일**: `supabase/migrations/20250101000000_add_client_id_to_maintenance_tasks.sql`

**작업 내용**:

- [ ] Supabase 대시보드에서 마이그레이션 실행
- [ ] `maintenance_tasks` 테이블에 `client_id` 컬럼 추가 확인
- [ ] 인덱스 생성 확인

**실행 방법**:

1. Supabase 대시보드 접속: https://supabase.com/dashboard/project/dmilmlhquttcozxlpfxw/sql/new
2. 마이그레이션 파일 내용 복사
3. SQL Editor에 붙여넣기 후 실행

---

### 2. 실패한 테스트 수정

**상태**: ✅ 완료

**파일**: `src/app/calendar/__tests__/page.test.tsx`

- ✅ `GroupedTaskList` 컴포넌트에 `data-testid="task-list"` 추가
- ✅ 테스트 모크 추가
- ✅ 모든 테스트 통과

---

### 3. 스킵된 테스트 처리

**상태**: 4개 테스트 스킵됨

**파일**:

- `src/app/clients/hooks/__tests__/useClients.mutations.test.tsx` (3개)
  - `create 성공`
  - `update 성공`
  - `delete 성공`
- `src/app/clients/hooks/__tests__/useClients.state.test.tsx` (1개)
  - `loading 상태 전환 확인`

**작업 내용**:

- [ ] 스킵된 테스트 수정 및 활성화
- [ ] 비동기 상태 관리 문제 해결
- [ ] 테스트 실행 및 확인

---

## 🟡 우선순위 중간 (중요한 기능)

### 4. Certificate 기능 - PDF 생성 기능 구현

**상태**: 10% 완료 (certificate boolean 필드만 존재)

**작업 내용**:

- [ ] PDF 생성 라이브러리 설치 (`jspdf` 또는 `react-pdf`)
- [ ] Certificate 데이터 구조 설계
  - 발급일
  - 유효기간
  - 발급자 정보
  - 가격 정보
- [ ] Certificate PDF 템플릿 생성
- [ ] PDF 생성 컴포넌트 구현
- [ ] "Create Certificate" 버튼 추가 (악기 상세 페이지 또는 목록)
- [ ] Certificate 미리보기 기능

**예상 기간**: 3-5일

---

### 5. 고유 넘버 기능 - 악기/클라이언트 고유 번호 추가

**상태**: ✅ 완료

**작업 내용**:

#### 5.1 악기 고유 번호

- ✅ `instruments` 테이블에 `serial_number` 필드 추가 (마이그레이션 파일 생성)
- ✅ 고유 번호 생성 로직 구현 (`src/utils/uniqueNumberGenerator.ts`)
  - 형식 옵션: "VI001", "BO123" (악기 타입별)
  - 또는 사용자 정의 형식: "mj123"
- ✅ 고유 번호 표시 (목록, 상세 페이지)
- ✅ 고유 번호 검색 기능
- ✅ 고유 번호 중복 확인 및 유효성 검증

#### 5.2 클라이언트 고유 번호

- ✅ `clients` 테이블에 `client_number` 필드 추가 (마이그레이션 파일 생성)
- ✅ 고유 번호 생성 로직 구현
- ✅ 고유 번호 표시
- ✅ 고유 번호 검색 기능

**마이그레이션 파일**: `supabase/migrations/20250101000001_add_unique_numbers.sql`

**구현된 기능**:

- ✅ TypeScript 타입 정의 업데이트
- ✅ 고유 번호 생성 유틸리티 함수 (`generateInstrumentSerialNumber`, `generateClientNumber`)
- ✅ 고유 번호 유효성 검증 함수 (`validateUniqueNumber`)
- ✅ 폼에 고유 번호 입력 필드 추가
- ✅ 리스트에 고유 번호 컬럼 추가 (정렬 가능)
- ✅ 검색 기능에 고유 번호 추가
- ✅ 인라인 편집 모드에서 고유 번호 수정 가능

**남은 작업**:

- [ ] 데이터베이스 마이그레이션 실행 (Supabase 대시보드에서)
- [ ] 테스트 파일의 TypeScript 오류 수정 (2개 남음)

**예상 기간**: 완료 (마이그레이션 실행 필요)

---

## 🟢 우선순위 낮음 (선택적)

### 6. 레포지토리 정리 - 문서 및 코드 정리

**상태**: 일부 완료

**작업 내용**:

- [ ] 중복 문서 정리
- [ ] 사용하지 않는 파일 삭제
- [ ] README.md 업데이트
- [ ] 문서 구조 개선

---

## 📊 현재 상태

### 테스트 현황

- ✅ **767개 테스트 통과**
- ⏸️ **4개 테스트 스킵** (useClients.mutations.test.tsx, useClients.state.test.tsx)
- ✅ **44개 테스트 스위트 통과** (1개 스킵)

### 코드 품질

- ⚠️ **TypeScript 오류: 2개** (테스트 파일 mock 데이터)
- ⚠️ **ESLint 경고: 1개** (기존 경고)
- ✅ **타입 안정성: 거의 완료**

### 기능 완성도

- ✅ **CRUD 기능: 100%**
- ✅ **캘린더 기능: 95%** (마이그레이션 실행 필요)
- ❌ **Certificate 기능: 10%**
- ✅ **고유 번호 기능: 95%** (마이그레이션 실행 필요, 테스트 파일 수정 필요)

---

## 🚀 다음 단계 권장 순서

### 1단계: 즉시 수행 (1일)

1. [ ] 데이터베이스 마이그레이션 실행
   - `20250101000000_add_client_id_to_maintenance_tasks.sql`
   - `20250101000001_add_unique_numbers.sql`
2. ✅ 실패한 테스트 수정 (task-list 테스트 ID 추가)
3. [ ] 스킵된 테스트 처리 (선택적)
4. [ ] 테스트 파일의 TypeScript 오류 수정 (2개 남음)

### 2단계: 중기 목표 (3-5일)

5. [ ] Certificate 기능 구현
   - PDF 생성 라이브러리 설치
   - Certificate PDF 템플릿 생성
   - PDF 생성 기능 구현

### 3단계: 완료

6. ✅ 고유 넘버 기능 구현
   - 악기 고유 번호 추가
   - 클라이언트 고유 번호 추가
   - 검색 기능 구현
   - 마이그레이션 파일 생성

### 4단계: 선택적 (1일)

7. [ ] 레포지토리 정리
   - 문서 정리
   - 코드 정리

---

## 📝 참고 사항

### 마이그레이션 실행 가이드

- Supabase 대시보드: https://supabase.com/dashboard/project/dmilmlhquttcozxlpfxw/sql/new
- 마이그레이션 파일: `supabase/migrations/20250101000000_add_client_id_to_maintenance_tasks.sql`

### 테스트 실행

```bash
# 전체 테스트 실행
npm test

# 특정 테스트 실행
npm test -- useClients.mutations.test.tsx

# 커버리지 확인
npm run test:coverage
```

### 문서 위치

- 마이그레이션 가이드: `docs/migrations/README.md`
- 프로젝트 문서: `docs/README.md`
- 오래된 문서: `docs/archives/README.md`

---

**마지막 업데이트**: 2025-01-01

## 📝 최근 변경 사항

### 고유 번호 기능 구현 (2025-01-01)

- ✅ 데이터베이스 마이그레이션 파일 생성
- ✅ TypeScript 타입 정의 업데이트
- ✅ 고유 번호 생성 유틸리티 함수 구현
- ✅ 폼에 고유 번호 필드 추가
- ✅ 리스트에 고유 번호 컬럼 추가
- ✅ 검색 기능에 고유 번호 추가
- ✅ 대부분의 테스트 파일 수정 완료
- ⚠️ 2개 테스트 파일의 TypeScript 오류 남음 (dashboardUtils.test.ts)
