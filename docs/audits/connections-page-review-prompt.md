# Connections 페이지 실사용자 영향 감사 프롬프트

> 이 문서는 그 자체로 완결된 프롬프트입니다. `/code-review`, 서브에이전트, 또는 다른 AI 리뷰 툴에
> 이 파일 전체(또는 아래 "프롬프트 본문" 섹션)를 그대로 붙여넣어 사용하세요.

## 사용 방법

- 일반 코드 리뷰(스타일, 네이밍, 리팩터링)가 아니라 **실사용자가 실제로 겪을 수 있는 문제**를 찾는 데 특화된 프롬프트입니다.
- 브랜치/커밋 단위가 아니라 **기능(Connections 페이지) 전체**를 대상으로 합니다. 최신 변경분만 보지 말고 아래 "감사 대상 파일" 전체를 읽고 감사하세요.
- 이 코드베이스는 이미 상당히 성숙합니다(idempotency, optimistic update, org 스코프 RLS 등). "에러 핸들링이 없다" 류의 일반론적 지적은 노이즈이니, 아래 "이미 처리된 것으로 간주할 설계"에 없는 **새로운 gap**에 집중하세요.

---

## 프롬프트 본문

너는 프로덕션 SaaS 애플리케이션의 특정 기능 하나를 실사용자 관점에서 감사하는 시니어 엔지니어다. 감사 대상은 HC Violins and Bows(바이올린/활 딜러용 CRM)의 **"Connected Clients" 페이지** — 고객(client)과 악기(instrument) 사이의 관계(Interested/Booked/Owned/Sold)를 생성·수정·삭제·재분류·재정렬하는 기능이다.

### 목표

이론적인 코드 스멜이 아니라, **실제 사용자가 이 화면을 쓰다가 마주칠 수 있는 구체적인 실패 시나리오**만 보고하라. 각 항목은 "누가, 무엇을 했을 때, 무슨 일이 일어나는가"로 재현 가능해야 한다. 재현 시나리오를 한 문장으로 못 쓰겠으면 보고하지 마라.

### 감사 대상 파일

- `src/app/connections/page.tsx` (메인 페이지, 상태 관리, DnD, URL 동기화)
- `src/app/connections/components/*` (ConnectionModal, EditConnectionModal, ConnectionCard, SortableConnectionCard, ConnectionsList, ConnectionSearch, FilterBar, RelationshipSectionHeader)
- `src/app/connections/hooks/*` (useConnectionFilters, useConnectionEdit, useConnectionForm)
- `src/app/connections/utils/*` (connectionGrouping, connectionUtils, relationshipStyles)
- `src/contexts/ConnectionsContext.tsx` (유일한 데이터 소스 — fetch/create/update/delete/reducer)
- `src/hooks/useUnifiedData.ts`의 `useConnectedClientsData` (ConnectionsContext를 감싸는 selector)
- `src/app/api/connections/route.ts` (GET/POST/PATCH/DELETE/PUT)
- `supabase/migrations/`의 `create_connection_atomic` / `update_connection_atomic` / `delete_connection_atomic` / `reorder_connections_atomic` 최신 버전과, `client_instruments` 테이블의 RLS 정책 정의(마이그레이션에서 검색)

### 이미 처리된 것으로 간주할 설계 (오탐 방지 — 아래는 버그로 보고하지 말 것)

- 생성(POST)에는 idempotency key가 적용되어 있고, 중복 클릭에 대한 replay/conflict 처리가 있음.
- 초기 로딩과 백그라운드 리페치는 구분되어 있음 — 리페치 실패 시 기존 행을 지우지 않고 재시도 배너만 보여줌(stale-while-revalidate).
- org/tenant 전환 시 `ConnectionsContext`가 상태를 리셋하고, 진행 중이던 "connection 생성" 폼도 초기화됨.
- Sold 상태의 connection은 생성 API에서 직접 생성 불가, 삭제 API/RPC에서 삭제 불가(판매/환불 워크플로우로만 처리) — 이건 의도된 비즈니스 규칙이다.
- `client_id`/`instrument_id`는 PATCH에서 재할당이 명시적으로 거부됨(400) — 의도된 설계.
- 클라이언트의 `canCreateConnection`/`canManageConnections` 권한 체크는 UI용이며, 서버(`requireAdmin`)와 별개로 존재하는 것이 정상이다. "클라이언트 체크만으로는 안전하지 않다"는 지적 자체는 하지 마라 — 서버 측 대응 체크가 실제로 있는지 없는지만 확인하라.

### 중점적으로 확인할 지점 (알려진 의심 구간 — 반드시 검증)

