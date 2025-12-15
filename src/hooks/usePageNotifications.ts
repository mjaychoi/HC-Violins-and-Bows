/**
 * Hook that combines notification logic with badge click handling
 * Provides a reusable pattern for "tasks → badge click → navigate/toast" flow
 */

import { useRouter } from 'next/navigation';
import { useNotifications } from './useNotifications';
import { useBrowserNotifications } from './useBrowserNotifications';
import type { MaintenanceTask } from '@/types';
import { formatNotificationMessage } from '@/policies/notifications';

export interface UsePageNotificationsOptions {
  /**
   * Maintenance tasks to calculate notifications from
   * IMPORTANT: Tasks should come from a single source of truth (e.g., DataContext)
   * to avoid duplicate fetches when this hook is used on multiple pages
   */
  tasks: MaintenanceTask[];

  /**
   * Custom route to navigate when badge is clicked
   * @default '/calendar'
   */
  navigateTo?: string;

  /**
   * Whether to show a toast message when badge is clicked
   * @default true
   */
  showToastOnClick?: boolean;

  /**
   * Custom toast message formatter
   */
  formatToastMessage?: (
    task: MaintenanceTask,
    type: 'overdue' | 'today' | 'upcoming',
    daysUntil: number
  ) => string;

  /**
   * Number of days to consider for "upcoming" notifications
   * @default 3
   */
  upcomingDays?: number;

  /**
   * Show success toast callback (from useAppFeedback)
   */
  showSuccess?: (message: string) => void;

  /**
   * Custom click handler (overrides default navigate/toast behavior)
   * If provided, onClick will call this instead of default behavior
   */
  customClickHandler?: () => void;

  /**
   * Enable browser notifications (Phase 2)
   * @default true
   */
  enableBrowserNotifications?: boolean;

  /**
   * Browser notification check interval (milliseconds)
   * @default 5 minutes (300000ms)
   */
  browserNotificationInterval?: number;
}

export interface UsePageNotificationsReturn {
  /**
   * Notification counts (overdue, today, upcoming)
   */
  notificationCounts: {
    overdue: number;
    today: number;
    upcoming: number;
  };

  /**
   * Notification badge props (ready to pass to NotificationBadge component)
   */
  notificationBadge: {
    overdue: number;
    upcoming: number;
    today: number;
    onClick: () => void;
  };

  /**
   * Raw notifications array (for advanced use cases)
   */
  notifications: Array<{
    task: MaintenanceTask;
    type: 'overdue' | 'today' | 'upcoming';
    daysUntil: number;
  }>;
}

/**
 * Combines useNotifications with badge click handling
 * Provides a complete notification setup for pages
 *
 * FIXED: Now accepts tasks as parameter instead of calling useMaintenanceTasks() internally
 * This prevents duplicate fetches when multiple pages use this hook
 */
export function usePageNotifications(
  options: UsePageNotificationsOptions
): UsePageNotificationsReturn {
  const router = useRouter();
  const {
    tasks,
    navigateTo = '/calendar',
    showToastOnClick = true,
    formatToastMessage,
    upcomingDays = 3,
    showSuccess,
    enableBrowserNotifications = true,
    browserNotificationInterval,
    customClickHandler,
  } = options;

  // Get notifications (now uses canonical date utils)
  const { notifications, counts } = useNotifications({
    tasks,
    upcomingDays,
  });

  // Browser notifications (Phase 2)
  useBrowserNotifications({
    notifications,
    checkInterval: browserNotificationInterval,
    navigateUrl: navigateTo || '/calendar',
    enabled: enableBrowserNotifications,
  });

  // Handle badge click
  const handleBadgeClick = () => {
    if (notifications.length === 0) return;

    // Show toast if enabled (before custom handler, so toast always shows)
    if (showToastOnClick && showSuccess) {
      const nextTask = notifications[0];
      const message = formatToastMessage
        ? formatToastMessage(nextTask.task, nextTask.type, nextTask.daysUntil)
        : formatNotificationMessage(
            nextTask.task,
            nextTask.type,
            nextTask.daysUntil
          );
      showSuccess(message);
    }

    // Use custom handler if provided (overrides navigation)
    if (customClickHandler) {
      customClickHandler();
      return;
    }

    // Navigate to calendar or specified route (skip if empty string)
    if (navigateTo) {
      router.push(navigateTo);
    }
  };

  return {
    notificationCounts: counts,
    notificationBadge: {
      overdue: counts.overdue,
      upcoming: counts.upcoming,
      today: counts.today,
      onClick: handleBadgeClick,
    },
    notifications,
  };
}
