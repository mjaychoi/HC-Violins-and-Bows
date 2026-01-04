# Supabase 웹사이트에서 수동 마이그레이션 가이드

이 가이드는 Supabase 대시보드의 SQL Editor를 사용하여 마이그레이션을 수동으로 실행하는 방법을 설명합니다.

## 📋 준비사항

1. Supabase 계정 로그인
2. 프로젝트 접근 권한
3. 마이그레이션 SQL 파일

---

## 🚀 단계별 실행 방법

### 1단계: Supabase 대시보드 접속

1. **Supabase 웹사이트 접속**
   - https://supabase.com/dashboard 접속
   - 로그인 (필요한 경우)

2. **프로젝트 선택**
   - 프로젝트 목록에서 해당 프로젝트 선택
   - 프로젝트 ID: `dmilmlhquttcozxlpfxw`

### 2단계: SQL Editor 열기

1. **왼쪽 사이드바**에서 **SQL Editor** 아이콘 클릭
   - 또는 직접 링크: https://supabase.com/dashboard/project/dmilmlhquttcozxlpfxw/sql/new

2. **New query** 버튼 클릭 (새 쿼리 창 열기)

### 3단계: SQL 파일 복사

**옵션 1: 통합 파일 사용 (권장)**

- 파일 위치: `supabase/migrations/maintenance_tasks_complete.sql`
- 이 파일은 모든 maintenance_tasks 관련 마이그레이션을 포함합니다
- 파일 내용 전체를 복사 (Cmd+A → Cmd+C / Ctrl+A → Ctrl+C)

**옵션 2: 개별 파일 사용**

- `supabase/migrations/20251109150920_maintenance_tasks.sql` 복사
- 실행 후
- `supabase/migrations/20250101000000_add_client_id_to_maintenance_tasks.sql` 복사
- 순서대로 실행

### 4단계: SQL Editor에 붙여넣기

1. SQL Editor의 텍스트 영역에 **붙여넣기** (Cmd+V / Ctrl+V)
2. SQL 문이 올바르게 표시되는지 확인

### 5단계: 실행

1. **Run 버튼** 클릭
   - 또는 단축키: **Cmd+Enter** (Mac) / **Ctrl+Enter** (Windows/Linux)
2. **실행 결과 확인**
   - 성공: "Success. No rows returned" 메시지 표시
   - 에러: 에러 메시지 확인 및 해결

### 6단계: 결과 확인 (선택사항)

1. **왼쪽 사이드바**에서 **Table Editor** 클릭
2. **maintenance_tasks** 테이블 확인
3. 테이블 구조가 올바르게 생성되었는지 확인

---

## 📄 사용할 SQL 파일

### 통합 파일 (권장)

```
supabase/migrations/maintenance_tasks_complete.sql
```

이 파일은 다음을 포함합니다:

- ✅ maintenance_tasks 테이블 생성
- ✅ 인덱스 생성
- ✅ 트리거 및 함수 생성
- ✅ RLS 정책 설정
- ✅ client_id 컬럼 추가

### 개별 파일

필요한 경우 다음 파일들을 순서대로 실행:

1. `supabase/migrations/20251109150920_maintenance_tasks.sql`
2. `supabase/migrations/20250101000000_add_client_id_to_maintenance_tasks.sql`

---

## ⚠️ 주의사항

### 이미 테이블이 있는 경우

- `CREATE TABLE IF NOT EXISTS` 구문 사용으로 중복 생성 방지
- `ADD COLUMN IF NOT EXISTS` 구문 사용으로 중복 컬럼 추가 방지
- 안전하게 재실행 가능

### 에러 발생 시

**"relation already exists"**

- 테이블이 이미 존재함 (정상)
- 다음 단계로 진행

**"column already exists"**

- 컬럼이 이미 존재함 (정상)
- 다음 단계로 진행

**"permission denied"**

- 관리자 권한 확인
- RLS 정책이 올바르게 설정되었는지 확인

**"foreign key constraint"**

- `instruments` 테이블이 존재하는지 확인
- `clients` 테이블이 존재하는지 확인

---

## ✅ 실행 확인

마이그레이션이 성공적으로 완료되었는지 확인:

```sql
-- 테이블 존재 확인
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'maintenance_tasks';

-- 테이블 구조 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'maintenance_tasks'
ORDER BY ordinal_position;

-- client_id 컬럼 확인
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'maintenance_tasks'
AND column_name = 'client_id';
```

---

## 🔗 빠른 링크

- **SQL Editor**: https://supabase.com/dashboard/project/dmilmlhquttcozxlpfxw/sql/new
- **Table Editor**: https://supabase.com/dashboard/project/dmilmlhquttcozxlpfxw/editor
- **Database Settings**: https://supabase.com/dashboard/project/dmilmlhquttcozxlpfxw/settings/database

---

## 💡 팁

1. **대용량 마이그레이션**: 큰 SQL 파일의 경우 브라우저가 느려질 수 있습니다. 필요한 부분만 실행하거나 작은 단위로 나눠 실행하세요.

2. **백업**: 중요한 프로덕션 데이터베이스의 경우 마이그레이션 전에 백업을 권장합니다.

3. **테스트**: 개발 환경에서 먼저 테스트한 후 프로덕션에 적용하세요.

4. **로깅**: 실행 결과를 스크린샷이나 로그로 저장해두면 나중에 참고하기 좋습니다.
