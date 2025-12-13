#!/bin/bash

# 자동 API 테스트 스크립트
BASE_URL="http://localhost:3000"

echo "🔍 API 자동 테스트 시작..."
echo "=================================="
echo ""

# 서버 연결 확인
echo "1️⃣  서버 연결 확인..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$BASE_URL/api/health" 2>/dev/null)

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ 서버가 실행되지 않았거나 응답하지 않습니다 (HTTP $HTTP_CODE)"
  echo "💡 먼저 'npm run dev'로 개발 서버를 실행하세요"
  exit 1
fi

echo "✅ 서버 연결 성공 (HTTP $HTTP_CODE)"
echo ""

# Health Check
echo "2️⃣  Health Check API 테스트..."
HEALTH_RESPONSE=$(curl -s --max-time 5 "$BASE_URL/api/health")
if echo "$HEALTH_RESPONSE" | grep -q "status.*ok"; then
  echo "✅ Health Check: OK"
  echo "$HEALTH_RESPONSE" | jq '.' 2>/dev/null || echo "$HEALTH_RESPONSE"
else
  echo "❌ Health Check: 실패"
  echo "$HEALTH_RESPONSE"
fi
echo ""

# Clients API
echo "3️⃣  Clients API 테스트..."
CLIENTS_RESPONSE=$(curl -s --max-time 5 "$BASE_URL/api/clients")
CLIENTS_COUNT=$(echo "$CLIENTS_RESPONSE" | jq '.data | length' 2>/dev/null)
if [ "$CLIENTS_COUNT" != "null" ] && [ "$CLIENTS_COUNT" != "" ]; then
  echo "✅ Clients API: 성공 (클라이언트 수: $CLIENTS_COUNT)"
else
  echo "❌ Clients API: 실패 또는 데이터 없음"
  echo "$CLIENTS_RESPONSE" | head -5
fi
echo ""

# Instruments API
echo "4️⃣  Instruments API 테스트..."
INSTRUMENTS_RESPONSE=$(curl -s --max-time 5 "$BASE_URL/api/instruments")
INSTRUMENTS_COUNT=$(echo "$INSTRUMENTS_RESPONSE" | jq '.data | length' 2>/dev/null)
if [ "$INSTRUMENTS_COUNT" != "null" ] && [ "$INSTRUMENTS_COUNT" != "" ]; then
  echo "✅ Instruments API: 성공 (악기 수: $INSTRUMENTS_COUNT)"
else
  echo "❌ Instruments API: 실패 또는 데이터 없음"
  echo "$INSTRUMENTS_RESPONSE" | head -5
fi
echo ""

# Connections API
echo "5️⃣  Connections API 테스트..."
CONNECTIONS_RESPONSE=$(curl -s --max-time 5 "$BASE_URL/api/connections")
CONNECTIONS_COUNT=$(echo "$CONNECTIONS_RESPONSE" | jq '.data | length' 2>/dev/null)
if [ "$CONNECTIONS_COUNT" != "null" ] && [ "$CONNECTIONS_COUNT" != "" ]; then
  echo "✅ Connections API: 성공 (연결 수: $CONNECTIONS_COUNT)"
else
  echo "❌ Connections API: 실패 또는 데이터 없음"
  echo "$CONNECTIONS_RESPONSE" | head -5
fi
echo ""

# Sales API
echo "6️⃣  Sales API 테스트..."
SALES_RESPONSE=$(curl -s --max-time 5 "$BASE_URL/api/sales?page=1&pageSize=10")
SALES_COUNT=$(echo "$SALES_RESPONSE" | jq '.data | length' 2>/dev/null)
if [ "$SALES_COUNT" != "null" ] && [ "$SALES_COUNT" != "" ]; then
  echo "✅ Sales API: 성공 (판매 기록 수: $SALES_COUNT)"
else
  echo "❌ Sales API: 실패 또는 데이터 없음"
  echo "$SALES_RESPONSE" | head -5
fi
echo ""

# Maintenance Tasks API
echo "7️⃣  Maintenance Tasks API 테스트..."
TASKS_RESPONSE=$(curl -s --max-time 5 "$BASE_URL/api/maintenance-tasks")
TASKS_COUNT=$(echo "$TASKS_RESPONSE" | jq '.data | length' 2>/dev/null)
if [ "$TASKS_COUNT" != "null" ] && [ "$TASKS_COUNT" != "" ]; then
  echo "✅ Maintenance Tasks API: 성공 (작업 수: $TASKS_COUNT)"
else
  echo "❌ Maintenance Tasks API: 실패 또는 데이터 없음"
  echo "$TASKS_RESPONSE" | head -5
fi
echo ""

echo "=================================="
echo "✅ API 테스트 완료!"
echo ""
echo "📊 요약:"
echo "  - Health Check: ✅"
if [ "$CLIENTS_COUNT" != "null" ] && [ "$CLIENTS_COUNT" != "" ]; then
  echo "  - Clients API: ✅ ($CLIENTS_COUNT items)"
else
  echo "  - Clients API: ⚠️"
fi
if [ "$INSTRUMENTS_COUNT" != "null" ] && [ "$INSTRUMENTS_COUNT" != "" ]; then
  echo "  - Instruments API: ✅ ($INSTRUMENTS_COUNT items)"
else
  echo "  - Instruments API: ⚠️"
fi
if [ "$CONNECTIONS_COUNT" != "null" ] && [ "$CONNECTIONS_COUNT" != "" ]; then
  echo "  - Connections API: ✅ ($CONNECTIONS_COUNT items)"
else
  echo "  - Connections API: ⚠️"
fi
if [ "$SALES_COUNT" != "null" ] && [ "$SALES_COUNT" != "" ]; then
  echo "  - Sales API: ✅ ($SALES_COUNT items)"
else
  echo "  - Sales API: ⚠️"
fi
if [ "$TASKS_COUNT" != "null" ] && [ "$TASKS_COUNT" != "" ]; then
  echo "  - Maintenance Tasks API: ✅ ($TASKS_COUNT items)"
else
  echo "  - Maintenance Tasks API: ⚠️"
fi
