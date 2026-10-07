'use client';

import React, { useEffect, useId, useRef } from 'react';
import { classNames } from '@/utils/classNames';
import { useTouchGestures } from '@/hooks/useTouchGestures';
import { ModalHeader } from './ModalHeader';
import { modalIconPaths } from './modalStyles';
import { useDialogKeyboard } from './useDialogKeyboard';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  swipeToClose?: boolean;
  titleId?: string;
  icon?: keyof typeof modalIconPaths;
  hideHeader?: boolean;
  padded?: boolean;
  overlayClassName?: string;
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-3xl',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  className = '',
  swipeToClose = true,
  titleId,
  icon,
  hideHeader = false,
  padded = true,
  overlayClassName,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const generatedTitleId = useId();
  const labelledBy = titleId ?? `modal-title${generatedTitleId}`;

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

  useDialogKeyboard({
    isOpen,
    onClose,
    containerRef: modalRef,
  });

  if (!isOpen) return null;

  const overlayClasses =
    overlayClassName ??
    `${classNames.modalOverlay} fixed inset-0 z-50 flex items-center justify-center p-4`;

  return (
    <div
      className={overlayClasses}
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
        aria-labelledby={labelledBy}
        className={`${sizeClasses[size]} ${className} w-full max-h-[90vh] flex flex-col bg-white rounded-lg shadow-xl overflow-hidden`}
      >
        {!hideHeader &&
          (icon ? (
            <ModalHeader
              title={title}
              icon={icon}
              onClose={onClose}
              titleId={labelledBy}
            />
          ) : (
            <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h3 id={labelledBy} className="text-lg font-medium text-gray-900">
                {title}
              </h3>
              <button
                type="button"
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
          ))}

        <div
          ref={contentRef}
          className={
            padded
              ? 'flex-1 overflow-y-auto p-4 sm:p-6'
              : 'flex-1 min-h-0 flex flex-col overflow-hidden'
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}
