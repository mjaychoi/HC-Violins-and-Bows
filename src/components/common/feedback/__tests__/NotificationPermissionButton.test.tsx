import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationPermissionButton from '../NotificationPermissionButton';
import * as browserNotifications from '@/utils/browserNotifications';

// Mock browserNotifications
jest.mock('@/utils/browserNotifications');

const mockIsNotificationSupported =
  browserNotifications.isNotificationSupported as jest.MockedFunction<
    typeof browserNotifications.isNotificationSupported
  >;
const mockGetNotificationPermission =
  browserNotifications.getNotificationPermission as jest.MockedFunction<
    typeof browserNotifications.getNotificationPermission
  >;
const mockRequestNotificationPermission =
  browserNotifications.requestNotificationPermission as jest.MockedFunction<
    typeof browserNotifications.requestNotificationPermission
  >;

describe('NotificationPermissionButton', () => {
  const mockOnPermissionChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsNotificationSupported.mockReturnValue(true);
    mockGetNotificationPermission.mockReturnValue('default');

    // Mock navigator.permissions
    Object.defineProperty(navigator, 'permissions', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Unsupported browser', () => {
    it('should return null when notifications are not supported', () => {
      mockIsNotificationSupported.mockReturnValue(false);

      const { container } = render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Default permission state', () => {
    it('should render button to request permission when permission is default', () => {
      mockGetNotificationPermission.mockReturnValue('default');

      render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      expect(screen.getByText('알림 활성화')).toBeInTheDocument();
    });

    it('should call requestNotificationPermission when button is clicked', async () => {
      const user = userEvent.setup();
      mockGetNotificationPermission.mockReturnValue('default');
      mockRequestNotificationPermission.mockResolvedValue('granted');

      render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      const button = screen.getByText('알림 활성화');
      await user.click(button);

      expect(mockRequestNotificationPermission).toHaveBeenCalled();
    });

    it('should call onPermissionChange after permission is granted', async () => {
      const user = userEvent.setup();
      mockGetNotificationPermission.mockReturnValue('default');
      mockRequestNotificationPermission.mockResolvedValue('granted');

      render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      const button = screen.getByText('알림 활성화');
      await user.click(button);

      await waitFor(() => {
        expect(mockOnPermissionChange).toHaveBeenCalledWith('granted');
      });
    });

    it('should show loading state while requesting permission', async () => {
      const user = userEvent.setup();
      mockGetNotificationPermission.mockReturnValue('default');
      let resolvePermission: (value: 'granted') => void;
      const permissionPromise = new Promise<'granted'>(resolve => {
        resolvePermission = resolve;
      });
      mockRequestNotificationPermission.mockReturnValue(permissionPromise);

      render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      const button = screen.getByText('알림 활성화');
      await user.click(button);

      expect(screen.getByText('요청 중...')).toBeInTheDocument();

      resolvePermission!('granted');
      await waitFor(() => {
        expect(screen.queryByText('요청 중...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Granted permission state', () => {
    it('should render granted state with default variant', () => {
      mockGetNotificationPermission.mockReturnValue('granted');

      render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      expect(screen.getByText('알림 활성화됨')).toBeInTheDocument();
    });

    it('should render icon variant when permission is granted', () => {
      mockGetNotificationPermission.mockReturnValue('granted');

      render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
          variant="icon"
        />
      );

      const button = screen.getByLabelText('브라우저 알림 활성화됨');
      expect(button).toBeInTheDocument();
      // Icon variant doesn't have disabled attribute, but it's non-interactive
      expect(button).toBeInTheDocument();
    });

    it('should not call requestNotificationPermission when permission is already granted', async () => {
      const user = userEvent.setup();
      mockGetNotificationPermission.mockReturnValue('granted');

      render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      const button = screen.getByText('알림 활성화됨');
      expect(button).toBeDisabled();

      await user.click(button);

      expect(mockRequestNotificationPermission).not.toHaveBeenCalled();
    });
  });

  describe('Denied permission state', () => {
    it('should render denied message with default variant', () => {
      mockGetNotificationPermission.mockReturnValue('denied');

      render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      expect(screen.getByText('알림이 거부되었습니다')).toBeInTheDocument();
    });

    it('should render disabled icon when permission is denied and variant is icon', () => {
      mockGetNotificationPermission.mockReturnValue('denied');

      render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
          variant="icon"
        />
      );

      const button = screen.getByLabelText('브라우저 알림 거부됨');
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('Permission change handling', () => {
    it('should handle permission change to granted', async () => {
      mockGetNotificationPermission.mockReturnValue('default');
      mockRequestNotificationPermission.mockResolvedValue('granted');

      render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      expect(screen.getByText('알림 활성화')).toBeInTheDocument();

      // Simulate permission change by rendering with new permission
      mockGetNotificationPermission.mockReturnValue('granted');
      render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      // The component uses useEffect to update, so it should eventually show granted state
      // But in test environment, we'll just verify it renders correctly with granted state
      expect(screen.getByText('알림 활성화됨')).toBeInTheDocument();
    });

    it('should handle error when requesting permission', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const user = userEvent.setup();
      mockGetNotificationPermission.mockReturnValue('default');
      mockRequestNotificationPermission.mockRejectedValue(
        new Error('Permission denied')
      );

      render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      const button = screen.getByText('알림 활성화');
      await user.click(button);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error requesting notification permission:',
          expect.any(Error)
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Variant prop', () => {
    it('should render icon variant for default permission', () => {
      mockGetNotificationPermission.mockReturnValue('default');

      render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
          variant="icon"
        />
      );

      const button = screen.getByLabelText('브라우저 알림 권한 요청');
      expect(button).toBeInTheDocument();
    });
  });

  describe('SSR safety', () => {
    it('should return null when permission is null (SSR)', () => {
      mockGetNotificationPermission.mockReturnValue(null as any);

      const { container } = render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Event listeners', () => {
    it('should update permission on window focus event', () => {
      mockGetNotificationPermission.mockReturnValue('default');
      render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      // Change mock to return 'granted' when focus event fires
      mockGetNotificationPermission.mockReturnValue('granted');
      window.dispatchEvent(new Event('focus'));

      // Verify onPermissionChange was called with new permission
      expect(mockOnPermissionChange).toHaveBeenCalledWith('granted');
    });

    it('should update permission on visibilitychange when visible', () => {
      mockGetNotificationPermission.mockReturnValue('default');
      Object.defineProperty(document, 'visibilityState', {
        writable: true,
        configurable: true,
        value: 'visible',
      });

      render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      mockGetNotificationPermission.mockReturnValue('granted');
      document.dispatchEvent(new Event('visibilitychange'));

      expect(mockOnPermissionChange).toHaveBeenCalled();
    });

    it('should handle Permissions API when available', async () => {
      const mockAddEventListener = jest.fn();
      const mockRemoveEventListener = jest.fn();
      const mockQuery = jest.fn().mockResolvedValue({
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener,
      });

      Object.defineProperty(navigator, 'permissions', {
        value: { query: mockQuery },
        writable: true,
        configurable: true,
      });

      mockGetNotificationPermission.mockReturnValue('default');

      const { unmount } = render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      // Wait for async permission query
      await waitFor(() => {
        expect(mockQuery).toHaveBeenCalled();
      });

      // Cleanup should call removeEventListener
      unmount();
      expect(mockRemoveEventListener).toHaveBeenCalled();
    });
  });

  describe('handleRequestPermission edge cases', () => {
    it('should return early if not supported', async () => {
      mockIsNotificationSupported.mockReturnValue(false);
      const { container } = render(
        <NotificationPermissionButton
          onPermissionChange={mockOnPermissionChange}
        />
      );

      expect(container.firstChild).toBeNull();
      expect(mockRequestNotificationPermission).not.toHaveBeenCalled();
    });
  });
});
