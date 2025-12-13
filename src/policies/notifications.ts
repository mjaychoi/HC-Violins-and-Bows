/**
 * Notification Policy
 *
 * 알림 메시지 포맷팅 정책을 정의합니다.
 *
 * @see useMaintenanceTasks - Maintenance tasks 데이터는 API 라우트(`/api/maintenance-tasks`)를 통해 가져옵니다.
 * @see useNotifications - 알림 계산 로직
 * @see usePageNotifications - 페이지별 알림 배지 및 클릭 핸들링
 */

import { MaintenanceTask } from '@/types';

export type NotificationKind = 'overdue' | 'today' | 'upcoming';

/**
 * Maintenance task 알림 메시지를 포맷팅합니다.
 *
 * @param task - Maintenance task 객체
 * @param type - 알림 종류 ('overdue' | 'today' | 'upcoming')
 * @param daysUntil - 마감일까지 남은 일수 (overdue인 경우 지난 일수)
 * @returns 포맷팅된 알림 메시지 문자열
 *
 * @example
 * formatNotificationMessage(task, 'overdue', 3) // "작업명 · D+3"
 * formatNotificationMessage(task, 'today', 0) // "작업명 · Today"
 * formatNotificationMessage(task, 'upcoming', 2) // "작업명 · D-2"
 */
export const formatNotificationMessage = (
  task: MaintenanceTask,
  type: NotificationKind,
  daysUntil: number
): string => {
  const taskTitle = task.title || '다음 작업';
  const dateInfo =
    type === 'overdue'
      ? `D+${daysUntil}`
      : type === 'today'
        ? 'Today'
        : `D-${daysUntil}`;

  return `${taskTitle} · ${dateInfo}`;
};
