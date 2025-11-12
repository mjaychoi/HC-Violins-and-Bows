# 데이터베이스 마이그레이션 수정사항

## 🔍 발견된 문제점

실제 데이터베이스 스키마와 코드를 비교한 결과:

### 1. ⚠️ Status CHECK 제약조건 불일치 (필수 수정)

**문제:**
- DB: `status` CHECK 제약조건이 'Available', 'Booked', 'Sold'만 허용
- 코드: 'Reserved', 'Maintenance'도 사용

**영향:**
- 'Reserved' 또는 'Maintenance' 상태로 저장 시도 시 에러 발생
- 코드에서 사용하는 모든 status 값이 작동하지 않음

**해결:**
- `supabase/migrations/20241112141804_update_status_constraint.sql` 마이그레이션 실행

### 2. ✅ Updated_at 트리거 (선택적)

**상황:**
- DB에 `updated_at` 컬럼이 있음
- 코드에서 직접 사용하지 않지만, 자동 업데이트 트리거가 없을 수 있음

**해결:**
- `supabase/migrations/20241112141805_add_updated_at_trigger.sql` 마이그레이션 실행

### 3. ✅ TypeScript 타입 업데이트 (완료)

**수정:**
- `Instrument` 인터페이스에 `updated_at?: string` 추가

---

## 🚀 실행 방법

### 방법 1: Supabase 대시보드에서 실행 (권장)

1. **Supabase 대시보드 접속**
   - https://supabase.com/dashboard/project/dmilmlhquttcozxlpfxw

2. **SQL Editor 열기**
   - 왼쪽 메뉴에서 "SQL Editor" 클릭
   - "New query" 버튼 클릭

3. **마이그레이션 1: Status 제약조건 업데이트 (필수)**
   ```sql
   -- Drop the existing constraint
   ALTER TABLE public.instruments 
   DROP CONSTRAINT IF EXISTS instruments_status_check;

   -- Add new constraint with all status values
   ALTER TABLE public.instruments
   ADD CONSTRAINT instruments_status_check 
   CHECK (status::text = ANY (ARRAY[
     'Available'::text,
     'Booked'::text,
     'Sold'::text,
     'Reserved'::text,
     'Maintenance'::text
   ]));
   ```
   - Run 버튼 클릭

4. **마이그레이션 2: Updated_at 트리거 추가 (선택적)**
   ```sql
   -- Create or replace the update_updated_at_column function
   CREATE OR REPLACE FUNCTION public.update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = NOW();
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   -- Create trigger to automatically update updated_at
   DROP TRIGGER IF EXISTS update_instruments_updated_at ON public.instruments;

   CREATE TRIGGER update_instruments_updated_at
     BEFORE UPDATE ON public.instruments
     FOR EACH ROW
     EXECUTE FUNCTION public.update_updated_at_column();
   ```
   - Run 버튼 클릭

### 방법 2: 마이그레이션 파일 직접 실행

마이그레이션 파일을 Supabase 대시보드에서 실행:

1. `supabase/migrations/20241112141804_update_status_constraint.sql` - 필수
2. `supabase/migrations/20241112141805_add_updated_at_trigger.sql` - 선택적

---

## ✅ 확인 방법

마이그레이션이 성공했는지 확인:

```sql
-- 1. Status 제약조건 확인
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'instruments'::regclass
  AND conname = 'instruments_status_check';

-- 2. Updated_at 트리거 확인
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'instruments'
  AND trigger_name = 'update_instruments_updated_at';

-- 3. Status 값 테스트
UPDATE instruments 
SET status = 'Reserved' 
WHERE id = (SELECT id FROM instruments LIMIT 1);

-- 4. Updated_at 자동 업데이트 테스트
UPDATE instruments 
SET note = 'Test' 
WHERE id = (SELECT id FROM instruments LIMIT 1)
RETURNING updated_at;
```

---

## 📋 전체 마이그레이션 목록

1. ✅ `20241112141803_add_subtype_column.sql` - subtype 컬럼 추가
2. ⚠️ `20241112141804_update_status_constraint.sql` - status 제약조건 업데이트 (필수)
3. ✅ `20241112141805_add_updated_at_trigger.sql` - updated_at 트리거 추가 (선택적)
4. ✅ `20251109150920_maintenance_tasks.sql` - maintenance_tasks 테이블 생성

---

## 🎯 우선순위

1. **높음 (필수)**: Status 제약조건 업데이트
   - 'Reserved', 'Maintenance' 상태를 사용하지 않으면 문제없음
   - 하지만 코드에서 이미 사용 중이므로 반드시 수정 필요

2. **중간 (권장)**: Updated_at 트리거
   - 자동 업데이트 기능을 사용하려면 필요
   - 현재 코드에서 직접 사용하지 않으므로 선택적

3. **낮음 (완료)**: Subtype 컬럼
   - 이미 마이그레이션 파일 생성됨
   - 필요시 실행

---

## 📝 참고사항

- DB에 있지만 코드에서 사용하지 않는 필드:
  - `description` (text)
  - `image_url` (text) - instrument_images 테이블 사용
  - `condition` (character varying)
  - `notes` (text) - `note` 필드 사용

- 이 필드들은 DB에 있지만 코드에서 사용하지 않으므로 마이그레이션 불필요
- 나중에 사용하려면 코드 수정 필요

---

**중요**: Status 제약조건 업데이트는 필수입니다! 코드에서 'Reserved', 'Maintenance' 상태를 사용 중입니다.

