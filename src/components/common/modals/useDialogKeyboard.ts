'use client';

import { useEffect, useId, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

type DialogEntry = {
  id: string;
  container: HTMLElement;
  onClose: () => void;
};

let dialogStack: DialogEntry[] = [];
let listening = false;
let scrollLockCount = 0;

function isElementVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

export function getDialogFocusableElements(
  container: HTMLElement
): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(el => {
    const isDisabled =
      'disabled' in el && (el as HTMLButtonElement | HTMLInputElement).disabled;
    return !isDisabled && isElementVisible(el);
  });
}

function chooseInitialFocus(container: HTMLElement): HTMLElement {
  const autofocus = container.querySelector<HTMLElement>('[autofocus]');
  if (autofocus && isElementVisible(autofocus)) {
    return autofocus;
  }

  const focusable = getDialogFocusableElements(container);
  const firstField = focusable.find(el =>
    ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)
  );
  if (firstField) return firstField;

  const firstNonClose = focusable.find(el => {
    const label = (el.getAttribute('aria-label') || '').toLowerCase();
    return !label.includes('close modal');
  });
  if (firstNonClose) return firstNonClose;

  return focusable[0] ?? container;
}

function onDocumentKeyDown(event: KeyboardEvent) {
  const top = dialogStack[dialogStack.length - 1];
  if (!top) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    top.onClose();
    return;
  }

  if (event.key !== 'Tab') return;

  const focusable = getDialogFocusableElements(top.container);
  if (focusable.length === 0) {
    event.preventDefault();
    top.container.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const activeIsInside =
    active instanceof HTMLElement && top.container.contains(active);

  if (event.shiftKey) {
    if (!activeIsInside || active === first) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (!activeIsInside || active === last) {
    event.preventDefault();
    first.focus();
  }
}

function ensureKeyListener() {
  if (listening) return;
  document.addEventListener('keydown', onDocumentKeyDown, true);
  listening = true;
}

function releaseKeyListener() {
  if (dialogStack.length > 0 || !listening) return;
  document.removeEventListener('keydown', onDocumentKeyDown, true);
  listening = false;
}

function lockBodyScroll() {
  scrollLockCount += 1;
  if (scrollLockCount === 1) {
    document.body.style.overflow = 'hidden';
  }
}

function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = '';
  }
}

export function useDialogKeyboard({
  isOpen,
  onClose,
  containerRef,
}: {
  isOpen: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const id = useId();
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const container = containerRef.current;
    if (!container) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    lockBodyScroll();

    const entry: DialogEntry = {
      id,
      container,
      onClose: () => onCloseRef.current(),
    };
    dialogStack.push(entry);
    ensureKeyListener();

    container.tabIndex = -1;
    chooseInitialFocus(container).focus();

    return () => {
      dialogStack = dialogStack.filter(item => item.id !== id);
      releaseKeyListener();
      unlockBodyScroll();
      const previous = previousFocusRef.current;
      if (previous && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [containerRef, id, isOpen]);
}
