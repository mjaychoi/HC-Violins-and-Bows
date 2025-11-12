#!/bin/bash

# Supabase 마이그레이션 Shell 스크립트
# Supabase CLI를 사용하여 마이그레이션을 실행합니다.

set -e

echo "🔄 Supabase 마이그레이션 실행 (CLI)..."
echo ""

# 환경 변수 로드
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}"
PROJECT_REF=$(echo $SUPABASE_URL | sed 's/.*\/\///' | sed 's/\..*//')

if [ -z "$PROJECT_REF" ]; then
  echo "❌ NEXT_PUBLIC_SUPABASE_URL 환경 변수가 설정되지 않았습니다."
  exit 1
fi

echo "📦 프로젝트: $PROJECT_REF"
echo ""

# Supabase CLI 확인
if ! command -v supabase &> /dev/null; then
  echo "❌ Supabase CLI가 설치되어 있지 않습니다."
  echo ""
  echo "설치 방법:"
  echo "  brew install supabase/tap/supabase"
  echo "  또는"
  echo "  npm install -g supabase"
  echo ""
  echo "📝 대신 수동 실행 방법:"
  echo "   1. https://supabase.com/dashboard/project/$PROJECT_REF/sql/new 접속"
  echo "   2. migration-maintenance-tasks.sql 파일 내용 복사"
  echo "   3. 붙여넣기 후 Run 클릭"
  exit 1
fi

echo "✅ Supabase CLI: $(supabase --version)"
echo ""

# 마이그레이션 파일 확인
if [ ! -f "migration-maintenance-tasks.sql" ]; then
  echo "❌ 마이그레이션 파일을 찾을 수 없습니다: migration-maintenance-tasks.sql"
  exit 1
fi

# 마이그레이션 파일 준비
mkdir -p supabase/migrations
TIMESTAMP=$(date +%Y%m%d%H%M%S)
MIGRATION_FILE="supabase/migrations/${TIMESTAMP}_maintenance_tasks.sql"

cp migration-maintenance-tasks.sql "$MIGRATION_FILE"
echo "✅ 마이그레이션 파일 준비: $MIGRATION_FILE"
echo ""

# Supabase 로그인 확인
echo "🔍 Supabase 로그인 상태 확인..."
if supabase projects list &> /dev/null; then
  echo "✅ 로그인되어 있습니다."
else
  echo "⚠️  Supabase에 로그인해야 합니다."
  echo "   실행: supabase login"
  echo ""
  echo "📝 대신 수동 실행 방법:"
  echo "   1. https://supabase.com/dashboard/project/$PROJECT_REF/sql/new 접속"
  echo "   2. migration-maintenance-tasks.sql 파일 내용 복사"
  echo "   3. 붙여넣기 후 Run 클릭"
  exit 1
fi

echo ""

# 프로젝트 링크
echo "🔗 프로젝트 링크 중..."
if supabase link --project-ref "$PROJECT_REF" &> /dev/null; then
  echo "✅ 프로젝트 링크 완료"
else
  echo "⚠️  프로젝트 링크 실패 (이미 링크되어 있을 수 있음)"
fi

echo ""

# 마이그레이션 실행
echo "🚀 마이그레이션 실행 중..."
if supabase db push --include-all; then
  echo ""
  echo "✅ 마이그레이션 완료!"
  echo ""
  echo "🎉 maintenance_tasks 테이블이 생성되었습니다."
  echo "📅 이제 /calendar 페이지에서 캘린더 기능을 사용할 수 있습니다."
else
  echo ""
  echo "❌ 마이그레이션 실패"
  echo ""
  echo "💡 수동 실행 방법:"
  echo "   1. https://supabase.com/dashboard/project/$PROJECT_REF/sql/new 접속"
  echo "   2. migration-maintenance-tasks.sql 파일 내용 복사"
  echo "   3. 붙여넣기 후 Run 클릭"
  exit 1
fi

