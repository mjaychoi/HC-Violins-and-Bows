'use client';

import React, { useRef, useEffect } from 'react';
import { useOutsideClose } from '@/hooks/useOutsideClose';
import { cn } from '@/utils/classNames';

interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  title?: string;
  ariaLabelledBy?: string;
  dataTestId?: string;
  className?: string;
  contentClassName?: string;
  toggleButtonSelector?: string;
  /**
   * 열릴 때 포커스를 받을 요소의 selector (기본: 첫 번째 input)
   */
  focusSelector?: string;
  /**
   * 닫힐 때 포커스를 복귀할 버튼의 selector
   */
  returnFocusSelector?: string;
}

/**
 * Reusable filter panel wrapper that handles ESC/outer-click close,
 * accessibility semantics, and shared container styling.
 */
export default function FilterPanel({
  isOpen,
  onClose,
  children,
  footer,
  title = 'Filters',
  ariaLabelledBy = 'filters-panel-title',
  dataTestId = 'filters-panel',
  className,
  contentClassName,
  toggleButtonSelector = '[data-filter-button]',
  focusSelector = 'input[type="text"], input[type="search"]',
  returnFocusSelector = toggleButtonSelector,
}: FilterPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  useOutsideClose(panelRef, {
    isOpen,
    onClose,
    ignoreSelector: toggleButtonSelector,
  });

  // ✅ FIXED: 포커스 관리 - 열릴 때 첫 번째 input에 focus, 닫힐 때 toggle 버튼으로 복귀
  useEffect(() => {
    if (!isOpen) {
      // 닫힐 때 포커스 복귀
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      } else if (returnFocusSelector) {
        const returnButton = document.querySelector(
          returnFocusSelector
        ) as HTMLElement;
        returnButton?.focus();
      }
      return;
    }

    // 열릴 때 이전 포커스 저장
    previousFocusRef.current = document.activeElement as HTMLElement;

    // 첫 번째 input에 focus
    const firstInput = panelRef.current?.querySelector(
      focusSelector
    ) as HTMLElement;
    firstInput?.focus();
  }, [isOpen, focusSelector, returnFocusSelector]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      data-testid={dataTestId}
      role="dialog"
      aria-modal="false"
      aria-labelledby={ariaLabelledBy}
      className={cn(
        'mt-3 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden z-30',
        className
      )}
    >
      <h3 id={ariaLabelledBy} className="sr-only">
        {title}
      </h3>
      <div
        className={cn(
          'p-4 max-h-[calc(70vh-80px)] overflow-y-auto',
          contentClassName
        )}
      >
        {children}
      </div>
      {/* Sticky Footer */}
      {footer && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 z-10">
          {footer}
        </div>
      )}
    </div>
  );
}
