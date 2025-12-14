import { renderHook } from '@/test-utils/render';
import { useEscapeKey } from '../useEscapeKey';

describe('useEscapeKey', () => {
  let mockOnEscape: jest.Mock;

  beforeEach(() => {
    mockOnEscape = jest.fn();
    // Clear any existing event listeners
    document.removeEventListener('keydown', jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call onEscape when Escape key is pressed', () => {
    renderHook(() => useEscapeKey(mockOnEscape));

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    });

    document.dispatchEvent(escapeEvent);

    expect(mockOnEscape).toHaveBeenCalledTimes(1);
  });

  it('should not call onEscape when other keys are pressed', () => {
    renderHook(() => useEscapeKey(mockOnEscape));

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
    });

    document.dispatchEvent(enterEvent);

    expect(mockOnEscape).not.toHaveBeenCalled();
  });

  it('should not call onEscape when isActive is false', () => {
    renderHook(() => useEscapeKey(mockOnEscape, false));

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    });

    document.dispatchEvent(escapeEvent);

    expect(mockOnEscape).not.toHaveBeenCalled();
  });

  it('should call onEscape when isActive is true', () => {
    renderHook(() => useEscapeKey(mockOnEscape, true));

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    });

    document.dispatchEvent(escapeEvent);

    expect(mockOnEscape).toHaveBeenCalledTimes(1);
  });

  it('should cleanup event listener on unmount', () => {
    const { unmount } = renderHook(() => useEscapeKey(mockOnEscape));

    unmount();

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    });

    document.dispatchEvent(escapeEvent);

    expect(mockOnEscape).not.toHaveBeenCalled();
  });

  it('should update event listener when onEscape changes', () => {
    const mockOnEscape1 = jest.fn();
    const mockOnEscape2 = jest.fn();

    const { rerender } = renderHook(({ onEscape }) => useEscapeKey(onEscape), {
      initialProps: { onEscape: mockOnEscape1 },
    });

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    });

    document.dispatchEvent(escapeEvent);

    expect(mockOnEscape1).toHaveBeenCalledTimes(1);
    expect(mockOnEscape2).not.toHaveBeenCalled();

    rerender({ onEscape: mockOnEscape2 });

    document.dispatchEvent(escapeEvent);

    expect(mockOnEscape1).toHaveBeenCalledTimes(1);
    expect(mockOnEscape2).toHaveBeenCalledTimes(1);
  });

  it('should update event listener when isActive changes', () => {
    const { rerender } = renderHook(
      ({ isActive }) => useEscapeKey(mockOnEscape, isActive),
      { initialProps: { isActive: false } }
    );

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    });

    document.dispatchEvent(escapeEvent);

    expect(mockOnEscape).not.toHaveBeenCalled();

    rerender({ isActive: true });

    document.dispatchEvent(escapeEvent);

    expect(mockOnEscape).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple escape key presses', () => {
    renderHook(() => useEscapeKey(mockOnEscape));

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    });

    document.dispatchEvent(escapeEvent);
    document.dispatchEvent(escapeEvent);
    document.dispatchEvent(escapeEvent);

    expect(mockOnEscape).toHaveBeenCalledTimes(3);
  });

  it('should handle event with different case', () => {
    renderHook(() => useEscapeKey(mockOnEscape));

    // Some browsers might use 'Esc' instead of 'Escape'
    const escEvent = new KeyboardEvent('keydown', {
      key: 'Esc',
      bubbles: true,
    });

    document.dispatchEvent(escEvent);

    // Should not call onEscape (only 'Escape' should work)
    expect(mockOnEscape).not.toHaveBeenCalled();
  });

  it('should use passive event listener', () => {
    const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

    renderHook(() => useEscapeKey(mockOnEscape));

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function),
      { passive: true }
    );

    addEventListenerSpy.mockRestore();
  });
});
