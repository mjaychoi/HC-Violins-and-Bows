# 데이터베이스 마이그레이션 체크리스트

## ✅ 필요한 마이그레이션 (총 2개)

### 1. subtype 컬럼 추가 ⭐ (필수)

**파일**: `supabase/migrations/20241112141803_add_subtype_column.sql`

**실행 방법**:

```sql
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS subtype TEXT;
```

**확인 방법**:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'instruments' AND column_name = 'subtype';
```

**상태**: ❓ 실행 필요

---

### 2. maintenance_tasks 테이블 생성 (캘린더 기능용)

**파일**: `supabase/migrations/20251109150920_maintenance_tasks.sql`

**실행 방법**: Supabase 대시보드에서 파일 내용 복사해서 실행

**확인 방법**:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'maintenance_tasks';
```

**상태**: ❓ 실행 필요

---

## ✅ 이미 존재하는 테이블 (확인 완료)

다음 테이블들은 사용자가 제공한 스키마에 이미 존재합니다:

- ✅ `instruments` 테이블
- ✅ `clients` 테이블 (tags, interest 컬럼 포함)
- ✅ `client_instruments` 테이블
- ✅ `instrument_images` 테이블
- ✅ `sales_history` 테이블

---

## 🚀 빠른 실행 가이드

### 방법 1: Supabase 대시보드에서 실행 (가장 쉬움)

1. **Supabase 대시보드 접속**
   - https://supabase.com/dashboard/project/dmilmlhquttcozxlpfxw

2. **SQL Editor 열기**
   - 왼쪽 메뉴에서 "SQL Editor" 클릭
   - "New query" 버튼 클릭

3. **마이그레이션 1: subtype 컬럼 추가**

   ```sql
   ALTER TABLE instruments ADD COLUMN IF NOT EXISTS subtype TEXT;
   ```

   - Run 버튼 클릭

4. **마이그레이션 2: maintenance_tasks 테이블 생성**
   - `supabase/migrations/20251109150920_maintenance_tasks.sql` 파일 내용 복사
   - 붙여넣기 후 Run 버튼 클릭

### 방법 2: npm 스크립트 사용 (자동 실행)

```bash
# subtype 컬럼 추가
npm run migrate:subtype
```

**필수 조건**: `.env.local`에 `DATABASE_PASSWORD` 설정 필요

---

## 📋 실행 후 확인 사항

모든 마이그레이션이 성공했는지 확인:

```sql
-- 1. subtype 컬럼 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'instruments' AND column_name = 'subtype';

-- 2. maintenance_tasks 테이블 확인
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'maintenance_tasks';

-- 3. maintenance_tasks 테이블 구조 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'maintenance_tasks'
ORDER BY ordinal_position;
```

---

## ✅ 완료 후

1. 브라우저를 새로고침하세요
2. Dashboard 페이지에서 subtype 필드가 정상 작동하는지 확인
3. Calendar 페이지에서 maintenance_tasks가 정상 작동하는지 확인

---

## 📝 참고사항

- `IF NOT EXISTS`를 사용했으므로 여러 번 실행해도 안전합니다
- 기존 데이터는 영향을 받지 않습니다
- 마이그레이션 파일은 `supabase/migrations/` 폴더에 있습니다

---

**총 필요한 마이그레이션: 2개**

- ✅ subtype 컬럼 추가 (필수)
- ✅ maintenance_tasks 테이블 생성 (캘린더 기능용)
