import React from 'react';
import { renderHook, act } from '@/test-utils/render';
import { useToast } from '@/contexts/ToastContext';
import { ToastProvider } from '@/contexts/ToastContext';

// Mock SuccessToast component
jest.mock('@/components/common/feedback/SuccessToast', () => {
  return function SuccessToast({
    message,
  }: {
    message: string;
    onClose: () => void;
  }) {
    return React.createElement(
      'div',
      { 'data-testid': 'success-toast' },
      message
    );
  };
});

// Mock SuccessToasts component to return a predictable structure with toast IDs
jest.mock('@/components/common/feedback/SuccessToasts', () => {
  return function SuccessToasts({
    toasts,
  }: {
    toasts: Array<{ id: string; message: string }>;
    onRemove: (id: string) => void;
  }) {
    return React.createElement(
      'div',
      { className: 'fixed top-4 right-4 z-50 space-y-2' },
      toasts.map(toast =>
        React.createElement(
          'div',
          {
            key: toast.id,
            'data-testid': 'success-toast',
            'data-toast-id': toast.id,
          },
          toast.message
        )
      )
    );
  };
});

describe('useToast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with empty toasts', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ToastProvider,
    });
    expect(result.current.toasts).toEqual([]);
  });

  it('should show success toast', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showSuccess('Test message');
    });

    // ✅ FIXED: ToastHost가 자동 렌더링되므로 toasts 배열 확인
    expect(result.current.toasts.length).toBe(1);
    expect(result.current.toasts[0]?.message).toBe('Test message');
  });

  it('should show multiple toasts', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showSuccess('Message 1');
      result.current.showSuccess('Message 2');
      result.current.showSuccess('Message 3');
    });

    // ✅ FIXED: SuccessToasts는 ToastHost에서 자동 렌더링되므로 toasts 배열 확인
    expect(result.current.toasts.length).toBe(3);
    expect(result.current.toasts[0]?.message).toBe('Message 1');
    expect(result.current.toasts[1]?.message).toBe('Message 2');
    expect(result.current.toasts[2]?.message).toBe('Message 3');
  });

  it('should remove toast', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showSuccess('Message 1');
      result.current.showSuccess('Message 2');
    });

    expect(result.current.toasts.length).toBe(2);

    // Get the first toast ID
    const firstToastId = result.current.toasts[0]?.id;
    expect(firstToastId).toBeTruthy();

    act(() => {
      if (firstToastId) {
        result.current.removeToast(firstToastId);
      }
    });

    expect(result.current.toasts.length).toBe(1);
  });

  it('should generate unique toast IDs', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showSuccess('Message 1');
      result.current.showSuccess('Message 2');
    });

    const ids = result.current.toasts.map(toast => toast.id);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2); // All IDs should be unique
  });
});
