'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface NotificationBadgeProps {
  overdue: number;
  upcoming: number;
  today: number;
  onClick?: () => void;
}

export default function NotificationBadge({
  overdue,
  upcoming,
  today,
  onClick,
}: NotificationBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const total = overdue + upcoming + today;
  const tooltipId = `notif-tip-${Math.random().toString(36).substr(2, 9)}`;

  // ✅ FIXED: Escape로 tooltip 닫기
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showTooltip) {
        setShowTooltip(false);
        buttonRef.current?.focus();
      }
    };

    if (showTooltip) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [showTooltip]);

  // ✅ FIXED: onClick이 있으면 tooltip 내부 버튼 클릭 시 먼저 tooltip 닫기
  const handleTooltipClick = useCallback(() => {
    setShowTooltip(false);
    onClick?.();
  }, [onClick]);

  if (total === 0) return null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={e => {
          // tooltip 내부로 포커스가 이동하는 경우는 제외
          if (
            !tooltipRef.current?.contains(e.relatedTarget as Node) &&
            !buttonRef.current?.contains(e.relatedTarget as Node)
          ) {
            setShowTooltip(false);
          }
        }}
        className="relative inline-flex items-center justify-center p-2 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label={`알림 ${total}개`}
        aria-describedby={showTooltip ? tooltipId : undefined}
      >
        <svg
          className="w-6 h-6 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {total > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full min-w-[20px]">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {/* Tooltip with details */}
      {showTooltip && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className="px-4 py-2 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">알림</h3>
          </div>
          {overdue > 0 && (
            <div className="px-4 py-2 text-sm flex items-center gap-2 hover:bg-red-50 transition-colors">
              <span className="text-red-600">⚠️</span>
              <span className="text-gray-700">지연된 작업:</span>
              <span className="font-semibold text-red-600">{overdue}개</span>
            </div>
          )}
          {today > 0 && (
            <div className="px-4 py-2 text-sm flex items-center gap-2 hover:bg-blue-50 transition-colors">
              <span className="text-blue-600">📅</span>
              <span className="text-gray-700">오늘 마감:</span>
              <span className="font-semibold text-blue-600">{today}개</span>
            </div>
          )}
          {upcoming > 0 && (
            <div className="px-4 py-2 text-sm flex items-center gap-2 hover:bg-yellow-50 transition-colors">
              <span className="text-yellow-600">⏰</span>
              <span className="text-gray-700">곧 마감 (3일 이내):</span>
              <span className="font-semibold text-yellow-600">
                {upcoming}개
              </span>
            </div>
          )}
          {onClick && (
            <div className="px-4 py-2 border-t border-gray-100">
              <button
                onClick={handleTooltipClick}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium w-full text-left"
              >
                캘린더에서 확인하기 →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