1. **DB 레벨 권한 gap**: `create_connection_atomic`은 함수 내부에서 `is_admin()`을 직접 호출해 admin 여부를 검증한다. 반면 `update_connection_atomic`, `delete_connection_atomic`은 org 스코프(`org_id()`)만 확인하고 함수 내부에 admin 체크가 없는 것으로 보인다. `client_instruments` 테이블의 RLS 정책(UPDATE/DELETE)이 이를 별도로 막고 있는지 확인하라. 막고 있지 않다면: Next.js API 레이어의 `requireAdmin`을 우회해 RPC를 직접 호출할 수 있는 경로(예: 다른 API 라우트, 클라이언트에서 직접 Supabase RPC 호출 가능 여부)가 있는지, 있다면 admin이 아닌 동일 org 사용자가 connection을 수정/삭제할 수 있는지 판단하라.
2. **관계 중복 생성**: `Owned`는 `client_instruments_single_owner_per_instrument` 유니크 제약으로 중복이 막히는 것으로 보인다. `Interested`/`Booked`에는 클라이언트 측에도, DB 측에도 동일 client+instrument 조합의 중복 방지가 없는 것으로 보인다. 사용자가 같은 고객-악기 쌍에 대해 실수로(더블클릭이 아니라, 모달을 두 번 열어서) 동일 관계를 여러 번 만들 수 있는지, 만들어지면 UI(리스트, 카운트, 검색)에서 어떻게 보이는지 확인하라.
3. **드래그로 관계 타입 변경 시 이중 갱신**: `page.tsx`의 `handleConnectionTypeChange`는 `updateConnection`(낙관적 업데이트 포함) 직후 `fetchConnections({ all: true, force: true })`를 호출한다. 느린 네트워크에서 드래그를 연속으로 여러 번 하거나, 강제 리페치가 끝나기 전에 또 드래그하면 카드가 순간적으로 옛 위치로 되돌아가거나 깜빡이는지, 혹은 두 요청의 응답 순서가 뒤바뀌어(리페치가 먼저 끝나고 이전 update 응답이 나중에 도착) 화면이 실제 서버 상태와 어긋나는지 확인하라.
4. **URL 상태 동기화 레이스**: `page.tsx`는 search/filter/page를 URL과 로컬 state 양방향으로 동기화하는 여러 `useEffect`를 갖고 있다. 브라우저 뒤로가기/앞으로가기를 빠르게 연타하거나, 필터가 적용된 상태에서 페이지 파라미터가 있는 URL을 북마크해 직접 열거나, 잘못된 필터 값이 담긴 URL을 열었을 때 실제로 의도대로 정리(리셋)되는지, 아니면 무한 루프나 눈에 보이는 깜빡임이 생기는지 확인하라.
5. **truncated(1000건 초과) 상태의 사용자 인지**: 조직의 connection이 1000건을 넘으면 목록이 잘리고 배너가 뜨는데, 이 상태에서 검색해서 원하는 결과가 안 나왔을 때 사용자가 "필터에 안 걸려서"가 아니라 "애초에 안 불러와져서"라는 걸 알 수 있는 문구/UX인지 확인하라. 또한 필터 탭의 카운트(`relationshipTypeCounts`)도 truncated된 데이터 기준으로 계산되는지, 그렇다면 카운트 자체가 실제보다 적게 보일 수 있는지 확인하라.
6. **모달 검증 공백**: `ConnectionModal`/`EditConnectionModal`이 필수 필드 외에 하지 않는 검증(예: notes 길이 제한, relationship type이 실제 허용된 값인지 등)이 API/DB 검증과 어긋나서, 사용자가 폼을 제출한 후에야(모달 안에서 인라인 에러가 아니라 토스트로만) 실패를 알게 되는 케이스가 있는지 확인하라.
7. **동시 편집**: 두 명의 admin이 같은 connection을 거의 동시에 수정(예: 한 명은 relationship_type 변경, 다른 한 명은 notes 변경)하면 마지막 쓰기가 이긴다(last-write-wins)는 것을 사용자가 알 방법이 있는지, 혹은 조용히 상대방의 변경을 덮어써서 데이터 손실처럼 느껴질 수 있는지 확인하라(낙관적 락/버전 체크 없음 여부 확인).

### 카테고리별 체크리스트

**A. 기능/UX 버그**

- 로딩/에러/빈 상태/검색결과 없음 4가지 상태 전환이 실제로 서로 배타적으로 렌더링되는지 (동시에 두 상태가 겹쳐 보이는 경우는 없는지)
- 페이지네이션 클램프(`totalPages` 변경 시 `currentPage` 보정)가 검색/필터와 함께 걸었을 때도 깨지지 않는지
- 성공 토스트의 링크(`/dashboard?instrumentId=`, `/clients?clientId=`)가 실제 존재하는 라우트/쿼리 파라미터와 일치하는지
- 모달 닫을 때 폼 리셋이 항상 일어나는지(특히 실패 후 재시도 흐름에서 이전 입력이 남아있어야 하는지 vs 사라져야 하는지 일관성)

**B. 권한/보안**

- API의 모든 mutation 경로가 `requireOrgContext` + `requireAdmin`을 실제로 통과하는지(라우트 코드 기준, 추측 금지)
- 위 "중점 확인 지점 1"의 DB 레벨 gap
- `client_id`/`instrument_id`로 넘어오는 값이 요청자의 org에 속하는지 API/DB 양쪽에서 실제로 검증되는지(크로스 org 데이터 연결 시도)

**C. 동시성/데이터 정합성**

- 위 "중점 확인 지점" 2, 3, 7
- `reorder_connections_atomic`(PUT)이 여러 명이 동시에 순서를 바꿀 때 일부만 반영되고 나머지는 유실되는 경우가 있는지
- optimistic add/update/remove 이후 실제 서버 응답과 로컬 state가 어긋났을 때 복구 메커니즘이 있는지(강제 리페치 외에)

### 출력 형식

각 발견 사항을 아래 표 형식으로 보고하라. 표에 못 넣을 만큼 확신이 낮은 항목("~일 수도 있음" 수준)은 별도 "확인 필요" 섹션에 질문 형태로 분리하라.

| 심각도          | 파일:라인   | 문제    | 재현 시나리오       | 실사용자 영향             |
| --------------- | ----------- | ------- | ------------------- | ------------------------- |
| High/Medium/Low | `path:line` | 한 문장 | 누가 무엇을 했을 때 | 사용자가 실제로 겪는 결과 |
