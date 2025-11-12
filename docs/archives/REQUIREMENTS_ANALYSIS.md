# 요구사항 분석 및 구현 계획

## 📊 현재 상태 분석

### ✅ 이미 구현된 기능

#### 1. 캘린더 기능 (80% 완료)
- ✅ 작업 추가/수정/삭제
- ✅ `personal_due_date` 필드 (개인 목표 완료일)
- ✅ `received_date` 필드 (접수일)
- ✅ `due_date` 필드 (고객 요청 납기일)
- ✅ `scheduled_date` 필드 (예약된 작업일)
- ✅ `ownership` 필드 표시 (악기 소유자)
- ✅ 캘린더 뷰와 리스트 뷰
- ⚠️ 클라이언트와의 연결이 명확하지 않음
- ⚠️ 날짜 정보가 UI에 명확하게 표시되지 않음

#### 2. Certificate 기능 (10% 완료)
- ✅ `certificate` boolean 필드 존재
- ❌ PDF 생성 기능 없음
- ❌ 가격 표시 기능 없음
- ❌ Certificate 생성 폼 없음

#### 3. 고유 번호 기능 (0% 완료)
- ❌ `serial_number` 필드 없음
- ❌ 악기 고유 번호 없음
- ❌ 클라이언트 고유 번호 없음

---

## 🎯 요구사항별 구현 계획

### 1. 테스팅 확인 (즉시 수행)

**현재 상태:**
- ✅ 713개 테스트 통과
- ✅ 43% 커버리지
- ⚠️ 일부 테스트 실패 (ClientFilters.test.tsx)

**작업 내용:**
- [ ] 실패한 테스트 수정
- [ ] 전체 테스트 실행 및 확인
- [ ] E2E 테스트 실행

---

### 2. 캘린더 기능 개선 (우선순위: 높음)

#### 2.1 활/악기 소유자 추적 개선

**현재 상태:**
- ✅ `ownership` 필드로 소유자 표시
- ⚠️ 클라이언트와의 연결이 명확하지 않음

**개선 사항:**
- [ ] `maintenance_tasks` 테이블에 `client_id` 필드 추가
- [ ] 클라이언트 정보를 캘린더에 표시
- [ ] "활 a는 누구 것" 정보 명확히 표시

**마이그레이션:**
```sql
-- maintenance_tasks 테이블에 client_id 추가
ALTER TABLE maintenance_tasks 
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
```

#### 2.2 날짜 정보 표시 개선

**현재 상태:**
- ✅ `received_date`, `due_date`, `personal_due_date`, `scheduled_date` 필드 존재
- ⚠️ UI에 명확하게 표시되지 않음

**개선 사항:**
- [ ] TaskList에 날짜 정보 명확히 표시
  - "받은 날짜: YYYY-MM-DD"
  - "고객 요청 납기일: YYYY-MM-DD"
  - "개인 목표 완료일: YYYY-MM-DD"
  - "예약된 작업일: YYYY-MM-DD"
- [ ] CalendarView에 날짜 정보 표시
- [ ] 날짜별 색상 구분 (지연, 임박, 정상)

#### 2.3 여러 작업 표시 개선

**현재 상태:**
- ✅ 여러 작업을 캘린더에 표시
- ⚠️ "내일은 활털 a,b를 갈기로 되어있다" 같은 표시 없음

**개선 사항:**
- [ ] 같은 날짜의 여러 작업을 그룹화하여 표시
- [ ] 작업 목록에 "오늘 할 일", "내일 할 일" 섹션 추가
- [ ] 작업 타입별 필터링 (활털 갈기, 수리 등)

---

### 3. Certificate 기능 구현 (우선순위: 중간)

#### 3.1 Certificate 데이터 구조 개선

**현재 상태:**
- ✅ `certificate` boolean 필드만 있음
- ❌ Certificate 상세 정보 없음

**개선 사항:**
- [ ] Certificate 테이블 생성 (선택적)
  - 또는 `instruments` 테이블에 certificate 관련 필드 추가
- [ ] Certificate 정보 저장
  - 가격
  - 발급일
  - 유효기간
  - 발급자 정보

#### 3.2 PDF 생성 기능

**작업 내용:**
- [ ] PDF 생성 라이브러리 설치 (예: `jspdf`, `react-pdf`)
- [ ] Certificate PDF 템플릿 생성
- [ ] PDF 생성 컴포넌트 구현
- [ ] "Create Certificate" 버튼 추가

**Certificate PDF 내용:**
- 악기 정보 (Maker, Type, Year, Serial Number)
- 가격 정보
- 발급일
- 발급자 정보
- 고유 번호

---

### 4. 고유 번호 기능 구현 (우선순위: 중간)

#### 4.1 악기 고유 번호

**작업 내용:**
- [ ] `instruments` 테이블에 `serial_number` 필드 추가
- [ ] 고유 번호 생성 로직 구현
  - 형식: "VI123", "BO456" 등
  - 또는 랜덤 번호: "mj123"
- [ ] 고유 번호 표시 및 검색 기능

**마이그레이션:**
```sql
-- instruments 테이블에 serial_number 추가
ALTER TABLE instruments 
ADD COLUMN IF NOT EXISTS serial_number TEXT UNIQUE;

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_instruments_serial_number ON instruments(serial_number);
```

#### 4.2 클라이언트 고유 번호

**작업 내용:**
- [ ] `clients` 테이블에 `client_number` 필드 추가
- [ ] 고유 번호 생성 로직 구현
- [ ] 고유 번호 표시 및 검색 기능

**마이그레이션:**
```sql
-- clients 테이블에 client_number 추가
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS client_number TEXT UNIQUE;

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_clients_client_number ON clients(client_number);
```

#### 4.3 물리적 태그 연동

**작업 내용:**
- [ ] 고유 번호와 물리적 태그 매칭
- [ ] 태그 검색 기능
- [ ] 태그별 필터링

---

## 📋 구현 우선순위

### 즉시 수행 (1순위)
1. ⭐ **테스팅 확인** - 전체 기능 동작 확인
2. ⭐ **캘린더 기능 개선** - 날짜 정보 명확히 표시
3. ⭐ **클라이언트 연결 개선** - maintenance_tasks에 client_id 추가

### 중기 목표 (2순위)
4. **Certificate 기능** - PDF 생성 기능
5. **고유 번호 기능** - 악기/클라이언트 고유 번호
6. **캘린더 UI 개선** - 여러 작업 그룹화 표시

### 장기 목표 (3순위)
7. **물리적 태그 연동** - 태그 검색 및 필터링
8. **Certificate 상세 기능** - Certificate 관리 시스템

---

## 🚀 다음 단계

### 1단계: 테스팅 확인 (1일)
- [ ] 실패한 테스트 수정
- [ ] 전체 테스트 실행
- [ ] E2E 테스트 실행

### 2단계: 캘린더 기능 개선 (2-3일)
- [ ] maintenance_tasks에 client_id 추가
- [ ] 날짜 정보 UI 개선
- [ ] 클라이언트 정보 표시 개선

### 3단계: Certificate 기능 (3-5일)
- [ ] PDF 생성 라이브러리 설치
- [ ] Certificate PDF 템플릿 생성
- [ ] PDF 생성 기능 구현

### 4단계: 고유 번호 기능 (2-3일)
- [ ] serial_number 필드 추가
- [ ] 고유 번호 생성 로직 구현
- [ ] 고유 번호 표시 및 검색 기능

---

**예상 기간**: 1-2주

**마지막 업데이트**: 2024-11-12

