#!/bin/bash

# API 테스트 스크립트
# 사용법: ./scripts/test-api.sh [base_url]
# 예: ./scripts/test-api.sh http://localhost:3000

BASE_URL=${1:-http://localhost:3000}

echo "🧪 API 테스트 시작: $BASE_URL"
echo ""

# Health Check
echo "1️⃣  Health Check (/api/health)"
curl -s "$BASE_URL/api/health" | jq '.' || echo "❌ Health check failed or jq not installed"
echo ""

# Clients API (GET)
echo "2️⃣  Clients API - GET (/api/clients)"
curl -s "$BASE_URL/api/clients" | jq '.data | length' || echo "❌ Clients API failed"
echo ""

# Instruments API (GET)
echo "3️⃣  Instruments API - GET (/api/instruments)"
curl -s "$BASE_URL/api/instruments" | jq '.data | length' || echo "❌ Instruments API failed"
echo ""

# Connections API (GET)
echo "4️⃣  Connections API - GET (/api/connections)"
curl -s "$BASE_URL/api/connections" | jq '.data | length' || echo "❌ Connections API failed"
echo ""

# Sales API (GET)
echo "5️⃣  Sales API - GET (/api/sales?page=1&pageSize=10)"
curl -s "$BASE_URL/api/sales?page=1&pageSize=10" | jq '.data | length' || echo "❌ Sales API failed"
echo ""

# Maintenance Tasks API (GET)
echo "6️⃣  Maintenance Tasks API - GET (/api/maintenance-tasks)"
curl -s "$BASE_URL/api/maintenance-tasks" | jq '.data | length' || echo "❌ Maintenance Tasks API failed"
echo ""

echo "✅ API 테스트 완료"
