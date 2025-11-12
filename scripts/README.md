# 마이그레이션 스크립트

이 폴더에는 Supabase 데이터베이스 마이그레이션을 실행하는 스크립트가 포함되어 있습니다.

## 사용 방법

### 방법 1: 자동 실행 (권장)

```bash
npm run migrate
```

이 명령어는 다음 방법을 순서대로 시도합니다:
1. PostgreSQL 직접 연결 (DATABASE_PASSWORD가 있으면)
2. Supabase CLI (설치되어 있으면)
3. 실패 시 수동 실행 안내

### 방법 2: PostgreSQL 직접 연결

데이터베이스 비밀번호가 있는 경우:

```bash
# .env.local에 DATABASE_PASSWORD 추가 후
npm run migrate:postgres
```

### 방법 3: Supabase CLI 사용

Supabase CLI가 설치되어 있고 로그인되어 있는 경우:

```bash
npm run migrate:cli
# 또는
npm run migrate:sh
```

## 환경 변수

`.env.local` 파일에 다음 환경 변수가 필요합니다:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DATABASE_PASSWORD=your_database_password  # 선택사항 (자동 실행용)
```

## 수동 실행 (가장 빠름)

자동 실행이 실패하거나 환경 변수가 없는 경우:

1. Supabase 대시보드 접속
   - https://supabase.com/dashboard/project/[PROJECT_REF]/sql/new

2. 마이그레이션 파일 복사
   - `migration-maintenance-tasks.sql` 파일 내용 복사

3. SQL Editor에 붙여넣기 후 Run 클릭

## 파일 구조

- `migrate.ts` - 통합 마이그레이션 스크립트 (TypeScript)
- `migrate.sh` - Supabase CLI 마이그레이션 스크립트 (Shell)
- `migration-maintenance-tasks.sql` - 마이그레이션 SQL 파일

## 문제 해결

### 에러: "DATABASE_PASSWORD 환경 변수가 필요합니다"

데이터베이스 비밀번호를 `.env.local`에 추가하거나, Supabase 대시보드에서 수동으로 실행하세요.

### 에러: "Supabase CLI에 로그인되어 있지 않습니다"

```bash
supabase login
```

### 에러: "프로젝트 참조를 찾을 수 없습니다"

`NEXT_PUBLIC_SUPABASE_URL` 환경 변수가 올바르게 설정되어 있는지 확인하세요.

