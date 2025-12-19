# Mobile Safari 테스트 최적화 가이드

## 개선 사항

### 1. 타임아웃 설정 개선

**playwright.config.ts:**

- 전역 테스트 타임아웃: 30초 → 60초
- Mobile Safari 전용 타임아웃: 90초
- Mobile Safari actionTimeout: 20초
- Mobile Safari navigationTimeout: 45초
- Mobile Safari expect timeout: 15초

### 2. Mobile Safari 감지 및 최적화

**test-helpers.ts에 추가된 기능:**

- `waitForPageLoad`: Mobile Safari 감지 시 network idle 대기 시간 단축
- `safeClick`: Mobile Safari에서 스크롤 및 더 긴 타임아웃
- `safeFill`: Mobile Safari에서 여러 전략 사용 (fill → type fallback)
- `waitForStable`: Mobile Safari에서 더 긴 대기 시간
- `ensureSidebarOpen`: Mobile Safari에서 더 긴 타임아웃

### 3. 새로운 헬퍼 함수

- `waitForAPIResponse`: API 응답을 기다리는 더 정확한 방법
- `waitForElementVisible`: 재시도 로직이 있는 요소 대기

## Mobile Safari 스모크 테스트 실행

Mobile Safari에서 전체 테스트 대신 핵심 테스트만 실행하려면:

```bash
# playwright.config.ts에서 Mobile Safari 프로젝트의 testMatch 주석 해제
# 그 후:
npx playwright test --project="Mobile Safari"
```

또는 특정 스모크 테스트만 실행:

```bash
npx playwright test --project="Mobile Safari" --grep="smoke|critical|essential"
```

## 디버깅

### Trace 수집

Mobile Safari는 실패 시 자동으로 trace를 수집합니다 (`trace: 'retain-on-failure'`).

Trace 보기:

```bash
npx playwright show-trace test-results/...
```

### 타임아웃 문제 진단

1. 실패한 테스트의 trace 확인
2. `page.screenshot()` 추가하여 어느 단계에서 멈췄는지 확인
3. `console.log`로 각 단계의 시간 측정

## 권장 사항

1. **Mobile Safari는 스모크 테스트만**: 핵심 기능만 테스트하여 전체 실행 시간 단축
2. **API 응답 대기**: UI 변경 대신 API 응답을 기다리는 것이 더 안정적
3. **상태 전이 대기**: 로딩 스피너가 사라질 때까지 기다리는 것이 더 정확
4. **병렬 실행 제한**: Mobile Safari는 workers를 1로 제한하는 것을 고려
