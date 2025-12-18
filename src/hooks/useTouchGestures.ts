/**
 * Touch Gesture Hook
 * 터치 제스처를 감지하고 처리하는 훅
 */
import { useState, useCallback, useRef, useEffect } from 'react';

interface TouchState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isSwiping: boolean;
}

interface UseTouchGesturesOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number; // 최소 스와이프 거리 (px)
  enabled?: boolean;
}

export function useTouchGestures({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
  enabled = true,
}: UseTouchGesturesOptions = {}) {
  // ✅ FIXED: touchState를 useRef로 변경하여 dependency 문제 해결
  // gesture 관련 상태는 ref 기반이 더 안정적 (재바인딩 방지)
  const touchStateRef = useRef<TouchState | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  // ✅ FIXED: 콜백을 ref로 저장하여 리스너 재등록 방지
  const callbacksRef = useRef({
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
  });

  // 콜백이 변경될 때마다 ref 업데이트 (리스너 재등록은 방지)
  useEffect(() => {
    callbacksRef.current = {
      onSwipeLeft,
      onSwipeRight,
      onSwipeUp,
      onSwipeDown,
    };
  }, [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);

  // UI에 필요한 값만 state로 유지
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeProgress, setSwipeProgress] = useState(0);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;

      const touch = e.touches[0];
      touchStateRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
        isSwiping: false,
      };
      setIsSwiping(false);
      setSwipeProgress(0);
    },
    [enabled]
  );

  // ✅ FIXED: requestAnimationFrame으로 throttle하여 리렌더 폭발 방지
  const rafRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!touchStateRef.current || !enabled) return;

      const touch = e.touches[0];

      // ref는 즉시 업데이트 (gesture 계산용)
      touchStateRef.current = {
        ...touchStateRef.current,
        currentX: touch.clientX,
        currentY: touch.clientY,
        isSwiping: true,
      };

      // state 업데이트는 requestAnimationFrame으로 throttle
      pendingUpdateRef.current = { x: touch.clientX, y: touch.clientY };

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          if (pendingUpdateRef.current && touchStateRef.current) {
            setIsSwiping(true);
            const deltaX = Math.abs(
              pendingUpdateRef.current.x - touchStateRef.current.startX
            );
            setSwipeProgress(deltaX / threshold);
          }
          rafRef.current = null;
          pendingUpdateRef.current = null;
        });
      }
    },
    [enabled, threshold]
  );

  // ✅ FIXED: 콜백을 ref에서 읽어서 리스너 재등록 방지
  const handleTouchEnd = useCallback(() => {
    if (!touchStateRef.current || !enabled) return;

    const state = touchStateRef.current;
    const deltaX = state.currentX - state.startX;
    const deltaY = state.currentY - state.startY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // 수평 스와이프가 수직 스와이프보다 크면
    if (absDeltaX > absDeltaY && absDeltaX > threshold) {
      if (deltaX > 0 && callbacksRef.current.onSwipeRight) {
        callbacksRef.current.onSwipeRight();
      } else if (deltaX < 0 && callbacksRef.current.onSwipeLeft) {
        callbacksRef.current.onSwipeLeft();
      }
    }
    // 수직 스와이프가 수평 스와이프보다 크면
    else if (absDeltaY > absDeltaX && absDeltaY > threshold) {
      if (deltaY > 0 && callbacksRef.current.onSwipeDown) {
        callbacksRef.current.onSwipeDown();
      } else if (deltaY < 0 && callbacksRef.current.onSwipeUp) {
        callbacksRef.current.onSwipeUp();
      }
    }

    touchStateRef.current = null;
    setIsSwiping(false);
    setSwipeProgress(0);
  }, [threshold, enabled]);

  const setElementRef = useCallback((element: HTMLElement | null) => {
    elementRef.current = element;
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !enabled) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      // ✅ FIXED: Cleanup pending RAF on unmount
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pendingUpdateRef.current = null;
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, enabled]);

  return {
    setElementRef,
    isSwiping,
    swipeProgress,
  };
}
