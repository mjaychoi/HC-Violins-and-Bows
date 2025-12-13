# 기능/요구사항 정리 및 작업 계획

## 진행률 요약
- **전체 진행률**: 약 98% 완료
- **핵심 기능**: 모두 구현 완료 ✅
- **아키텍처 개선**: API 라우트 통일, 성능 최적화, 타입 가드 추가 완료 ✅
- **선택사항**: 페이지네이션/무한 스크롤, DB 인덱스 최적화 (수동 적용 필요)

## 질문/요구사항 (모두 해결됨 ✅)
- ✅ Serial # 접두사(BO/VI/CE): 카테고리 기반으로 구현 완료 (VI/VO/CE/BO 등)
- ✅ Serial # 길이 확장: `VI1234567` 형식으로 구현 완료 (2자리 접두사 + 7자리 숫자)
- ✅ 이메일 아이콘 동작: mailto 템플릿으로 구현 완료
- ✅ View 아이콘 vs Edit 아이콘 구분: 툴팁으로 구분 완료
- ✅ 클라이언트 카드 클릭 = View: 구현 완료
- ✅ View 섹션: Accordion 형태로 구현 완료
- ✅ Instrument 연결 정확도: 필터링 로직 개선 완료
- ✅ Connected Clients 섹션: 배지 리스트로 단순화 완료
- ✅ 캘린더 검색: 다중 필드 검색 및 하이라이트 구현 완료

## 작업 계획 및 진행 상황

1) ✅ 요구사항 확정 (완료)
   - ✅ Serial # 규칙(접두/길이/검증) 정의 및 구현
   - ✅ 이메일 아이콘 기대 동작 확정 및 구현
   - ✅ Connected Clients 섹션 단순화 결정 및 구현
   - ✅ View/Edit 아이콘 구분 방식 구현

2) ✅ 데이터/로직 점검 (완료)
   - ✅ 시리얼 생성·검증·검색·정렬 영향 범위 파악 및 구현
   - ✅ 클라이언트–아이템 관계 쿼리/필터 수정으로 잘못된 매핑 해결

3) ✅ UI/UX 수정 (완료)
   - ✅ 클라이언트 카드 전체 클릭을 View로 매핑
   - ✅ 아이콘 툴팁/라벨 추가로 View vs Edit 구분
   - ✅ View 섹션을 Accordion 형태로 전환
   - ✅ Connected Clients 섹션 간결 표시

4) ✅ 검색 기능 확장(캘린더) (완료)
   - ✅ 백엔드/프론트 검색 필터에 시리얼/이름/타입/소유자 등 필드 추가
   - ✅ 결과 정렬 및 하이라이트 구현
   - ⏳ 페이지네이션/무한 스크롤 (선택사항, 미구현)

5) ✅ QA/문서 (대부분 완료)
   - ✅ 타입 가드 추가 완료 (Zod 기반 런타임 타입 검증)
   - ✅ API 라우트 타입 검증 적용 완료
   - ✅ 테스트 수정 및 통과 (useConnections, useInstruments, useClients)
   - ⏳ 주요 시나리오에 대한 E2E/통합 테스트 보강 (선택사항)
   - ⏳ README/UX 가이드 업데이트 (선택사항)  

## 결정 필요 사항 (대부분 해결됨)
- ✅ Serial # 규칙(접두/길이/검증 로직) 확정 → 2자리 접두사 + 7자리 숫자로 구현
- ✅ 이메일 아이콘 클릭 시 정확한 동작 → mailto 템플릿으로 구현
- ✅ Connected Clients 섹션 삭제 여부 → 간단한 배지 표시로 단순화
- ✅ View/Edit 구분 방식(툴팁 문구 등) → "상세 보기", "편집" 툴팁으로 구현

## 구현 상태

### ✅ 완료된 기능

- **Serial # 규칙/확장** ✅
  - ✅ 데이터: 2자리 접두사(BO/VI/CE 등) + 7자리 숫자 형식으로 확장
  - ✅ 생성: `generateInstrumentSerialNumber` 함수 업데이트 (7자리 zero-pad)
  - ✅ 검증: `validateInstrumentSerial` 함수 추가 (`^[A-Z]{2}\\d{7}$` 정규식)
  - ✅ 정규화: `normalizeInstrumentSerial` 함수 추가
  - ✅ UI: ItemForm, ItemList에서 검증 및 정규화 적용
  - ⚠️ DB 인덱스: SQL 스크립트 제공됨 (수동 적용 필요)

