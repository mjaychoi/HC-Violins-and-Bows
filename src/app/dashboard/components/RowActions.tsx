'use client';

import { useState, useEffect, useRef } from 'react';

interface RowActionsProps {
  onEdit: () => void;
  onDelete: () => void;
  onDownloadCertificate?: () => void;
  hasCertificate?: boolean | null;
  // Context actions
  onBook?: () => void;
  onSendToMaintenance?: () => void;
  onAttachCertificate?: () => void;
  onSell?: () => void; // 원클릭 판매
  currentStatus?: string;
  hasCertificateField?: boolean;
  // Optional stable ID for menu (for accessibility)
  itemId?: string;
}

export default function RowActions({
  onEdit,
  onDelete,
  onDownloadCertificate,
  hasCertificate = false,
  onBook,
  onSendToMaintenance,
  onAttachCertificate,
  onSell,
  currentStatus,
  hasCertificateField = false,
  itemId,
}: RowActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const firstItemRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = `row-actions-${itemId || 'menu'}`;

  // Handle null/undefined certificate value
  const certificateValue = hasCertificate ?? false;

  // FIXED: Status-based action filtering - only show relevant actions
  const showBook =
    currentStatus !== 'Booked' && currentStatus !== 'Sold' && !!onBook;
  const showMaint =
    currentStatus !== 'Maintenance' &&
    currentStatus !== 'Sold' &&
    !!onSendToMaintenance;
  const showAttach =
    hasCertificateField &&
    !certificateValue &&
    currentStatus !== 'Sold' &&
    !!onAttachCertificate;
  const showSell = currentStatus !== 'Sold' && !!onSell;

  // Status-specific actions
  const showChangeToAvailable = currentStatus === 'Booked' && !!onBook;

  const hasContextActions =
    showBook || showMaint || showAttach || showSell || showChangeToAvailable;

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
    <div className="relative flex justify-end">
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
            className="absolute right-0 z-20 mt-2 w-56 rounded-md border border-gray-200 bg-white shadow-lg"
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

            {/* Context Actions */}
            {showBook && (
              <button
                ref={hasContextActions ? firstItemRef : undefined}
                role="menuitem"
                onClick={e => {
                  e.stopPropagation();
                  onBook();
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
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Book this
              </button>
            )}
            {showChangeToAvailable && (
              <button
                ref={hasContextActions ? firstItemRef : undefined}
                role="menuitem"
                onClick={e => {
                  e.stopPropagation();
                  // Change status to Available (using onBook as a status change handler)
                  onBook();
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-green-600 hover:bg-green-50 transition-colors duration-200"
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
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Change Status → Available
              </button>
            )}
            {showMaint && (
              <button
                ref={!showBook && hasContextActions ? firstItemRef : undefined}
                role="menuitem"
                onClick={e => {
                  e.stopPropagation();
                  onSendToMaintenance();
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-orange-600 hover:bg-orange-50 transition-colors duration-200"
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
                    d="M21.75 6.75a4.5 4.5 0 01-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.025a4.5 4.5 0 01-3.742 3.757c-.805.092-1.623-.1-2.95-.904l-7.152-8.025a4.5 4.5 0 013.742-3.757c.805-.092 1.623.1 2.95.904l7.152 8.025c.091.1.19.19.29.28"
                  />
                </svg>
                Send to maintenance
              </button>
            )}
            {showAttach && (
              <button
                ref={
                  !showBook && !showMaint && hasContextActions
                    ? firstItemRef
                    : undefined
                }
                role="menuitem"
                onClick={e => {
                  e.stopPropagation();
                  onAttachCertificate();
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-green-600 hover:bg-green-50 transition-colors duration-200"
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
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Attach certificate
              </button>
            )}

            {/* 원클릭 판매 버튼 */}
            {showSell && (
              <button
                ref={
                  !showBook && !showMaint && !showAttach && hasContextActions
                    ? firstItemRef
                    : undefined
                }
                role="menuitem"
                onClick={e => {
                  e.stopPropagation();
                  onSell();
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-green-600 hover:bg-green-50 transition-colors duration-200"
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
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Sell
              </button>
            )}

            {/* Divider - only show if context actions are actually rendered */}
            {hasContextActions && (
              <div className="border-t border-gray-200 my-1" />
            )}

            <button
              ref={!hasContextActions ? firstItemRef : undefined}
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
