import React from 'react';
import { renderHook, act, render } from '@testing-library/react';
import { useToast } from '../useToast';

// Mock SuccessToast component
jest.mock('@/components/common/SuccessToast', () => {
  return function SuccessToast({ message }: { message: string; onClose: () => void }) {
    return React.createElement('div', { 'data-testid': 'success-toast' }, message);
  };
});

// Mock SuccessToasts component to return a predictable structure with toast IDs
jest.mock('@/components/common/SuccessToasts', () => {
  return function SuccessToasts({ toasts }: { toasts: Array<{ id: string; message: string }>; onRemove: (id: string) => void }) {
    return React.createElement(
      'div',
      { className: 'fixed top-4 right-4 z-50 space-y-2' },
      toasts.map(toast =>
        React.createElement('div', {
          key: toast.id,
          'data-testid': 'success-toast',
          'data-toast-id': toast.id,
        }, toast.message)
      )
    );
  };
});

describe('useToast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with empty toasts', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.SuccessToasts).toBeDefined();
  });

  it('should show success toast', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showSuccess('Test message');
    });

    // Render the SuccessToasts component to verify it contains the toast
    const { container } = render(result.current.SuccessToasts());
    const toasts = container.querySelectorAll('[data-testid="success-toast"]');
    expect(toasts.length).toBe(1);
    expect(toasts[0]?.textContent).toBe('Test message');
  });

  it('should show multiple toasts', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showSuccess('Message 1');
      result.current.showSuccess('Message 2');
      result.current.showSuccess('Message 3');
    });

    const { container } = render(result.current.SuccessToasts());
    const toasts = container.querySelectorAll('[data-testid="success-toast"]');
    expect(toasts.length).toBe(3);
  });

  it('should remove toast', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showSuccess('Message 1');
      result.current.showSuccess('Message 2');
    });

    let { container } = render(result.current.SuccessToasts());
    let toasts = container.querySelectorAll('[data-testid="success-toast"]');
    expect(toasts.length).toBe(2);

    // Get the first toast ID from data attribute
    const firstToastId = toasts[0]?.getAttribute('data-toast-id');
    expect(firstToastId).toBeTruthy();

    act(() => {
      if (firstToastId) {
        result.current.removeToast(firstToastId);
      }
    });

    // Re-render to get updated state
    ({ container } = render(result.current.SuccessToasts()));
    toasts = container.querySelectorAll('[data-testid="success-toast"]');
    expect(toasts.length).toBe(1);
  });

  it('should generate unique toast IDs', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showSuccess('Message 1');
      result.current.showSuccess('Message 2');
    });

    const { container } = render(result.current.SuccessToasts());
    const toasts = container.querySelectorAll('[data-testid="success-toast"]');
    const ids = Array.from(toasts)
      .map(toast => toast.getAttribute('data-toast-id'))
      .filter((id): id is string => id !== null);
    
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2); // All IDs should be unique
  });
});
