/**
 * Browser Notification Utilities
 *
 * 브라우저 Notification API를 사용한 데스크톱 알림 기능
 */

/**
 * ✅ FIXED: Notification permission type with 'unsupported' state
 * Distinguishes between "browser doesn't support" vs "user denied"
 * This allows UI to show appropriate messages for each state
 */
export type NotificationPermission =
  | 'default'
  | 'granted'
  | 'denied'
  | 'unsupported';

/**
 * Check if browser notifications are supported
 */
export function isNotificationSupported(): boolean {
  // Keep this safe for SSR/Node by avoiding direct window access
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * ✅ FIXED: Get current notification permission status with 'unsupported' state
 * Returns 'unsupported' if browser doesn't support notifications (not 'denied')
 * This allows UI to differentiate between:
 * - unsupported: "This browser doesn't support notifications"
 * - default: "Request permission"
 * - denied: "Enable in browser settings"
 */
export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermission;
}

/**
 * ✅ FIXED: Request notification permission from user
 * ⚠️ Important: This must be called within a user gesture (button click, etc.)
 * Browsers block automatic permission requests from useEffect or other non-user-initiated contexts
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !isNotificationSupported()) {
    return 'unsupported';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    // Notification.requestPermission() returns 'default' | 'granted' | 'denied'
    // but we need to handle it as our extended type
    return permission as Exclude<NotificationPermission, 'unsupported'>;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return 'denied';
  }
}

/**
 * ✅ FIXED: Show a browser notification
 * Note: icon uses '/favicon.ico' by default, but consider using a dedicated brand icon file
 * if available for better visual consistency
 */
export function showBrowserNotification(
  title: string,
  options?: NotificationOptions
): Notification | null {
  if (typeof window === 'undefined' || !isNotificationSupported()) {
    return null;
  }

  if (Notification.permission !== 'granted') {
    return null;
  }

  try {
    const notification = new Notification(title, {
      icon: '/favicon.ico', // Consider using dedicated brand icon if available
      badge: '/favicon.ico',
      requireInteraction: false,
      ...options,
    });

    // Auto-close after 5 seconds
    setTimeout(() => {
      notification.close();
    }, 5000);

    return notification;
  } catch (error) {
    console.error('Error showing notification:', error);
    return null;
  }
}

/**
 * Close all notifications
 */
export function closeAllNotifications(): void {
  // Notifications are automatically closed after timeout
  // This is a placeholder for future implementation if needed
}
