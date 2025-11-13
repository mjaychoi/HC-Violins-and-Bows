# 빠른 마이그레이션 가이드

## Supabase 대시보드에서 실행하기

### 1단계: SQL Editor 열기

- Supabase 대시보드 왼쪽 메뉴에서 **"SQL Editor"** 클릭
- **"New query"** 버튼 클릭

### 2단계: SQL 실행

아래 SQL을 복사해서 붙여넣기:

```sql
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS subtype TEXT;
```

### 3단계: 실행

- **"Run"** 버튼 클릭 (또는 `Ctrl+Enter` / `Cmd+Enter`)
- 성공 메시지가 나오면 완료!

### 4단계: 확인 (선택사항)

아래 SQL로 컬럼이 추가되었는지 확인:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'instruments'
AND column_name = 'subtype';
```

결과로 `subtype | text | YES`가 나오면 성공입니다.

## 완료 후

1. 브라우저를 새로고침하세요
2. Dashboard 페이지에서 인라인 편집을 다시 시도하세요
3. `subtype` 필드가 정상적으로 저장되는지 확인하세요

---

**참고**: `IF NOT EXISTS`를 사용했으므로 여러 번 실행해도 안전합니다.
