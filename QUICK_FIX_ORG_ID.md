# org_id 빠른 해결 가이드

현재 에러: `DEFAULT_ORG_ID environment variable is set but is not a valid UUID: "org-id-here"`

## 해결 방법 (2단계)

### 1단계: Organization 생성하고 UUID 얻기

터미널에서 실행:

```bash
npm run create:default-org
```

출력 예시:

```
✅ Organization 생성 완료!

📋 생성된 Organization 정보:
   Name: Default Organization
   ID: 550e8400-e29b-41d4-a716-446655440000
   Created: 2025-01-01T12:00:00Z

💡 다음 단계:
   1. .env.local 파일에 추가: DEFAULT_ORG_ID=550e8400-e29b-41d4-a716-446655440000
```

### 2단계: .env.local 파일 수정

1. 프로젝트 루트의 `.env.local` 파일 열기

2. 다음 줄을 찾아서:

```env
# ❌ 이렇게 되어 있으면 삭제하거나 주석 처리
DEFAULT_ORG_ID="org-id-here"
```

3. 위에서 생성한 실제 UUID로 교체:

```env
# ✅ 올바른 형식
DEFAULT_ORG_ID=550e8400-e29b-41d4-a716-446655440000
```

**중요:**

- 따옴표(`"`) 없이 UUID만 입력
- `550e8400-e29b-41d4-a716-446655440000` 부분을 위에서 생성한 실제 UUID로 교체

### 3단계: 서버 재시작

`.env.local`을 수정했으면 개발 서버를 재시작하세요:

1. 개발 서버 중지 (Ctrl+C)
2. 다시 시작: `npm run dev`

이제 invoice 생성이 작동할 것입니다!

---

## 대안: 사용자 metadata에 org_id 설정 (프로덕션 권장)

환경 변수 대신 사용자의 metadata에 org_id를 설정할 수도 있습니다:

1. Supabase 대시보드 접속: https://supabase.com/dashboard
2. Authentication > Users > 해당 사용자 선택
3. User Metadata 편집
4. 다음 JSON 추가:

```json
{
  "org_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

이 방법을 사용하면 `DEFAULT_ORG_ID` 환경 변수가 필요 없습니다.
