#!/bin/bash

# Ownership 데이터 확인 스크립트
# 데이터베이스에서 ownership UUID와 클라이언트 매칭 확인

UUID="${1:-232646d3-8adf-4009-85f5-89a841a718f0}"

echo "🔍 Ownership 데이터 확인"
echo "UUID: $UUID"
echo ""

# 환경 변수 로드
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}"
DB_PASSWORD="${DATABASE_PASSWORD}"

if [ -z "$SUPABASE_URL" ] || [ -z "$DB_PASSWORD" ]; then
  echo "❌ 환경 변수가 설정되지 않았습니다."
  exit 1
fi

PROJECT_REF=$(echo $SUPABASE_URL | sed -E 's|https?://([^.]+)\.supabase\.co.*|\1|')

if [ -z "$PROJECT_REF" ]; then
  echo "❌ Supabase URL에서 프로젝트 참조를 추출할 수 없습니다."
  exit 1
fi

# PostgreSQL 연결 (psql이 설치되어 있다고 가정)
# 없으면 API를 통해서 확인하도록 안내

echo "📊 1. 해당 UUID를 ownership으로 가진 악기 확인:"
echo ""

curl -s "http://localhost:3000/api/instruments" 2>/dev/null | jq -r --arg uuid "$UUID" '.data[] | select(.ownership == $uuid) | {id, serial_number, type, maker, ownership}' 2>/dev/null || echo "⚠️  API 서버가 실행 중이지 않거나 jq가 설치되지 않았습니다."

echo ""
echo "📊 2. 해당 UUID를 가진 클라이언트 확인:"
echo ""

curl -s "http://localhost:3000/api/clients" 2>/dev/null | jq -r --arg uuid "$UUID" '.data[] | select(.id == $uuid) | {id, first_name, last_name, email}' 2>/dev/null || echo "⚠️  API 서버가 실행 중이지 않거나 클라이언트를 찾을 수 없습니다."

echo ""
echo "📊 3. Ownership이 UUID인 악기 개수:"
echo ""

curl -s "http://localhost:3000/api/instruments" 2>/dev/null | jq -r '.data | map(select(.ownership and (.ownership | test("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")))) | length' 2>/dev/null || echo "⚠️  API 서버가 실행 중이지 않습니다."

echo ""
echo "💡 브라우저 개발자 도구에서 다음을 실행하여 확인할 수 있습니다:"
echo ""
echo "fetch('/api/clients').then(r => r.json()).then(d => {"
echo "  const client = d.data.find(c => c.id === '$UUID');"
echo "  console.log('Client:', client || 'NOT FOUND');"
echo "});"
echo ""
echo "fetch('/api/instruments').then(r => r.json()).then(d => {"
echo "  const instruments = d.data.filter(i => i.ownership === '$UUID');"
echo "  console.log('Instruments with this ownership:', instruments);"
echo "});"
