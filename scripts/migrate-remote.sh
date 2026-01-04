#!/bin/bash

# Sync local migrations to the remote Supabase project.
# Uses NEXT_PUBLIC_SUPABASE_URL from .env.local to resolve project ref.

set -e

echo "🔄 Supabase 원격 마이그레이션 동기화 시작..."
echo ""

# Load env vars
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}"
if [ -z "$SUPABASE_URL" ]; then
  echo "❌ NEXT_PUBLIC_SUPABASE_URL 환경 변수가 설정되지 않았습니다."
  exit 1
fi

PROJECT_REF=$(echo "$SUPABASE_URL" | sed -E 's#https?://([^.]*)\.supabase\.co.*#\1#')
if [ -z "$PROJECT_REF" ]; then
  echo "❌ Supabase 프로젝트 참조를 추출할 수 없습니다."
  exit 1
fi

echo "📦 프로젝트: $PROJECT_REF"
echo ""

# Supabase CLI 확인
if ! command -v supabase &> /dev/null; then
  echo "❌ Supabase CLI가 설치되어 있지 않습니다."
  echo "설치: brew install supabase/tap/supabase"
  exit 1
fi

echo "✅ Supabase CLI: $(supabase --version)"
echo ""

# 마이그레이션 파일 확인
if ! ls supabase/migrations/*.sql &> /dev/null; then
  echo "❌ supabase/migrations/*.sql 파일을 찾을 수 없습니다."
  exit 1
fi

# 로그인 확인
echo "🔍 Supabase 로그인 상태 확인..."
if ! supabase projects list &> /dev/null; then
  echo "❌ Supabase CLI에 로그인되어 있지 않습니다."
  echo "실행: supabase login"
  exit 1
fi
echo "✅ 로그인 확인"
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
echo "🚀 원격 Supabase에 마이그레이션 적용 중..."
supabase db push --include-all

echo ""
echo "✅ 원격 Supabase 마이그레이션 동기화 완료!"
