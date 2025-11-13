# 상세 구현 계획

## 📊 현재 상태 요약

### ✅ 잘 작동하는 기능

- ✅ CRUD 기능 (Instruments, Clients, Connections) - 100%
- ✅ 캘린더 기능 - 80% (기본 기능 완료)
- ✅ 검색/필터/정렬 - 100%
- ✅ 인라인 편집 - 100%

### ⚠️ 개선 필요한 기능

- ⚠️ 캘린더 기능 - 클라이언트 연결, 날짜 표시 개선 필요
- ⚠️ Certificate 기능 - PDF 생성 필요
- ⚠️ 고유 번호 - serial_number 필드 필요

### ❌ 누락된 기능

- ❌ Certificate PDF 생성
- ❌ 고유 번호 시스템
- ❌ 클라이언트-작업 연결

---

## 🎯 우선순위별 구현 계획

### 1순위: 테스팅 확인 및 수정 (즉시)

#### 1.1 테스트 실행 및 확인

- [ ] 전체 테스트 실행
- [ ] 실패한 테스트 수정 (ClientFilters.test.tsx)
- [ ] E2E 테스트 실행
- [ ] 테스트 커버리지 확인

#### 1.2 기능 동작 확인

- [ ] Dashboard 페이지 동작 확인
- [ ] Clients 페이지 동작 확인
- [ ] Calendar 페이지 동작 확인
- [ ] Form 페이지 동작 확인

**예상 기간**: 1일

---

### 2순위: 캘린더 기능 개선 (필수)

#### 2.1 클라이언트 연결 개선

**문제**:

- `maintenance_tasks`에 `client_id` 필드가 없음
- `ownership` 필드만으로는 클라이언트와 직접 연결 불가

**해결 방법**:

1. `maintenance_tasks` 테이블에 `client_id` 필드 추가
2. 작업 생성 시 클라이언트 선택 기능 추가
3. 캘린더에 클라이언트 정보 표시

**마이그레이션**:

```sql
-- maintenance_tasks 테이블에 client_id 추가
ALTER TABLE maintenance_tasks
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_client_id ON maintenance_tasks(client_id);
```

**작업 내용**:

- [ ] 마이그레이션 파일 생성
- [ ] TypeScript 타입 업데이트
- [ ] TaskModal에 클라이언트 선택 추가
- [ ] 캘린더에 클라이언트 정보 표시
- [ ] TaskList에 클라이언트 정보 표시

#### 2.2 날짜 정보 표시 개선

**현재 상태**:

- `received_date`, `due_date`, `personal_due_date`, `scheduled_date` 필드 존재
- UI에 일부만 표시됨

**개선 사항**:

- [ ] TaskList에 모든 날짜 정보 명확히 표시
  - "받은 날짜: YYYY-MM-DD" (received_date)
  - "고객 요청 납기일: YYYY-MM-DD" (due_date)
  - "개인 목표 완료일: YYYY-MM-DD" (personal_due_date)
  - "예약된 작업일: YYYY-MM-DD" (scheduled_date)
- [ ] CalendarView에 날짜 정보 표시
- [ ] 날짜별 색상 구분
  - 지연된 작업: 빨간색
  - 임박한 작업: 주황색
  - 정상 작업: 파란색
- [ ] 날짜별 정렬 및 필터링

#### 2.3 여러 작업 그룹화 표시

**현재 상태**:

- 여러 작업을 캘린더에 표시하지만 그룹화되지 않음

**개선 사항**:

- [ ] 같은 날짜의 여러 작업을 그룹화하여 표시
- [ ] "오늘 할 일", "내일 할 일" 섹션 추가
- [ ] 작업 타입별 그룹화 (활털 갈기, 수리 등)
- [ ] 작업 목록에 작업 개수 표시

**예상 기간**: 2-3일

---

### 3순위: Certificate 기능 구현 (중간)

#### 3.1 Certificate 데이터 구조 개선

**현재 상태**:

- `certificate` boolean 필드만 있음

**개선 사항**:

- [ ] Certificate 정보 저장 구조 결정
  - 옵션 1: `instruments` 테이블에 certificate 관련 필드 추가
  - 옵션 2: 별도 `certificates` 테이블 생성
