/**
 * Browser Notifications Hook
 *
 * 브라우저 알림 권한 관리 및 주기적 알림 체크
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showBrowserNotification,
  type NotificationPermission,
} from '@/utils/browserNotifications';
import type { NotificationTask } from './useNotifications';
import { formatNotificationMessage } from '@/policies/notifications';

interface UseBrowserNotificationsOptions {
  /**
   * 알림을 받을 작업 목록
   */
  notifications: NotificationTask[];

  /**
   * 알림 체크 주기 (밀리초)
   * @default 5분 (300000ms)
   */
  checkInterval?: number;

  /**
   * 알림 클릭 시 이동할 URL
   * @default '/calendar'
   */
  navigateUrl?: string;

  /**
   * 알림 표시 여부 (사용자가 비활성화할 수 있음)
   * @default true
   */
  enabled?: boolean;
}

interface UseBrowserNotificationsReturn {
  /**
   * 현재 알림 권한 상태
   */
  permission: NotificationPermission;

  /**
   * 알림 권한 요청 함수
   */
  requestPermission: () => Promise<void>;

  /**
   * 알림 활성화/비활성화
   */
  enabled: boolean;

  /**
   * 알림 활성화/비활성화 토글
   */
  toggleEnabled: () => void;

  /**
   * 브라우저 알림 지원 여부
   */
  isSupported: boolean;
}

/**
 * 중복 알림 방지를 위한 localStorage 키
 */
const NOTIFIED_TASKS_KEY = 'browser_notified_tasks';
const NOTIFICATION_ENABLED_KEY = 'browser_notifications_enabled';

/**
 * 이미 알림을 받은 작업 ID 목록 가져오기
 */
function getNotifiedTaskIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const stored = localStorage.getItem(NOTIFIED_TASKS_KEY);
    if (!stored) return new Set();

    const ids = JSON.parse(stored) as string[];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

/**
 * 알림을 받은 작업 ID 저장
 */
function saveNotifiedTaskId(taskId: string): void {
  if (typeof window === 'undefined') return;

  try {
    const notified = getNotifiedTaskIds();
    notified.add(taskId);

    // 최대 100개까지만 저장 (메모리 관리)
    const ids = Array.from(notified);
    if (ids.length > 100) {
      ids.splice(0, ids.length - 100);
    }

    localStorage.setItem(NOTIFIED_TASKS_KEY, JSON.stringify(ids));
  } catch (error) {
    console.error('Error saving notified task ID:', error);
  }
}

/**
 * 알림 활성화 상태 가져오기
 */
function getNotificationEnabled(): boolean {
  if (typeof window === 'undefined') return true;

  try {
    const stored = localStorage.getItem(NOTIFICATION_ENABLED_KEY);
    if (stored === null) return true; // 기본값: 활성화
    return JSON.parse(stored) as boolean;
  } catch {
    return true;
  }
}

/**
 * 알림 활성화 상태 저장
 */
function saveNotificationEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(NOTIFICATION_ENABLED_KEY, JSON.stringify(enabled));
  } catch (error) {
    console.error('Error saving notification enabled state:', error);
  }
}

/**
 * 브라우저 알림 훅
 */
export function useBrowserNotifications(
  options: UseBrowserNotificationsOptions
): UseBrowserNotificationsReturn {
  const {
    notifications,
    checkInterval = 5 * 60 * 1000, // 5분
    navigateUrl = '/calendar',
    enabled: enabledProp = true,
  } = options;

  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window === 'undefined') return 'denied';
    return getNotificationPermission();
  });

  const [enabled, setEnabled] = useState(() => {
    return enabledProp && getNotificationEnabled();
  });

  const isSupported = isNotificationSupported();
  const notifiedTasksRef = useRef<Set<string>>(getNotifiedTaskIds());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckRef = useRef<Date>(new Date());

  /**
   * 알림 권한 요청
   */
  const requestPermission = useCallback(async () => {
    const newPermission = await requestNotificationPermission();
    setPermission(newPermission);
  }, []);

  /**
   * 알림 활성화/비활성화 토글
   */
  const toggleEnabled = useCallback(() => {
    const newEnabled = !enabled;
    setEnabled(newEnabled);
    saveNotificationEnabled(newEnabled);
  }, [enabled]);

  /**
   * 새 알림이 있는지 확인하고 표시
   */
  const checkAndShowNotifications = useCallback(() => {
    if (!enabled || permission !== 'granted' || !isSupported) {
      return;
    }

    // 새로 추가된 알림만 필터링 (중복 방지)
    const newNotifications = notifications.filter(
      notification => !notifiedTasksRef.current.has(notification.task.id)
    );

    if (newNotifications.length === 0) {
      return;
    }

    // 우선순위: overdue > today > upcoming
    // 가장 우선순위가 높은 알림 하나만 표시
    const topNotification = newNotifications[0];

    const message = formatNotificationMessage(
      topNotification.task,
      topNotification.type,
      topNotification.daysUntil
    );

    const notification = showBrowserNotification('작업 알림', {
      body: message,
      tag: `task-${topNotification.task.id}`, // 같은 작업의 중복 알림 방지
      data: {
        taskId: topNotification.task.id,
        navigateUrl,
      },
    });

    if (notification) {
      // 알림 클릭 시 해당 페이지로 이동
      notification.onclick = () => {
        window.focus();
        window.location.href = navigateUrl;
        notification.close();
      };

      // 알림을 받은 작업 ID 저장
      saveNotifiedTaskId(topNotification.task.id);
      notifiedTasksRef.current.add(topNotification.task.id);
    }
  }, [enabled, permission, isSupported, notifications, navigateUrl]);

  /**
   * 주기적 체크 설정
   */
  useEffect(() => {
    if (!enabled || permission !== 'granted' || !isSupported) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // 초기 체크
    checkAndShowNotifications();
    lastCheckRef.current = new Date();

    // 주기적 체크
    intervalRef.current = setInterval(() => {
      checkAndShowNotifications();
      lastCheckRef.current = new Date();
    }, checkInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [
    enabled,
    permission,
    isSupported,
    checkInterval,
    checkAndShowNotifications,
  ]);

  /**
   * 알림 목록이 변경될 때마다 체크
   */
  useEffect(() => {
    if (enabled && permission === 'granted' && isSupported) {
      // 알림 목록이 변경되면 즉시 체크
      checkAndShowNotifications();
    }
  }, [
    notifications,
    enabled,
    permission,
    isSupported,
    checkAndShowNotifications,
  ]);

  /**
   * 권한 상태 동기화
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updatePermission = () => {
      setPermission(getNotificationPermission());
    };

    // 권한이 변경될 수 있으므로 주기적으로 확인
    const interval = setInterval(updatePermission, 10000); // 10초마다

    return () => clearInterval(interval);
  }, []);

  return {
    permission,
    requestPermission,
    enabled,
    toggleEnabled,
    isSupported,
  };
}
