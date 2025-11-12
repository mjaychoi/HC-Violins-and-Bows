# 데이터베이스 마이그레이션 가이드

이 문서는 Supabase 데이터베이스 마이그레이션을 실행하는 방법을 안내합니다.

## 📋 목차

1. [빠른 시작](#빠른-시작)
2. [마이그레이션 파일 목록](#마이그레이션-파일-목록)
3. [실행 방법](#실행-방법)
4. [문제 해결](#문제-해결)
5. [마이그레이션 확인](#마이그레이션-확인)

---

## 🚀 빠른 시작

### 가장 빠른 방법: Supabase 대시보드에서 수동 실행

1. **대시보드 접속**
   - https://supabase.com/dashboard 접속
   - 프로젝트 선택

2. **SQL Editor 열기**
   - 왼쪽 메뉴에서 "SQL Editor" 클릭
   - "New query" 버튼 클릭

3. **마이그레이션 파일 실행**
   - 마이그레이션 파일 열기 (예: `migration-maintenance-tasks.sql`)
   - 전체 내용 복사
   - SQL Editor에 붙여넣기
   - "Run" 버튼 클릭 (또는 `Ctrl+Enter` / `Cmd+Enter`)

4. **완료 확인**
   - Table Editor에서 테이블 생성 확인
   - 또는 SQL Editor에서 `SELECT * FROM 테이블명 LIMIT 1;` 실행

---

## 📁 마이그레이션 파일 목록

### 필수 마이그레이션 (순서대로 실행)

1. **`database-schema.sql`** (기본 스키마)
   - 모든 테이블 생성
   - RLS 정책 설정
   - 인덱스 생성

2. **`migration-add-subtype.sql`** (subtype 컬럼 추가)
   - `instruments` 테이블에 `subtype` 컬럼 추가

3. **`migration-maintenance-tasks.sql`** (캘린더 기능)
   - `maintenance_tasks` 테이블 생성
   - 캘린더 기능용 인덱스 및 RLS 정책

### 선택적 마이그레이션

4. **`migration-tagging-system.sql`** (태깅 시스템)
   - 태그 관련 테이블 (필요시)

---

## 🔧 실행 방법

### 방법 1: Supabase 대시보드 (권장, 가장 쉬움)

**장점:**
- 추가 설정 불필요
- 즉시 실행 가능
- 1분 이내 완료

**단계:**
1. Supabase 대시보드 접속
2. SQL Editor 열기
3. 마이그레이션 파일 내용 복사/붙여넣기
4. 실행

### 방법 2: Supabase CLI (자동화 가능)

**장점:**
- 자동화 가능
- 버전 관리 용이
- CI/CD 통합 가능

**전제 조건:**
- Supabase CLI 설치: `npm install -g supabase`
- Supabase 계정 로그인: `supabase login`

**단계:**
```bash
# 1. 프로젝트 연결
supabase link --project-ref YOUR_PROJECT_REF

# 2. 마이그레이션 파일을 supabase/migrations 디렉토리에 복사
mkdir -p supabase/migrations
cp migration-maintenance-tasks.sql supabase/migrations/$(date +%Y%m%d%H%M%S)_maintenance_tasks.sql

# 3. 마이그레이션 적용
supabase db push
```

### 방법 3: psql 직접 연결 (고급)

**전제 조건:**
- `psql` 설치
- 데이터베이스 비밀번호 필요

**단계:**
```bash
# 환경 변수 설정
export DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"

# 마이그레이션 실행
psql $DATABASE_URL -f migration-maintenance-tasks.sql
```

**또는 스크립트 사용:**
```bash
# Unix/MacOS
DATABASE_URL="<prod_db_url>" bash scripts/supabase/apply-migrations.sh

# 주의: psql 설치 필요, 실패 시 즉시 중단(ON_ERROR_STOP=1)
```

---

## ⚠️ 제한사항

### Service Role Key만으로는 SQL 실행 불가

**이유:**
1. Supabase REST API는 DDL(SQL 실행)을 지원하지 않습니다
2. PostgreSQL 직접 연결에는 데이터베이스 비밀번호가 필요합니다
3. Service Role Key는 데이터 접근 권한이지, SQL 실행 권한이 아닙니다

**해결 방법:**
- 방법 1 (대시보드) 사용 권장
- 또는 데이터베이스 비밀번호를 사용하여 psql로 직접 연결

---

## 🔍 마이그레이션 확인

### 테이블 존재 확인

```sql
-- SQL Editor에서 실행
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'maintenance_tasks'
);
```

### 테이블 구조 확인

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'maintenance_tasks'
ORDER BY ordinal_position;
```

### RLS 정책 확인

```sql
SELECT * FROM pg_policies 
WHERE tablename = 'maintenance_tasks';
```

### 데이터 확인

```sql
-- 테이블이 정상적으로 생성되었는지 확인
SELECT * FROM maintenance_tasks LIMIT 1;
```

결과가 나오면 (비어있어도 됨) 테이블이 정상적으로 생성된 것입니다.

---

## 🆘 문제 해결

### 에러: "relation already exists"

**원인:** 테이블이 이미 존재함

**해결:**
- 마이그레이션 파일의 `CREATE TABLE IF NOT EXISTS` 사용 (이미 적용됨)
- 또는 기존 테이블 삭제 후 재실행 (주의: 데이터 손실 가능)

### 에러: "permission denied"

**원인:** RLS 정책이 제대로 설정되지 않음

**해결:**
1. 마이그레이션 파일의 RLS 정책 부분 재실행
2. Supabase Dashboard > Authentication > Policies에서 수동 확인

### 에러: "foreign key constraint"

**원인:** 참조하는 테이블이 없음

**해결:**
1. 먼저 `database-schema.sql` 실행 확인
2. `instruments` 테이블이 존재하는지 확인

### 에러: "column already exists"

**원인:** 컬럼이 이미 추가됨

**해결:**
- 마이그레이션 파일의 `ADD COLUMN IF NOT EXISTS` 사용 (이미 적용됨)
- 또는 무시해도 됨

---

## 📝 마이그레이션 파일 위치

```
/Users/soyeonhong/HC-Violins-and-Bows/
├── database-schema.sql              # 기본 스키마
├── migration-add-subtype.sql        # subtype 컬럼 추가
├── migration-maintenance-tasks.sql  # 캘린더 기능
└── migration-tagging-system.sql     # 태깅 시스템 (선택)
```

---

## 🎯 다음 단계

마이그레이션이 완료되면:

1. 애플리케이션 재시작 (필요시)
2. 관련 기능 테스트
   - 캘린더 기능: `/calendar` 페이지 접근
   - Instruments: subtype 필드 확인
3. 데이터 확인

---

## 📚 관련 문서

- [프로덕션 배포 가이드](./DEPLOYMENT.md)
- [캘린더 설정 가이드](./CALENDAR_SETUP_GUIDE.md)
- [캘린더 문제 해결](./TROUBLESHOOTING_CALENDAR.md)

---

## ✅ 체크리스트

마이그레이션 실행 전:
- [ ] 데이터베이스 백업 완료
- [ ] 마이그레이션 파일 내용 확인
- [ ] 실행 순서 확인

마이그레이션 실행 후:
- [ ] 테이블 생성 확인
- [ ] RLS 정책 확인
- [ ] 인덱스 생성 확인
- [ ] 애플리케이션 테스트

---

**마이그레이션 완료! 🎉**