- **이메일 아이콘** ✅
  - ✅ 최소 구현: `mailto:${client.email}` (제목/본문 템플릿 포함)
  - ✅ UX: 호버 툴팁 "이메일 보내기", 키보드 포커스 가능
  - ✅ 비활성화: 이메일 없을 때 비활성화 및 시각적 표시
  - ⏳ 확장: 선호 메일 템플릿 저장/발송 로그 (추후 구현)

- **View vs Edit** ✅
  - ✅ 아이콘: 서로 다른 모양 + 툴팁("상세 보기", "편집")
  - ✅ 카드 전체 클릭 → View 액션 매핑
  - ✅ 상태 표현: View는 읽기 전용 Accordion, Edit는 폼 전환

- **View 섹션(Accordion)** ✅
  - ✅ 필수 필드 요약(이름/이메일/노트)을 헤더에 배치
  - ✅ 클릭 시 상세 펼침 (Email, Contact, Interest, Client #, Tags, Note)
  - ✅ 접근성: 키보드 토글, ARIA 속성(`aria-expanded`, `aria-controls`)

- **Instrument 연결 정확도** ✅
  - ✅ API/쿼리: `instrument_id`로 필터링하여 정확한 관계만 표시
  - ✅ UI: ClientModal에서 선택된 클라이언트의 관계만 필터링
  - ✅ 빈 결과: 명확한 empty state 표시

- **Connected Clients 섹션** ✅
  - ✅ 단순화: 아이템의 Ownership 셀에 간단한 배지 리스트로 표시
  - ✅ 최대 3개 표시, 초과 시 "+N more" 표시
  - ✅ 정적 리스트 (소트/필터 없음)

- **캘린더 검색 확장** ✅
  - ✅ UI: 단일 검색창 + 태그형 필터(타입/우선순위/상태/소유자)
  - ✅ 디바운스: 300ms 적용
  - ✅ 검색: 다중 필드 검색 (name/serial/type/owner)
  - ✅ 결과: 매칭 하이라이트 구현
  - ✅ 정렬: 날짜(기본), 우선순위, 상태, 타입 정렬 (오름차순/내림차순)
  - ⚠️ 인덱스: SQL 스크립트 제공됨 (수동 적용 필요)
  - ⏳ 페이지네이션/무한 스크롤: 미구현 (선택사항)

### ⏳ 보류/추후 구현 (선택사항)

- DB 인덱스 최적화 (복합 인덱스, trigram, tsvector) - SQL 스크립트 제공됨, 수동 적용 필요
- 페이지네이션 또는 무한 스크롤 (선택사항, 현재는 모든 데이터 로드)
- 이메일 템플릿 저장 및 발송 로그 (추후 확장)
- E2E 테스트 확장 (선택사항)

### ✅ 아키텍처 개선 (최근 완료)

- ✅ **API 라우트 통일**
  - ✅ `/api/clients`, `/api/instruments`, `/api/connections` 생성 완료
  - ✅ `/api/maintenance-tasks` 생성 완료 (GET, POST, PATCH, DELETE)
  - ✅ `/api/sales` 생성 완료
  - ✅ 모든 직접 Supabase 호출을 API 라우트로 마이그레이션 완료
  - ✅ `DataContext`, `useClientInstruments`, `useMaintenanceTasks` 마이그레이션 완료
  - ✅ 에러 핸들링, 로깅, 모니터링 통일

- ✅ **데이터 페칭 전략 통일**
  - ✅ Context API 기반 `useUnified*` 훅으로 통일
  - ✅ `useOptimized*` 훅 deprecated 처리 완료 (`@deprecated` 주석 추가)
  - ✅ 모든 app 페이지에서 `useUnified*` 사용 확인

- ✅ **성능 최적화**
  - ✅ O(n²) 복잡도 → Map 기반 O(n)으로 개선
  - ✅ `useMemo`/`useCallback` 일관성 확보
  - ✅ 주요 조회 로직 최적화 완료 (`clientMap`, `instrumentMap`, `relationshipsMap` 등)

- ✅ **타입 가드 추가** (2025-01-XX 완료)
  - ✅ Zod 라이브러리 설치 및 스키마 정의
  - ✅ 타입 가드 유틸리티 함수 생성 (`typeGuards.ts`)
  - ✅ API 라우트에 타입 검증 적용 (모든 주요 API)
  - ✅ 런타임 타입 안정성 향상

- ✅ **Deprecated 훅 정리**
  - ✅ `useDashboardItems` deprecated 처리 (export 제거, 테스트 호환성 유지)
  - ✅ `useOptimizedClients`, `useOptimizedInstruments`, `useOptimizedConnections` deprecated 처리
  - ✅ 모든 deprecated 훅에 `useUnified*` 대안 명시

- ✅ **페이지 통합** (2025-01-XX 완료)
  - ✅ `/customer` → `/clients/analytics` 리다이렉트 완료
  - ✅ `/clients/analytics`가 실제 API 사용 중 (Mock 데이터 제거)

## 구현된 파일 목록

### Serial # 규칙/확장
- `src/utils/uniqueNumberGenerator.ts` - 시리얼 생성/검증/정규화 함수
- `src/utils/__tests__/uniqueNumberGenerator.test.ts` - 테스트 업데이트
- `src/app/dashboard/components/ItemForm.tsx` - 시리얼 입력 및 검증
- `src/app/dashboard/components/ItemList.tsx` - 시리얼 편집 및 검증

### 이메일 아이콘
- `src/app/clients/components/ClientList.tsx` - mailto 템플릿 및 툴팁

### View vs Edit / Accordion
- `src/app/clients/components/ClientList.tsx` - View/Edit 구분, Accordion 구현

### Instrument 연결 정확도
- `src/app/clients/components/ClientModal.tsx` - 필터링 로직 개선

### Connected Clients 섹션
- `src/app/dashboard/components/ItemList.tsx` - 배지 리스트 표시

### 캘린더 검색 확장
- `src/app/calendar/components/CalendarSearch.tsx` - 검색 컴포넌트
- `src/app/calendar/utils/searchUtils.ts` - 검색/정렬/하이라이트 유틸리티
- `src/app/calendar/page.tsx` - 검색 통합
- `src/app/calendar/components/GroupedTaskList.tsx` - 하이라이트 적용

## 구현 아이디어(참고)
- Serial # 규칙/확장
  - 데이터: `serial_prefix`(BO/VI/CE 등) + `serial_numeric`(zero-pad) 칼럼 분리 저장을 고려 → 정렬/검색 정확도 확보.
  - 생성: 타입 선택 시 prefix 자동 세팅, 번호는 digits 길이 체크(예: 7자리) 및 zero-pad. 프론트 입력 시 마스킹(`VI______`) 또는 접두 고정 후 숫자 입력.
  - 검증: 프론트/백 둘 다 정규식 검증(`^[A-Z]{2}\\d{7}$` 등), DB unique 인덱스(prefix+numeric).
  - 검색/정렬: DB에서 prefix+numeric concat 가상칼럼 또는 DB 함수로 정렬/검색; UI 검색은 prefix 무시/포함 둘 다 매치.

- 이메일 아이콘
  - 최소: `mailto:${client.email}` (제목/본문 템플릿 파라미터 포함).
  - 확장: 선호 메일 템플릿 저장 후 적용, 발송 로그 남길 경우 API 경유(추후).
  - UX: 호버 툴팁 "이메일 보내기", 키보드 포커스 가능.

- View vs Edit
  - 아이콘: 서로 다른 모양 + 툴팁("상세 보기", "편집").
  - 카드 전체 클릭 → View; Edit는 분리된 버튼/메뉴.
  - 상태 표현: View는 읽기 전용 패널/Accordion, Edit는 폼 전환.

- View 섹션(Accordion)
  - 필수 필드 요약(이름/연락처/주요 메모)을 헤더에 배치, 클릭 시 상세 펼침.
  - 접근성: 키보드 토글, ARIA 속성(`aria-expanded`, `aria-controls`).

- Instrument 연결 정확도
  - API/쿼리: `instrument_id`로 필터된 join만 반환하도록 확인. N+1 방지로 includes/preload 사용.
  - 캐싱: useSWR/useQuery key를 clientId+filters로 구분.
  - UI: 빈 결과 시 명확한 empty state, 로딩/에러 상태 분리.

- Connected Clients 섹션
  - 중복이면 제거. 필요한 경우 아이템 상세 내부에 간단 테이블/배지로 표시.
  - 소트/필터 불필요하면 정적 리스트, 그렇지 않으면 pagination/sort 최소화.

- 캘린더 검색 확장
  - 인덱스: DB에 item name/serial/type/owner 컬럼 컴포지트 인덱스 고려.
  - API: `search` 파라미터로 다중 필드 LIKE/ILIKE OR 검색, 필요 시 trigram/tsvector로 확장.
  - UI: 단일 검색창 + 태그형 필터(타입/우선순위/상태/소유자). 디바운스(250~400ms) 적용.
  - 결과: 매칭 하이라이트, 정렬(일자 기본), 페이지네이션 또는 무한 스크롤.

