#!/bin/bash
# 특정 E2E 테스트 파일들만 실행하는 스크립트
#
# 사용법:
#   ./test-specific.sh              # 모든 브라우저에서 실행
#   ./test-specific.sh --project=chromium    # Chrome만 실행
#   ./test-specific.sh --ui          # UI 모드로 실행 (시각적으로 확인)
#   ./test-specific.sh --headed      # 브라우저 창을 띄우고 실행
#   ./test-specific.sh --debug       # 디버그 모드로 실행
#
# 예시:
#   ./test-specific.sh --project=chromium --ui
#   ./test-specific.sh --project=firefox --headed

npx playwright test \
  tests/e2e/dashboard.spec.ts \
  tests/e2e/auth.spec.ts \
  tests/e2e/error-handling.spec.ts \
  tests/e2e/performance.spec.ts \
  tests/e2e/sales.spec.ts \
  tests/e2e/clients.spec.ts \
  tests/e2e/form.spec.ts \
  tests/e2e/interactions.spec.ts \
  "$@"
