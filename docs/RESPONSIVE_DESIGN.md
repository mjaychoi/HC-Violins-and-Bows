# 반응형 디자인 가이드

## 개요

모바일, 태블릿, 데스크톱 등 다양한 화면 크기에서 최적의 사용자 경험을 제공하기 위한 반응형 디자인 구현 가이드입니다.

## 주요 기능

### 1. 모바일 레이아웃

#### 사이드바 오버레이

- 모바일 화면(< 768px)에서 사이드바가 오버레이로 표시됩니다
- 배경 어두운 오버레이로 포커스 제공
- 사이드바 외부 클릭 시 자동 닫기
- 라우트 변경 시 자동 닫기

```typescript
// AppLayout.tsx에서 자동 처리
{isMobile && isExpanded && (
  <div
    className="fixed inset-0 bg-black bg-opacity-50 z-40"
    onClick={collapseSidebar}
  />
)}
```

#### 테이블 스크롤

- 모바일에서 테이블이 가로 스크롤 가능하도록 최적화
- 모바일에서는 음수 마진으로 전체 너비 활용
- 데스크톱에서는 정상적인 패딩 유지

```tsx
<div className="overflow-x-auto -mx-4 sm:mx-0">
  <table className="min-w-full divide-y divide-gray-300">
    {/* 테이블 내용 */}
  </table>
</div>
```

### 2. 터치 제스처 지원

#### useTouchGestures 훅

터치 제스처를 감지하고 처리하는 커스텀 훅:

```typescript
import { useTouchGestures } from '@/hooks/useTouchGestures';

const { setElementRef } = useTouchGestures({
  onSwipeLeft: () => closeSidebar(),
  onSwipeRight: () => openSidebar(),
  onSwipeDown: () => closeModal(),
  threshold: 50, // 최소 스와이프 거리 (px)
  enabled: true,
});
```

#### 모달 스와이프 닫기

- 모달을 아래로 스와이프하여 닫기 가능
- `swipeToClose` prop으로 활성화/비활성화 가능

```tsx
<Modal
  isOpen={isOpen}
  onClose={handleClose}
  swipeToClose={true} // 기본값: true
  title="Example Modal"
>
  {/* 내용 */}
</Modal>
```

### 3. 모바일 네비게이션

#### 헤더 최적화

- 모바일에서 제목 크기 축소
- 이메일 주소 숨김 (태블릿 이상에서만 표시)
- 버튼 텍스트 축약 ("Sign out" → "Out")
- 액션 버튼 텍스트 축약 ("Add Item" → "Add")

```tsx
<h1 className="ml-2 sm:ml-4 text-xl sm:text-2xl font-semibold">{title}</h1>
```

#### 사이드바 자동 닫기

- 모바일에서 라우트 변경 시 자동으로 사이드바 닫기
- 사용자가 메뉴를 선택하면 자동으로 닫혀서 콘텐츠 확인 가능

### 4. 태블릿 레이아웃 최적화

#### 반응형 유틸리티 함수

`src/utils/responsive.ts`에서 제공하는 유틸리티:

```typescript
import {
  isMobile,
  isTablet,
  isDesktop,
  isTouchDevice,
} from '@/utils/responsive';

if (isMobile()) {
  // 모바일 전용 로직
}

if (isTablet()) {
  // 태블릿 전용 로직
}

if (isDesktop()) {
  // 데스크톱 전용 로직
}
```

#### 브레이크포인트

Tailwind CSS 표준 브레이크포인트 사용:

- `sm`: 640px 이상
- `md`: 768px 이상 (태블릿)
- `lg`: 1024px 이상 (데스크톱)
- `xl`: 1280px 이상
- `2xl`: 1536px 이상

## 적용된 컴포넌트

### 레이아웃 컴포넌트

1. **AppLayout**
   - 모바일 사이드바 오버레이
   - 자동 닫기 기능
   - 반응형 레이아웃

2. **AppSidebar**
   - 모바일에서 고정 위치
   - 애니메이션 전환
   - 터치 친화적 크기

3. **AppHeader**
   - 반응형 텍스트 크기
   - 모바일 최적화 버튼
   - 공간 효율적 레이아웃

### 공통 컴포넌트

1. **Modal**
   - 스와이프로 닫기
   - 모바일 최적화 크기
   - 터치 친화적 인터페이스

2. **테이블 (ItemList, ClientList)**
   - 가로 스크롤 지원
   - 모바일 최적화
   - 반응형 패딩

## 사용 예시

### 모바일 감지

```typescript
import { useState, useEffect } from 'react';
import { isMobile } from '@/utils/responsive';

function MyComponent() {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    setMobile(isMobile());
    const handleResize = () => setMobile(isMobile());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className={mobile ? 'mobile-layout' : 'desktop-layout'}>
      {/* 내용 */}
    </div>
  );
}
```

### 터치 제스처 사용

```typescript
import { useTouchGestures } from '@/hooks/useTouchGestures';

function SwipeableComponent() {
  const { setElementRef } = useTouchGestures({
    onSwipeLeft: () => console.log('Swiped left'),
    onSwipeRight: () => console.log('Swiped right'),
    threshold: 50,
  });

  return (
    <div ref={setElementRef}>
      {/* 스와이프 가능한 내용 */}
    </div>
  );
}
```

## 테스트

### 브라우저 개발자 도구

1. Chrome DevTools 열기 (F12)
2. 디바이스 툴바 토글 (Ctrl+Shift+M)
3. 다양한 디바이스 크기 테스트:
   - iPhone SE (375x667)
   - iPhone 12 Pro (390x844)
   - iPad (768x1024)
   - Desktop (1920x1080)

### E2E 테스트

Playwright를 사용한 반응형 테스트:

```typescript
test('should be responsive on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading')).toBeVisible();
});
```

## 모바일 최적화 팁

1. **터치 타겟 크기**: 최소 44x44px 유지
2. **텍스트 크기**: 모바일에서 최소 16px 사용 (줌 방지)
3. **간격**: 터치 친화적인 충분한 간격 제공
4. **성능**: 모바일에서 불필요한 애니메이션 최소화
5. **로딩**: 모바일 네트워크를 고려한 최적화

## 향후 개선 사항

- [ ] 더 많은 컴포넌트에 반응형 적용
- [ ] 모바일 전용 UI 패턴 추가
- [ ] 성능 최적화 (모바일)
- [ ] 접근성 개선 (모바일)
