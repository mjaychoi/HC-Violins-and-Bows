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
  const [touchState, setTouchState] = useState<TouchState | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;

      const touch = e.touches[0];
      setTouchState({
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
        isSwiping: false,
      });
    },
    [enabled]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!touchState || !enabled) return;

      const touch = e.touches[0];
      setTouchState(prev => {
        if (!prev) return null;
        return {
          ...prev,
          currentX: touch.clientX,
          currentY: touch.clientY,
          isSwiping: true,
        };
      });
    },
    [touchState, enabled]
  );

  const handleTouchEnd = useCallback(() => {
    if (!touchState || !enabled) return;

    const deltaX = touchState.currentX - touchState.startX;
    const deltaY = touchState.currentY - touchState.startY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // 수평 스와이프가 수직 스와이프보다 크면
    if (absDeltaX > absDeltaY && absDeltaX > threshold) {
      if (deltaX > 0 && onSwipeRight) {
        onSwipeRight();
      } else if (deltaX < 0 && onSwipeLeft) {
        onSwipeLeft();
      }
    }
    // 수직 스와이프가 수평 스와이프보다 크면
    else if (absDeltaY > absDeltaX && absDeltaY > threshold) {
      if (deltaY > 0 && onSwipeDown) {
        onSwipeDown();
      } else if (deltaY < 0 && onSwipeUp) {
        onSwipeUp();
      }
    }

    setTouchState(null);
  }, [touchState, threshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, enabled]);

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
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, enabled]);

  return {
    setElementRef,
    isSwiping: touchState?.isSwiping || false,
    swipeProgress: touchState
      ? Math.abs(touchState.currentX - touchState.startX) / threshold
      : 0,
  };
}
