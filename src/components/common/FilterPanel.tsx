'use client';

import React, { useRef } from 'react';
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
}: FilterPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useOutsideClose(panelRef, {
    isOpen,
    onClose,
    ignoreSelector: toggleButtonSelector,
  });

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
          'p-4 max-h-[70vh] overflow-y-auto',
          contentClassName
        )}
      >
        {children}
      </div>
      {footer}
    </div>
  );
}
