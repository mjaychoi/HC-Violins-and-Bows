'use client';

import React, { useEffect, useRef } from 'react';
import { classNames } from '@/utils/classNames';
import { useTouchGestures } from '@/hooks/useTouchGestures';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  swipeToClose?: boolean;
}

// ✅ FIXED: 스크롤 잠금 카운터 (중첩 모달 지원)
let scrollLockCount = 0;

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  className = '',
  swipeToClose = true,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Touch gesture for swipe to close (mobile)
  const { setElementRef } = useTouchGestures({
    onSwipeDown: swipeToClose ? onClose : undefined,
    threshold: 100,
    enabled: isOpen && swipeToClose,
  });

  useEffect(() => {
    if (isOpen && modalRef.current) {
      setElementRef(modalRef.current);
    }
  }, [isOpen, setElementRef]);

  // ✅ FIXED: 포커스 트랩 및 스크롤 잠금
  useEffect(() => {
    if (!isOpen) return;

    // 스크롤 잠금 (중첩 모달 지원)
    scrollLockCount++;
    if (scrollLockCount === 1) {
      document.body.style.overflow = 'hidden';
    }

    // 이전 포커스 저장
    previousFocusRef.current = document.activeElement as HTMLElement;

    // 첫 번째 focusable 요소에 포커스
    const focusableElements = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements?.[0] as HTMLElement | undefined;
    firstElement?.focus();

    // 포커스 트랩
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !modalRef.current) return;

      const focusableElements = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => {
        const isDisabled =
          'disabled' in el &&
          (el as HTMLButtonElement | HTMLInputElement).disabled;
        return !isDisabled && el.offsetParent !== null;
      });

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift+Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleTab);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleTab);
      document.removeEventListener('keydown', handleEscape);

      // 스크롤 잠금 해제 (중첩 모달 지원)
      scrollLockCount--;
      if (scrollLockCount === 0) {
        document.body.style.overflow = '';
      }

      // 포커스 복귀
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div
      className={`${classNames.modalOverlay} fixed inset-0 z-50 flex items-center justify-center p-4`}
      onClick={e => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`${sizeClasses[size]} ${className} w-full max-h-[90vh] flex flex-col bg-white rounded-lg shadow-xl overflow-hidden`}
      >
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h3 id="modal-title" className="text-lg font-medium text-gray-900">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition-colors"
            aria-label="Close modal"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content - Scrollable */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
