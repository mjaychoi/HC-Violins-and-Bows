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

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
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
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className={`${sizeClasses[size]} ${className} w-full max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-xl`}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center z-10">
              <h3 className="text-lg font-medium text-gray-900">{title}</h3>
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

          {/* Content */}
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
