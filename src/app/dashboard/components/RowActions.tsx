'use client';

import React, { useState, useEffect, useRef } from 'react';

interface RowActionsProps {
  onEdit: () => void;
  onDelete: () => void;
  onDownloadCertificate?: () => void;
  hasCertificate?: boolean;
  currentStatus?: string;
  // Optional stable ID for menu (for accessibility)
  itemId?: string;
}

function RowActions({
  onEdit,
  onDelete,
  onDownloadCertificate,
  hasCertificate,
  currentStatus,
  itemId,
}: RowActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const firstItemRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = `row-actions-${itemId || 'menu'}`;

  const certificateValue = Boolean(hasCertificate);

  // FIXED: Close menu on Escape key press and focus management
  useEffect(() => {
    if (!isOpen) {
      // Return focus to trigger when menu closes
      triggerRef.current?.focus();
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    // Focus first menu item when menu opens
    firstItemRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  return (
    <div className="relative flex justify-end" style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        onClick={e => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-2 rounded-md hover:bg-gray-50 transition-colors duration-200"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-expanded={isOpen}
      >
        <svg
          className="w-4 h-4 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
          />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div
            id={menuId}
            role="menu"
            className="absolute left-0 z-20 mt-2 w-56 rounded-md border border-gray-200 bg-white shadow-lg origin-top-left"
          >
            {/* Current Status Header */}
            {currentStatus && (
              <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                <div className="text-xs font-medium text-gray-500 mb-1">
                  Current Status
                </div>
                <div className="text-sm font-semibold text-gray-900">
                  {currentStatus}
                </div>
              </div>
            )}

            <button
              ref={firstItemRef}
              role="menuitem"
              onClick={() => {
                onEdit();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-200"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Edit
            </button>
            {certificateValue && onDownloadCertificate && (
              <button
                role="menuitem"
                onClick={e => {
                  e.stopPropagation();
                  onDownloadCertificate();
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors duration-200"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Certificate
              </button>
            )}
            <button
              role="menuitem"
              onClick={e => {
                e.stopPropagation();
                onDelete();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors duration-200"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default React.memo(RowActions);
