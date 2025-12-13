#!/bin/bash

# Ownership UUID 확인 스크립트
# 사용법: ./scripts/check-ownership-uuid.sh [UUID]

UUID="${1:-232646d3-8adf-4009-85f5-89a841a718f0}"

echo "🔍 Ownership UUID 확인: $UUID"
echo ""

# 환경 변수 로드
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}"
DB_PASSWORD="${DATABASE_PASSWORD}"

if [ -z "$SUPABASE_URL" ] || [ -z "$DB_PASSWORD" ]; then
  echo "❌ 환경 변수가 설정되지 않았습니다."
  echo "   NEXT_PUBLIC_SUPABASE_URL와 DATABASE_PASSWORD를 확인하세요."
  exit 1
fi

# Extract project reference from URL
PROJECT_REF=$(echo $SUPABASE_URL | sed -E 's|https?://([^.]+)\.supabase\.co.*|\1|')

if [ -z "$PROJECT_REF" ]; then
  echo "❌ Supabase URL에서 프로젝트 참조를 추출할 수 없습니다."
  exit 1
fi

echo "📊 악기 ownership 확인:"
echo ""

# PostgreSQL 연결 및 쿼리
psql "postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:5432/postgres" <<EOF
SELECT 
  i.id as instrument_id,
  i.serial_number,
  i.type,
  i.maker,
  i.ownership,
  CASE 
    WHEN c.id IS NOT NULL THEN '✅ 클라이언트 존재'
    ELSE '❌ 클라이언트 없음'
  END as client_status,
  c.first_name,
  c.last_name,
  c.email
FROM instruments i
LEFT JOIN clients c ON i.ownership = c.id
WHERE i.ownership = '$UUID'
LIMIT 5;
EOF

echo ""
echo "📊 해당 UUID를 가진 모든 클라이언트 확인:"
echo ""

psql "postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:5432/postgres" <<EOF
SELECT 
  id,
  first_name,
  last_name,
  email,
  client_number
FROM clients
WHERE id = '$UUID'
LIMIT 5;
EOF

echo ""
echo "📊 ownership이 UUID인 악기 개수:"
echo ""

psql "postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:5432/postgres" <<EOF
SELECT 
  COUNT(*) FILTER (WHERE i.ownership ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as uuid_count,
  COUNT(*) FILTER (WHERE i.ownership IS NOT NULL AND i.ownership !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as non_uuid_count,
  COUNT(*) FILTER (WHERE i.ownership IS NULL) as null_count,
  COUNT(*) as total
FROM instruments i;
EOF
