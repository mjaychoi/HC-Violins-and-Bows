/**
 * Notification Permission Button
 *
 * 브라우저 알림 권한을 요청하는 버튼 컴포넌트
 */

'use client';

import { useState, useEffect } from 'react';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermission,
} from '@/utils/browserNotifications';

interface NotificationPermissionButtonProps {
  /**
   * 버튼 클릭 시 콜백
   */
  onPermissionChange?: (permission: NotificationPermission) => void;

  /**
   * 버튼 스타일 클래스
   */
  className?: string;

  /**
   * 작은 버전 (아이콘만)
   */
  variant?: 'default' | 'icon';
}

export default function NotificationPermissionButton({
  onPermissionChange,
  className = '',
  variant = 'default',
}: NotificationPermissionButtonProps) {
  // ✅ FIXED: 초기 state를 null로 시작해서 hydration 후 값 채우기 (SSR 안전)
  const [permission, setPermission] = useState<NotificationPermission | null>(
    () => {
      if (typeof window === 'undefined') return null;
      return getNotificationPermission();
    }
  );

  const [isRequesting, setIsRequesting] = useState(false);
  const isSupported = isNotificationSupported();

  // ✅ FIXED: 폴링 제거, 이벤트 기반으로 변경
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cleanupPerm: (() => void) | undefined;

    const update = () => {
      const current = getNotificationPermission();
      setPermission(current);
      onPermissionChange?.(current);
    };

    // 초기 권한 확인
    update();

    // 탭이 다시 활성화될 때만 체크
    const onVis = () => {
      if (document.visibilityState === 'visible') update();
    };

    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', onVis);

    // Optional: Permissions API (지원 브라우저에서만)
    (async () => {
      try {
        // ✅ FIXED: any 타입 제거 - Permissions API 타입 정의
        interface PermissionStatusWithEvents {
          addEventListener?: (event: 'change', handler: () => void) => void;
          removeEventListener?: (event: 'change', handler: () => void) => void;
        }
        // Permissions API는 선택적이므로 타입 단언 사용
        const perms = (
          navigator as {
            permissions?: {
              query: (options: {
                name: PermissionName;
              }) => Promise<PermissionStatusWithEvents>;
            };
          }
        ).permissions;
        if (!perms?.query) return;
        const status = await perms.query({
          name: 'notifications' as PermissionName,
        });
        const handler = () => update();
        status.addEventListener?.('change', handler);
        cleanupPerm = () => status.removeEventListener?.('change', handler);
      } catch {
        // ignore - Permissions API not supported
      }
    })();

    return () => {
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', onVis);
      cleanupPerm?.();
    };
  }, [onPermissionChange]);

  const handleRequestPermission = async () => {
    if (!isSupported) {
      return;
    }

    setIsRequesting(true);
    try {
      const newPermission = await requestNotificationPermission();
      setPermission(newPermission);
      onPermissionChange?.(newPermission);
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    } finally {
      setIsRequesting(false);
    }
  };

  if (!isSupported) {
    return null; // 브라우저가 알림을 지원하지 않으면 표시하지 않음
  }

  // ✅ FIXED: hydration 전에는 null 반환 (SSR 안전)
  if (permission === null) {
    return null;
  }

  if (permission === 'granted') {
    // 권한이 이미 허용된 경우, 작은 체크 아이콘만 표시
    if (variant === 'icon') {
      return (
        <button
          type="button"
          className={`p-1.5 rounded-md hover:bg-gray-100 transition-colors ${className}`}
          title="브라우저 알림 활성화됨"
          aria-label="브라우저 알림 활성화됨"
        >
          <svg
            className="w-5 h-5 text-green-600"
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
        </button>
      );
    }

    return (
      <button
        type="button"
        className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm text-green-600 bg-green-50 rounded-md ${className}`}
        disabled
        title="브라우저 알림 활성화됨"
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
        알림 활성화됨
      </button>
    );
  }

  if (permission === 'denied') {
    // 권한이 거부된 경우, 안내 메시지 표시
    if (variant === 'icon') {
      return (
        <button
          type="button"
          className={`p-1.5 rounded-md hover:bg-gray-100 transition-colors ${className}`}
          title="브라우저 알림이 거부되었습니다. 브라우저 설정에서 허용해주세요."
          aria-label="브라우저 알림 거부됨"
        >
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </button>
      );
    }

    return (
      <div className={`text-xs text-gray-500 ${className}`}>
        알림이 거부되었습니다
      </div>
    );
  }

  // permission === 'default' - 권한 요청 가능
  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleRequestPermission}
        disabled={isRequesting}
        className={`p-1.5 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50 ${className}`}
        title="브라우저 알림 권한 요청"
        aria-label="브라우저 알림 권한 요청"
      >
        <svg
          className="w-5 h-5 text-gray-600"
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
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleRequestPermission}
      disabled={isRequesting}
      className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50 ${className}`}
    >
      {isRequesting ? (
        <>
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          요청 중...
        </>
      ) : (
        <>
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
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          알림 활성화
        </>
      )}
    </button>
  );
}
