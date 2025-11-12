# 데이터베이스 마이그레이션 가이드

## 📋 목차

1. [빠른 시작](#빠른-시작)
2. [필수 마이그레이션](#필수-마이그레이션)
3. [스키마 확인](#스키마-확인)
4. [문제 해결](#문제-해결)

## 🚀 빠른 시작

### 1. 데이터베이스 비밀번호 설정

`.env.local` 파일에 `DATABASE_PASSWORD` 추가:

```env
DATABASE_PASSWORD=your_database_password
```

**비밀번호 확인 방법:**
- Supabase Dashboard → Settings → Database
- "Database password" 섹션에서 확인

### 2. 스키마 확인

```bash
npm run schema:check
```

### 3. 마이그레이션 실행

Supabase 대시보드에서 SQL Editor를 통해 실행하거나:

```bash
npm run migrate:subtype
```

## 📝 필수 마이그레이션

### 1. subtype 컬럼 추가 (필수)

**파일**: `supabase/migrations/20241112141803_add_subtype_column.sql`

**SQL:**
```sql
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS subtype TEXT;
```

### 2. status 제약조건 업데이트 (필수)

**파일**: `supabase/migrations/20241112141804_update_status_constraint.sql`

**SQL:**
```sql
ALTER TABLE public.instruments 
DROP CONSTRAINT IF EXISTS instruments_status_check;

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

### 3. updated_at 트리거 추가 (선택적)

**파일**: `supabase/migrations/20241112141805_add_updated_at_trigger.sql`

### 4. maintenance_tasks 테이블 생성 (선택적)

**파일**: `supabase/migrations/20251109150920_maintenance_tasks.sql`

## 🔍 스키마 확인

### 스키마 확인 스크립트

```bash
npm run schema:check
```

이 스크립트는 다음을 확인합니다:
- 테이블 목록
- 컬럼 정보
- 제약조건
- 주요 테이블 상태

### 확인 항목

- ✅ `instruments` 테이블에 `subtype` 컬럼 존재 여부
- ✅ `instruments` 테이블에 `updated_at` 컬럼 존재 여부
- ✅ `status` 제약조건에 'Reserved', 'Maintenance' 포함 여부
- ✅ `maintenance_tasks` 테이블 존재 여부

## 🆘 문제 해결

### 데이터베이스 비밀번호 확인

1. Supabase Dashboard → Settings → Database
2. "Database password" 섹션에서 확인
3. `.env.local` 파일에 `DATABASE_PASSWORD` 추가

### 마이그레이션 실행 방법

**방법 1: Supabase 대시보드 (권장)**
1. Supabase Dashboard → SQL Editor
2. 마이그레이션 파일 내용 복사
3. SQL Editor에 붙여넣기
4. Run 버튼 클릭

**방법 2: npm 스크립트**
```bash
npm run migrate:subtype
```

**방법 3: Supabase CLI**
```bash
supabase db push
```

## 📚 관련 문서

- [마이그레이션 파일](./migrations/) - 모든 마이그레이션 SQL 파일
- [스키마 확인 스크립트](../../scripts/check-schema.ts) - 스키마 확인 스크립트
- [마이그레이션 스크립트](../../scripts/migrate-subtype.ts) - 자동 마이그레이션 스크립트

## ✅ 마이그레이션 체크리스트

- [ ] subtype 컬럼 추가
- [ ] status 제약조건 업데이트
- [ ] updated_at 트리거 추가 (선택적)
- [ ] maintenance_tasks 테이블 생성 (선택적)
- [ ] 스키마 확인 완료

## 📝 참고사항

- `IF NOT EXISTS`를 사용했으므로 여러 번 실행해도 안전합니다
- 기존 데이터는 영향을 받지 않습니다
- 마이그레이션 후 애플리케이션을 새로고침하세요

---

**마지막 업데이트**: 2024-11-12

