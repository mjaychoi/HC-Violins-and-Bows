'use client';

import { useMemo } from 'react';
import { MaintenanceTask } from '@/types';
import { classifyNotification } from '@/utils/tasks/dateUtils';
import { startOfDay } from '@/utils/dateParsing';

export interface NotificationCounts {
  overdue: number;
  today: number;
  upcoming: number; // D-1 ~ D-3
  total: number;
}

export interface NotificationTask {
  task: MaintenanceTask;
  type: 'overdue' | 'today' | 'upcoming';
  daysUntil: number;
}

interface UseNotificationsOptions {
  tasks: MaintenanceTask[];
  upcomingDays?: number; // Default: 3 days
}

/**
 * Calculate notifications from tasks using canonical date utilities
 * FIXED: Uses useMemo instead of useState + useEffect to avoid derived state issues
 * and StrictMode double-execution problems
 */
export function useNotifications({
  tasks,
  upcomingDays = 3,
}: UseNotificationsOptions) {
  // ✅ FIXED: today를 useMemo 내부에서 생성하여 dependency 문제 해결
  // 매 렌더마다 새 Date가 생성되어 dependency가 계속 바뀌는 문제 방지
  const { notifications, counts } = useMemo(() => {
    const today = startOfDay(new Date());
    const upcomingTasks: NotificationTask[] = [];
    const todayTasks: NotificationTask[] = [];
    const overdueTasks: NotificationTask[] = [];

    tasks.forEach(task => {
      const result = classifyNotification(task, today, upcomingDays);
      if (!result || !result.type) return; // Skip null results

      // Type assertion: result.type is guaranteed to be non-null after the check above
      const notification: NotificationTask = {
        task,
        type: result.type as 'overdue' | 'today' | 'upcoming',
        daysUntil: result.daysUntil,
      };

      if (result.type === 'overdue') {
        overdueTasks.push(notification);
      } else if (result.type === 'today') {
        todayTasks.push(notification);
      } else if (result.type === 'upcoming') {
        upcomingTasks.push(notification);
      }
    });

    // 우선순위 정렬: overdue > today > upcoming
    const allNotifications = [...overdueTasks, ...todayTasks, ...upcomingTasks];

    return {
      notifications: allNotifications,
      counts: {
        overdue: overdueTasks.length,
        today: todayTasks.length,
        upcoming: upcomingTasks.length,
        total: allNotifications.length,
      } as NotificationCounts,
    };
    // ✅ FIXED: today를 dependency에서 제거 (내부에서 생성)
  }, [tasks, upcomingDays]);

  return {
    notifications,
    counts,
    // refresh is no longer needed - notifications are derived from tasks
    // If you need to force recalculation, pass a refreshKey to tasks dependency
  };
}

/**
 * @deprecated Use useNotifications().counts instead
 *
 * This function is a wrapper around useNotifications and maintains correct date priority.
 * The underlying bug (scheduled_date prioritized over due_date) has been fixed in useNotifications.
 * Date priority: due_date > personal_due_date > scheduled_date
 *
 * This function is kept for backwards compatibility but should be replaced with useNotifications().counts
 */
export function useNotificationCounts(
  tasks: MaintenanceTask[],
  upcomingDays: number = 3
): NotificationCounts {
  // Use useNotifications for consistent logic
  const { counts } = useNotifications({ tasks, upcomingDays });
  return counts;
}
