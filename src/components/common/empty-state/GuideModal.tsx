'use client';

import React, { useEffect, useRef } from 'react';
import { modalStyles } from '../modals/modalStyles';
import { ModalHeader } from '../modals/ModalHeader';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  steps: string[];
}

export function GuideModal({ isOpen, onClose, title, steps }: GuideModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // ✅ FIXED: Esc 키로 닫기
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // ✅ FIXED: 포커스 트랩 및 초기 포커스
  useEffect(() => {
    if (!isOpen) return;

    // 이전 포커스된 요소 저장
    previousActiveElement.current = document.activeElement as HTMLElement;

    // 모달 열릴 때 close 버튼에 포커스
    closeButtonRef.current?.focus();

    // 포커스 트랩: Tab 키로 모달 밖으로 나가는 것 방지
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => {
      document.removeEventListener('keydown', handleTab);
      // 모달 닫힐 때 이전 포커스 복귀
      previousActiveElement.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={modalStyles.overlay} onClick={onClose}>
      <div
        ref={modalRef}
        className={modalStyles.container}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-modal-title"
      >
        <ModalHeader
          title={title}
          icon="item"
          onClose={onClose}
          titleId="guide-modal-title"
        />
        <div className="px-6 py-4">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 mb-4">
              다음 단계를 따라 첫 악기를 추가해보세요:
            </p>
            <ol className="space-y-3">
              {steps.map((step, index) => (
                <li key={index} className="flex items-start">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold mr-3 mt-0.5">
                    {index + 1}
                  </span>
                  <span className="text-sm text-gray-700 flex-1 pt-0.5">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              시작하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
