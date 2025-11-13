# 안전한 마이그레이션 가이드

## ⚠️ Destructive Operation 경고에 대해

Supabase 대시보드에서 `DROP CONSTRAINT` 명령어를 실행하면 "destructive operation" 경고가 나타날 수 있습니다.

**이것은 정상적인 경고입니다!** 다음과 같은 이유로 안전합니다:

### ✅ 안전한 이유

1. **데이터 손실 없음**: `DROP CONSTRAINT`는 데이터를 삭제하지 않습니다
2. **제약조건만 교체**: 기존 제약조건을 제거하고 새로운 것으로 교체합니다
3. **즉시 재생성**: 새로운 제약조건이 바로 추가됩니다
4. **롤백 가능**: 문제가 발생하면 원래 제약조건으로 복원할 수 있습니다

### 📋 마이그레이션 내용

**기존 제약조건:**

- 'Available', 'Booked', 'Sold'만 허용

**새로운 제약조건:**

- 'Available', 'Booked', 'Sold', 'Reserved', 'Maintenance' 허용

### 🔄 실행 과정

1. 기존 제약조건 제거 (`DROP CONSTRAINT`)
2. 새로운 제약조건 추가 (`ADD CONSTRAINT`)
3. 데이터는 그대로 유지됨

---

## 🚀 실행 방법

### 방법 1: 안전한 버전 사용 (권장)

더 안전한 버전의 마이그레이션 파일을 사용하세요:

**파일**: `supabase/migrations/20241112141804_update_status_constraint_safe.sql`

이 버전은:

- 제약조건이 존재하는지 확인 후 제거
- 더 명확한 오류 메시지 제공
- 실행 후 검증 메시지 표시

### 방법 2: 원본 버전 사용 (간단)

원본 마이그레이션 파일을 사용해도 안전합니다:

**파일**: `supabase/migrations/20241112141804_update_status_constraint.sql`

---

## ✅ 실행 전 확인사항

1. **백업 확인**: Supabase는 자동 백업을 제공하므로 걱정하지 마세요
2. **제약조건 확인**: 기존 제약조건이 있는지 확인
3. **데이터 확인**: 기존 데이터에 문제가 없는지 확인

### 확인 쿼리

```sql
-- 1. 현재 제약조건 확인
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'instruments'::regclass
  AND conname LIKE '%status%';

-- 2. 현재 status 값 확인
SELECT DISTINCT status, COUNT(*)
FROM instruments
GROUP BY status;

-- 3. Reserved 또는 Maintenance 상태가 있는지 확인
SELECT COUNT(*)
FROM instruments
WHERE status IN ('Reserved', 'Maintenance');
```

---

## 🎯 실행 후 확인

마이그레이션 실행 후 다음을 확인하세요:

```sql
-- 1. 새로운 제약조건 확인
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'instruments'::regclass
  AND conname = 'instruments_status_check';

-- 2. Reserved 상태 테스트 (에러가 나지 않아야 함)
UPDATE instruments
SET status = 'Reserved'
WHERE id = (SELECT id FROM instruments LIMIT 1)
RETURNING id, status;

-- 3. Maintenance 상태 테스트 (에러가 나지 않아야 함)
UPDATE instruments
SET status = 'Maintenance'
WHERE id = (SELECT id FROM instruments LIMIT 1)
RETURNING id, status;
```

---

## 🔄 문제 발생 시 롤백

만약 문제가 발생하면 원래 제약조건으로 복원할 수 있습니다:

```sql
-- 1. 새로운 제약조건 제거
ALTER TABLE public.instruments
DROP CONSTRAINT IF EXISTS instruments_status_check;

-- 2. 원래 제약조건 복원
ALTER TABLE public.instruments
ADD CONSTRAINT instruments_status_check
CHECK (status::text = ANY (ARRAY[
  'Available'::text,
  'Booked'::text,
  'Sold'::text
]));
```

---

## 📝 요약

1. **Destructive Operation 경고는 정상입니다**
2. **데이터 손실 없음**: 제약조건만 교체됩니다
3. **안전한 작업**: 즉시 새로운 제약조건이 추가됩니다
4. **롤백 가능**: 문제 발생 시 원래 상태로 복원 가능

**결론**: 경고를 확인하고 실행해도 안전합니다! 🎉

---

## 🆘 도움이 필요한 경우

문제가 발생하면:

1. Supabase 대시보드의 "Database" > "Backups"에서 백업 확인
2. 롤백 쿼리 실행
3. 문제 상황을 문서화하여 지원팀에 문의
