import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showBrowserNotification,
  closeAllNotifications,
} from '../browserNotifications';

// Mock Notification API
const mockNotification = {
  close: jest.fn(),
};

const mockRequestPermission = jest.fn();

describe('browserNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset window.Notification
    delete (global as { Notification?: unknown }).Notification;
    delete (global as { window?: unknown }).window;
  });

  describe('isNotificationSupported', () => {
    it('should return false when Notification is undefined', () => {
      const originalNotification = (global as { Notification?: unknown })
        .Notification;
      delete (global as { Notification?: unknown }).Notification;
      expect(isNotificationSupported()).toBe(false);
      (global as { Notification?: unknown }).Notification =
        originalNotification;
    });

    it('should return true when Notification and window are available', () => {
      // In jsdom, window is always available, so we just check Notification
      (global as { Notification?: unknown }).Notification =
        {} as typeof Notification;
      expect(isNotificationSupported()).toBe(true);
    });
  });

  describe('getNotificationPermission', () => {
    it('should return denied when window is undefined', () => {
      expect(getNotificationPermission()).toBe('unsupported');
    });

    it('should return denied when Notification is not supported', () => {
      (global as { window?: unknown }).window = {};
      expect(getNotificationPermission()).toBe('unsupported');
    });

    it('should return current permission status', () => {
      (global as { window?: unknown }).window = {};
      (global as { Notification?: unknown }).Notification = {
        permission: 'granted',
      } as unknown as Notification;
      expect(getNotificationPermission()).toBe('granted');
    });
  });

  describe('requestNotificationPermission', () => {
    it('should return denied when window is undefined', async () => {
      const result = await requestNotificationPermission();
      expect(result).toBe('unsupported');
    });

    it('should return denied when Notification is not supported', async () => {
      (global as { window?: unknown }).window = {};
      const result = await requestNotificationPermission();
      expect(result).toBe('unsupported');
    });

    it('should return granted when permission is already granted', async () => {
      (global as { window?: unknown }).window = {};
      (global as { Notification?: unknown }).Notification = {
        permission: 'granted',
      } as unknown as Notification;
      const result = await requestNotificationPermission();
      expect(result).toBe('granted');
    });

    it('should return denied when permission is already denied', async () => {
      (global as { window?: unknown }).window = {};
      (global as { Notification?: unknown }).Notification = {
        permission: 'denied',
      } as unknown as Notification;
      const result = await requestNotificationPermission();
      expect(result).toBe('denied');
    });

    it('should request permission and return result', async () => {
      (global as { window?: unknown }).window = {};
      mockRequestPermission.mockResolvedValue('granted');
      (global as { Notification?: unknown }).Notification = {
        permission: 'default',
        requestPermission: mockRequestPermission,
      } as unknown as Notification;
      const result = await requestNotificationPermission();
      expect(result).toBe('granted');
      expect(mockRequestPermission).toHaveBeenCalled();
    });

    it('should return denied on error', async () => {
      (global as { window?: unknown }).window = {};
      mockRequestPermission.mockRejectedValue(new Error('Permission denied'));
      (global as { Notification?: unknown }).Notification = {
        permission: 'default',
        requestPermission: mockRequestPermission,
      } as unknown as Notification;
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await requestNotificationPermission();
      expect(result).toBe('denied');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('showBrowserNotification', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return null when window is undefined', () => {
      const result = showBrowserNotification('Test');
      expect(result).toBeNull();
    });

    it('should return null when Notification is not supported', () => {
      (global as { window?: unknown }).window = {};
      const result = showBrowserNotification('Test');
      expect(result).toBeNull();
    });

    it('should return null when permission is not granted', () => {
      (global as { window?: unknown }).window = {};
      (global as { Notification?: unknown }).Notification = {
        permission: 'denied',
      } as unknown as Notification;
      const result = showBrowserNotification('Test');
      expect(result).toBeNull();
    });

    it('should show notification when permission is granted', () => {
      (global as { window?: unknown }).window = {};
      const mockNotificationConstructor = jest
        .fn()
        .mockReturnValue(mockNotification);
      (global as { Notification?: unknown }).Notification =
        mockNotificationConstructor as unknown as typeof Notification;
      (Notification as unknown as { permission: string }).permission =
        'granted';

      const result = showBrowserNotification('Test Title', {
        body: 'Test body',
      });

      expect(result).toBe(mockNotification);
      expect(mockNotificationConstructor).toHaveBeenCalledWith('Test Title', {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        requireInteraction: false,
        body: 'Test body',
      });
    });

    it('should auto-close notification after 5 seconds', () => {
      (global as { window?: unknown }).window = {};
      const mockNotificationConstructor = jest
        .fn()
        .mockReturnValue(mockNotification);
      (global as { Notification?: unknown }).Notification =
        mockNotificationConstructor as unknown as typeof Notification;
      (Notification as unknown as { permission: string }).permission =
        'granted';

      showBrowserNotification('Test');

      expect(mockNotification.close).not.toHaveBeenCalled();
      jest.advanceTimersByTime(5000);
      expect(mockNotification.close).toHaveBeenCalled();
    });

    it('should return null on error', () => {
      (global as { window?: unknown }).window = {};
      const mockNotificationConstructor = jest.fn().mockImplementation(() => {
        throw new Error('Notification error');
      });
      (global as { Notification?: unknown }).Notification =
        mockNotificationConstructor as unknown as typeof Notification;
      (Notification as unknown as { permission: string }).permission =
        'granted';

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = showBrowserNotification('Test');
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('closeAllNotifications', () => {
    it('should be callable without errors', () => {
      expect(() => closeAllNotifications()).not.toThrow();
    });
  });
});
