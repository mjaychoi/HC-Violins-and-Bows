#!/bin/bash
# ✅ FIXED: 테스트 파일의 @testing-library/react import를 @/test-utils/render로 일괄 변경
# 사용법: ./scripts/update-test-imports.sh

find src -type f \( -name "*.test.ts" -o -name "*.test.tsx" \) -exec sed -i '' \
  -e "s|from '@testing-library/react'|from '@/test-utils/render'|g" \
  -e "s|from \"@testing-library/react\"|from \"@/test-utils/render\"|g" \
  {} \;

echo "✅ 테스트 파일 import 업데이트 완료"
