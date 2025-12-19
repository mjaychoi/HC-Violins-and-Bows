#!/bin/bash
# 특정 테스트만 실행하는 스크립트
# 사용법:
#   ./test-single.sh "테스트 파일 경로:테스트 이름"
# 예시:
#   ./test-single.sh "tests/e2e/auth.spec.ts:127"
#   ./test-single.sh "tests/e2e/clients.spec.ts -g 'should display sidebar navigation'"

if [ -z "$1" ]; then
  echo "사용법: ./test-single.sh '테스트 파일:라인번호' 또는 '테스트 파일 -g \"테스트 이름\"'"
  echo ""
  echo "예시:"
  echo "  ./test-single.sh 'tests/e2e/auth.spec.ts:127'"
  echo "  ./test-single.sh 'tests/e2e/clients.spec.ts -g \"should display sidebar navigation\"'"
  exit 1
fi

npx playwright test "$1" --project=firefox
