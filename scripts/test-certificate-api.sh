#!/bin/bash

# Certificate API 테스트 스크립트
# 사용법: ./scripts/test-certificate-api.sh [base_url] [instrument_id]
# 예: ./scripts/test-certificate-api.sh http://localhost:3001 <instrument-uuid>

BASE_URL=${1:-http://localhost:3001}
INSTRUMENT_ID=${2}

if [ -z "$INSTRUMENT_ID" ]; then
  echo "❌ Instrument ID가 필요합니다."
  echo "사용법: ./scripts/test-certificate-api.sh [base_url] [instrument_id]"
  echo "예: ./scripts/test-certificate-api.sh http://localhost:3001 123e4567-e89b-12d3-a456-426614174000"
  exit 1
fi

echo "🧪 Certificate API 테스트 시작"
echo "Base URL: $BASE_URL"
echo "Instrument ID: $INSTRUMENT_ID"
echo ""

# Certificate API 테스트
echo "📄 Certificate PDF 생성 테스트 (/api/certificates/$INSTRUMENT_ID)"

# macOS와 Linux 호환성을 위해 임시 파일 사용
TEMP_FILE=$(mktemp)
HTTP_CODE=$(curl -s -w "%{http_code}" -o "$TEMP_FILE" "$BASE_URL/api/certificates/$INSTRUMENT_ID")

echo "HTTP Status: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" -eq 200 ]; then
  # PDF 파일로 저장
  mv "$TEMP_FILE" "/tmp/certificate-test.pdf"
  PDF_SIZE=$(stat -f%z "/tmp/certificate-test.pdf" 2>/dev/null || stat -c%s "/tmp/certificate-test.pdf" 2>/dev/null || echo "unknown")
  echo "✅ PDF 생성 성공!"
  echo "PDF 크기: $PDF_SIZE bytes"
  echo "PDF 파일 위치: /tmp/certificate-test.pdf"
  echo ""
  echo "PDF 파일을 확인하려면:"
  echo "  open /tmp/certificate-test.pdf"
else
  echo "❌ PDF 생성 실패 (HTTP $HTTP_CODE)"
  echo "응답 내용:"
  cat "$TEMP_FILE" | head -20
  rm -f "$TEMP_FILE"
  echo ""
  echo "에러가 발생했습니다. 서버 로그를 확인하세요."
  echo ""
  echo "참고: Instrument ID가 데이터베이스에 존재하는지 확인하세요."
  echo "      실제 Instrument ID를 찾으려면:"
  echo "      curl $BASE_URL/api/instruments | jq '.data[0].id'"
fi

echo ""
echo "✅ 테스트 완료"
