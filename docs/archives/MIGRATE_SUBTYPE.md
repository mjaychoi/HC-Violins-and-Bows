# subtype 컬럼 마이그레이션 가이드

## 🎯 목표
`instruments` 테이블에 `subtype` 컬럼을 추가합니다.

## 🚀 실행 방법 (3가지)

### 방법 1: npm 스크립트 실행 (가장 쉬움) ⭐

```bash
npm run migrate:subtype
```

**필수 조건:**
- `.env.local` 파일에 `DATABASE_PASSWORD` 설정 필요
- Supabase Dashboard > Settings > Database에서 비밀번호 확인

### 방법 2: Supabase 대시보드에서 실행 (가장 빠름)

1. **Supabase 대시보드 접속**
   - https://supabase.com/dashboard/project/dmilmlhquttcozxlpfxw 접속

2. **SQL Editor 열기**
   - 왼쪽 메뉴에서 "SQL Editor" 클릭
   - "New query" 버튼 클릭

3. **SQL 실행**
   ```sql
   ALTER TABLE instruments ADD COLUMN IF NOT EXISTS subtype TEXT;
   ```

4. **Run 버튼 클릭** (또는 `Ctrl+Enter` / `Cmd+Enter`)

### 방법 3: Supabase CLI 사용

```bash
# Supabase CLI 설치 (없는 경우)
brew install supabase/tap/supabase
# 또는
npm install -g supabase

# 로그인
supabase login

# 프로젝트 링크
supabase link --project-ref dmilmlhquttcozxlpfxw

# 마이그레이션 실행
supabase db push
```

## ✅ 확인 방법

마이그레이션이 성공했는지 확인:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'instruments'
AND column_name = 'subtype';
```

결과로 `subtype | text | YES`가 나오면 성공!

## 📝 마이그레이션 파일

- **위치**: `supabase/migrations/20241112141803_add_subtype_column.sql`
- **내용**: `subtype` 컬럼 추가 및 인덱스 생성

## 🎉 완료 후

1. 브라우저를 새로고침하세요
2. Dashboard 페이지에서 인라인 편집을 다시 시도하세요
3. `subtype` 필드가 정상적으로 저장되는지 확인하세요

---

**참고**: `IF NOT EXISTS`를 사용했으므로 여러 번 실행해도 안전합니다.

