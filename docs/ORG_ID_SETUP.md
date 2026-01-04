# org_id 설정 가이드

Invoice 생성 및 조회를 위해서는 사용자 계정에 `org_id`가 설정되어 있어야 합니다.

## 문제 상황

Invoice를 생성하려고 하면 다음 에러가 발생할 수 있습니다:

```
Organization context missing. Cannot create invoice without organization context.
```

이는 사용자 계정에 `org_id`가 설정되어 있지 않아서 발생하는 문제입니다.

## 해결 방법

### 방법 1: Supabase 대시보드에서 사용자 metadata에 org_id 설정 (권장)

**멀티테넌시를 사용하는 프로덕션 환경에서는 이 방법을 권장합니다.**

1. Supabase 대시보드 접속
   - https://supabase.com/dashboard 접속
   - 프로젝트 선택

2. Authentication > Users 메뉴 접속
   - 왼쪽 사이드바에서 "Authentication" 클릭
   - "Users" 탭 클릭

3. 사용자 선택
   - `test@test.com` 또는 해당 사용자 찾기
   - 사용자 행을 클릭하여 상세 페이지 열기

4. User Metadata 수정
   - "Raw User Meta Data" 섹션 찾기
   - 편집 버튼 클릭
   - 다음 JSON 추가:

```json
{
  "org_id": "YOUR-ORG-UUID-HERE"
}
```

- 또는 기존 metadata가 있다면:

```json
{
  ...기존 metadata...,
  "org_id": "YOUR-ORG-UUID-HERE"
}
```

5. 저장

**org_id를 찾는 방법:**

- 기존 invoice가 있다면: `SELECT DISTINCT org_id FROM invoices WHERE org_id IS NOT NULL;`
- 새로 만들려면: UUID를 생성하여 사용 (예: `gen_random_uuid()`)

### 방법 2: 환경 변수로 기본 org_id 설정 (개발용)

**단일 사용자/단일 조직 시나리오나 개발 환경에서만 사용하세요.**

⚠️ **중요**: `DEFAULT_ORG_ID`는 반드시 유효한 UUID 형식이어야 합니다 (예: `550e8400-e29b-41d4-a716-446655440000`).

1. **Organization 생성하여 실제 UUID 얻기:**

```bash
npm run create:default-org
```

이 명령어는 "Default Organization"을 생성하고 생성된 UUID를 출력합니다.

2. **`.env.local` 파일에 추가:**

생성된 UUID를 복사하여 추가:

```env
DEFAULT_ORG_ID=550e8400-e29b-41d4-a716-446655440000
```

3. **서버 재시작**

**주의:**

- 프로덕션 멀티테넌시 환경에서는 이 방법을 사용하지 마세요
- 모든 사용자가 같은 org_id를 사용하게 되어 데이터 격리가 깨집니다
- UUID 형식이 아니면 에러가 발생합니다 (예: `"org-id-here"` 같은 플레이스홀더는 작동하지 않음)

### 방법 3: 기존 invoice의 org_id 확인 및 사용

이미 invoice가 있다면, 기존 invoice의 org_id를 확인하여 사용할 수 있습니다:

```sql
-- 가장 많이 사용된 org_id 확인
SELECT
  org_id,
  COUNT(*) as count
FROM invoices
WHERE org_id IS NOT NULL
GROUP BY org_id
ORDER BY count DESC
LIMIT 1;
```

이 org_id를 사용자의 metadata에 설정하거나 DEFAULT_ORG_ID 환경 변수로 사용하세요.

## 확인 방법

설정이 완료된 후:

1. **Invoice 생성 테스트**
   - Invoice 페이지에서 "Add Invoice" 버튼 클릭
   - 에러 없이 생성되는지 확인

2. **서버 로그 확인**
   - 개발 서버 콘솔에서 다음 로그 확인:
     - `invoices.get.scoped: Filtering invoices by org_id=...` (정상)
     - `invoices.post.using_fallback_org_id: Using DEFAULT_ORG_ID fallback: ...` (fallback 사용 중)

3. **Invoice 목록 확인**
   - Invoice 페이지에서 생성한 invoice가 보이는지 확인

## 문제 해결

### 에러: "Organization context missing"

**원인:**

- 사용자 계정에 org_id가 설정되지 않음
- DEFAULT_ORG_ID 환경 변수도 설정되지 않음

**해결:**

- 방법 1 또는 방법 2 중 하나를 선택하여 설정

### Invoice가 생성되었지만 목록에 안 보임

**원인:**

- GET 요청에서 org_id로 필터링하는데, 생성된 invoice의 org_id와 사용자의 org_id가 다름

**해결:**

1. 사용자의 org_id 확인: Supabase 대시보드 > Authentication > Users > 해당 사용자
2. Invoice의 org_id 확인: `SELECT id, invoice_number, org_id FROM invoices WHERE invoice_number = '...';`
3. 일치하도록 수정

### 여러 조직이 섞여 있음

**원인:**

- DEFAULT_ORG_ID를 사용했는데, 실제로는 여러 조직이 있음

**해결:**

- DEFAULT_ORG_ID 제거하고, 각 사용자의 metadata에 올바른 org_id 설정 (방법 1)

## 참고

- `getOrgScopeFromUser()` 함수는 다음 위치에서 org_id를 찾습니다:
  - `user.org_id`
  - `user.organization_id`
  - `user.orgId`
  - `user.organizationId`
  - `user.user_metadata.org_id`
  - `user.user_metadata.organization_id`
  - `user.app_metadata.org_id`
  - `user.app_metadata.organization_id`

- 가장 권장되는 위치는 `user.user_metadata.org_id`입니다.
