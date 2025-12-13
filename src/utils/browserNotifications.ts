/**
 * Browser Notification Utilities
 * 
 * 브라우저 Notification API를 사용한 데스크톱 알림 기능
 */

export type NotificationPermission = 'default' | 'granted' | 'denied';

/**
 * Check if browser notifications are supported
 */
export function isNotificationSupported(): boolean {
  // Keep this safe for SSR/Node by avoiding direct window access
  return typeof Notification !== 'undefined' && typeof window !== 'undefined';
}

/**
 * Get current notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !isNotificationSupported()) {
    return 'denied';
  }
  return Notification.permission as NotificationPermission;
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !isNotificationSupported()) {
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission as NotificationPermission;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return 'denied';
  }
}

/**
 * Show a browser notification
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
      icon: '/favicon.ico',
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
