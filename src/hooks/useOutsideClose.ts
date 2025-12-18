import { useEffect } from 'react';
import { useEscapeKey } from './useEscapeKey';

interface UseOutsideCloseOptions {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Selector for toggle buttons that should not trigger close when clicked.
   * Useful for filter panels opened via a specific button.
   */
  ignoreSelector?: string;
  /**
   * Whether to close on ESC key. Defaults to true.
   */
  closeOnEsc?: boolean;
}

/**
 * Handles closing on outside click + optional ESC key.
 * Attach to the container ref of panels/modals to unify behavior.
 */
export function useOutsideClose(
  ref: React.RefObject<HTMLElement | null>,
  {
    isOpen,
    onClose,
    ignoreSelector = '[data-filter-button]',
    closeOnEsc = true,
  }: UseOutsideCloseOptions
) {
  useEscapeKey(() => {
    if (closeOnEsc && isOpen) onClose();
  }, isOpen);

  useEffect(() => {
    if (!isOpen) return;

    // ✅ FIXED: querySelectorAll로 여러 요소 지원 (토글 버튼이 여러 개일 수 있음)
    const toggleElements = ignoreSelector
      ? Array.from(document.querySelectorAll<HTMLElement>(ignoreSelector))
      : [];

    // FIXED: Event name matches handler name
    // Use mousedown (not pointerdown) for consistent behavior
    // Note: capture phase is used intentionally for early event handling
    const onMouseDown = (event: MouseEvent) => {
      const path = (event.composedPath?.() ?? []) as Node[];
      if (ref.current && path.includes(ref.current)) return;
      // ✅ FIXED: 여러 toggle 요소 중 하나라도 path에 포함되면 무시
      if (toggleElements.some(el => path.includes(el))) return;
      onClose();
    };

    document.addEventListener('mousedown', onMouseDown, { capture: true });
    return () =>
      document.removeEventListener('mousedown', onMouseDown, { capture: true });
  }, [ignoreSelector, isOpen, onClose, ref]);
}
