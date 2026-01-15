/**
 * Browser Notifications Hook
 *
 * 브라우저 알림 권한 관리 및 주기적 알림 체크
 */

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
 * type 우선순위 계산 (대소문자/표기 흔들림 방어)
 * - overdue > today > upcoming > 기타
 */
function getTypePriority(type: unknown): number {
  const t = String(type ?? '')
    .toLowerCase()
    .trim();

  // 흔한 케이스들: "overdue", "OVERDUE", "Overdue"
  if (t === 'overdue') return 0;

  // "today", "due_today", "due-today"
  if (
    t === 'today' ||
    t === 'due_today' ||
    t === 'due-today' ||
    t === 'due today'
  )
    return 1;

  // "upcoming", "soon"
  if (t === 'upcoming' || t === 'soon') return 2;

  return 99;
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

  // isSupported는 브라우저 환경에서만 의미있지만, 이 파일은 client 전용이라 OK
  const isSupported = useMemo(() => isNotificationSupported(), []);

  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window === 'undefined') return 'denied';
    return getNotificationPermission();
  });

  const [enabled, setEnabled] = useState<boolean>(() => {
    return enabledProp && getNotificationEnabled();
  });

  // enabledProp 변경이 내부 enabled에 반영되도록 동기화
  useEffect(() => {
    setEnabled(enabledProp && getNotificationEnabled());
  }, [enabledProp]);

  const notifiedTasksRef = useRef<Set<string>>(getNotifiedTaskIds());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    setEnabled(prev => {
      const next = !prev;
      saveNotificationEnabled(next);
      return next;
    });
  }, []);

  /**
   * 새 알림이 있는지 확인하고 표시
   */
  const checkAndShowNotifications = useCallback(() => {
    if (!enabled || permission !== 'granted' || !isSupported) return;

    // 새로 추가된 알림만 필터링 (중복 방지)
    const newNotifications = notifications.filter(
      n => !notifiedTasksRef.current.has(n.task.id)
    );
    if (newNotifications.length === 0) return;

    // 우선순위: overdue > today > upcoming
    // 동일 우선순위면 daysUntil 작은 것, 그 다음 task.id로 안정 정렬
    const topNotification = [...newNotifications].sort((a, b) => {
      const pa = getTypePriority(a.type);
      const pb = getTypePriority(b.type);
      if (pa !== pb) return pa - pb;

      const da = Number.isFinite(a.daysUntil)
        ? a.daysUntil
        : Number.POSITIVE_INFINITY;
      const db = Number.isFinite(b.daysUntil)
        ? b.daysUntil
        : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;

      return String(a.task.id).localeCompare(String(b.task.id));
    })[0];

    const message = formatNotificationMessage(
      topNotification.task,
      topNotification.type,
      topNotification.daysUntil
    );

    const notif = showBrowserNotification('작업 알림', {
      body: message,
      tag: `task-${topNotification.task.id}`, // 같은 작업의 중복 알림 방지
      data: {
        taskId: topNotification.task.id,
        navigateUrl,
      },
    });

    if (!notif) return;

    // 알림 클릭 시 해당 페이지로 이동
    notif.onclick = () => {
      window.focus();
      window.location.href = navigateUrl;
      notif.close();
    };

    // 알림을 받은 작업 ID 저장
    saveNotifiedTaskId(topNotification.task.id);
    notifiedTasksRef.current.add(topNotification.task.id);
  }, [enabled, permission, isSupported, notifications, navigateUrl]);

  /**
   * 주기적 체크 설정
   */
  useEffect(() => {
    // 조건 불충족이면 interval 정리
    if (!enabled || permission !== 'granted' || !isSupported) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // 초기 체크
    checkAndShowNotifications();

    // 주기적 체크
    intervalRef.current = setInterval(() => {
      checkAndShowNotifications();
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
   * - polling 대신 focus/visibilitychange로 동기화
   * - visibilitychange는 document.hidden 상태에서도 불릴 수 있으니 permission 조회만 수행
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const sync = () => setPermission(getNotificationPermission());

    // 초기 체크
    sync();

    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);

    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return {
    permission,
    requestPermission,
    enabled,
    toggleEnabled,
    isSupported,
  };
}
