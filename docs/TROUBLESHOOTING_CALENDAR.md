# 캘린더 기능 문제 해결 가이드

## 에러: "Supabase Error: {}"

이 에러는 `maintenance_tasks` 테이블이 아직 생성되지 않았을 때 발생할 수 있습니다.

### 해결 방법

1. **마이그레이션 실행 확인**
   - Supabase 대시보드에서 `maintenance_tasks` 테이블이 존재하는지 확인
   - https://supabase.com/dashboard/project/dmilmlhquttcozxlpfxw/editor

2. **마이그레이션 실행**
   - `migration-maintenance-tasks.sql` 파일을 Supabase SQL Editor에서 실행
   - https://supabase.com/dashboard/project/dmilmlhquttcozxlpfxw/sql/new

3. **RLS 정책 확인**
   - Settings > Authentication > Policies에서 RLS 정책 확인
   - `maintenance_tasks` 테이블에 대한 정책이 활성화되어 있는지 확인

### 일반적인 에러 코드

- `42P01`: 테이블이 존재하지 않음 → 마이그레이션 실행 필요
- `42501`: 권한 없음 → RLS 정책 확인
- `23503`: 외래 키 제약 조건 위반 → `instruments` 테이블 확인

### 디버깅

브라우저 콘솔에서 다음 정보를 확인하세요:

```javascript
// 에러 코드
error.code

// 에러 메시지
error.message

// 에러 세부 사항
error.details

// 힌트
error.hint
```

## 테이블 확인 방법

Supabase SQL Editor에서 다음 쿼리 실행:

```sql
-- 테이블 존재 확인
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'maintenance_tasks'
);

-- 테이블 구조 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'maintenance_tasks'
ORDER BY ordinal_position;

-- RLS 정책 확인
SELECT * FROM pg_policies 
WHERE tablename = 'maintenance_tasks';
```

## 빠른 해결

1. Supabase 대시보드 접속
2. SQL Editor 열기
3. `migration-maintenance-tasks.sql` 파일 내용 복사
4. 붙여넣기 후 실행
5. 페이지 새로고침