- [ ] Certificate 정보 필드 추가
  - 발급일
  - 유효기간
  - 발급자 정보
  - 가격 정보

#### 3.2 PDF 생성 기능

**작업 내용**:

- [ ] PDF 생성 라이브러리 설치
  - `jspdf` 또는 `react-pdf` 사용
- [ ] Certificate PDF 템플릿 생성
- [ ] PDF 생성 컴포넌트 구현
- [ ] "Create Certificate" 버튼 추가
- [ ] Certificate 미리보기 기능

**Certificate PDF 내용**:

- 악기 정보 (Maker, Type, Year, Serial Number)
- 가격 정보
- 발급일
- 발급자 정보
- 고유 번호
- Certificate 번호

**예상 기간**: 3-5일

---

### 4순위: 고유 번호 기능 구현 (중간)

#### 4.1 악기 고유 번호

**작업 내용**:

- [ ] `instruments` 테이블에 `serial_number` 필드 추가
- [ ] 고유 번호 생성 로직 구현
  - 형식: "VI123", "BO456" (악기 타입별)
  - 또는 랜덤 번호: "mj123"
  - 또는 사용자 정의 형식
- [ ] 고유 번호 표시
- [ ] 고유 번호 검색 기능
- [ ] 고유 번호 중복 확인

**마이그레이션**:

```sql
-- instruments 테이블에 serial_number 추가
ALTER TABLE instruments
ADD COLUMN IF NOT EXISTS serial_number TEXT UNIQUE;

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_instruments_serial_number ON instruments(serial_number);
```

#### 4.2 클라이언트 고유 번호

**작업 내용**:

- [ ] `clients` 테이블에 `client_number` 필드 추가
- [ ] 고유 번호 생성 로직 구현
- [ ] 고유 번호 표시
- [ ] 고유 번호 검색 기능

**마이그레이션**:

```sql
-- clients 테이블에 client_number 추가
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS client_number TEXT UNIQUE;

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_clients_client_number ON clients(client_number);
```

#### 4.3 물리적 태그 연동

**작업 내용**:

- [ ] 고유 번호와 물리적 태그 매칭
- [ ] 태그 검색 기능
- [ ] 태그별 필터링
- [ ] 태그 인쇄 기능 (선택적)

**예상 기간**: 2-3일

---

## 🚀 구현 단계

### Phase 1: 테스팅 및 확인 (1일)

1. 테스트 실행 및 수정
2. 기능 동작 확인
3. 문제점 파악 및 수정

### Phase 2: 캘린더 기능 개선 (2-3일)

1. maintenance_tasks에 client_id 추가
2. 날짜 정보 UI 개선
3. 여러 작업 그룹화 표시

### Phase 3: Certificate 기능 (3-5일)

1. PDF 생성 라이브러리 설치
2. Certificate PDF 템플릿 생성
3. PDF 생성 기능 구현

### Phase 4: 고유 번호 기능 (2-3일)

1. serial_number 필드 추가
2. 고유 번호 생성 로직 구현
3. 고유 번호 표시 및 검색

---

## 📋 마이그레이션 파일 목록

### 필수 마이그레이션

1. `20241112141803_add_subtype_column.sql` - subtype 컬럼 추가
2. `20241112141804_update_status_constraint.sql` - status 제약조건 업데이트
3. `20251109150920_maintenance_tasks.sql` - maintenance_tasks 테이블 생성

### 추가 마이그레이션 (필요시)

4. `20241112150000_add_client_id_to_maintenance_tasks.sql` - client_id 추가
5. `20241112150001_add_serial_number_to_instruments.sql` - serial_number 추가
6. `20241112150002_add_client_number_to_clients.sql` - client_number 추가

---

## ✅ 체크리스트

### 즉시 수행

- [ ] 테스트 실행 및 수정
- [ ] 기능 동작 확인
- [ ] 데이터베이스 마이그레이션 실행 확인

### 중기 목표

- [ ] 캘린더 기능 개선
- [ ] Certificate PDF 생성
- [ ] 고유 번호 기능

### 장기 목표

- [ ] 물리적 태그 연동
- [ ] Certificate 상세 기능
- [ ] 추가 개선 사항

---

**예상 총 기간**: 1-2주

**마지막 업데이트**: 2024-11-12
