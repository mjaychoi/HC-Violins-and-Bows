import { renderHook } from '@testing-library/react';
import { usePageNotifications } from '../usePageNotifications';
import { formatNotificationMessage } from '@/policies/notifications';

// Mocks
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import type { MaintenanceTask } from '@/types';

const mockTasks: MaintenanceTask[] = [
  {
    id: '1',
    instrument_id: 'inst-1',
    client_id: null,
    task_type: 'maintenance',
    title: 'Task',
    description: '',
    status: 'pending',
    received_date: new Date().toISOString().split('T')[0],
    scheduled_date: new Date().toISOString().split('T')[0],
    due_date: null,
    personal_due_date: null,
    completed_date: null,
    priority: 'medium',
    estimated_hours: null,
    actual_hours: null,
    cost: null,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

jest.mock('../useMaintenanceTasks', () => ({
  useMaintenanceTasks: () => ({ tasks: mockTasks }),
}));

describe('usePageNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns badge counts and notifications', () => {
    const { result } = renderHook(() =>
      usePageNotifications({ tasks: mockTasks, showToastOnClick: false })
    );
    expect(
      result.current.notificationCounts.today +
        result.current.notificationCounts.overdue +
        result.current.notificationCounts.upcoming
    ).toBeGreaterThanOrEqual(1);
    expect(result.current.notifications.length).toBeGreaterThanOrEqual(1);
    expect(
      result.current.notificationBadge.today +
        result.current.notificationBadge.overdue +
        result.current.notificationBadge.upcoming
    ).toBeGreaterThanOrEqual(1);
  });

  it('invokes toast formatter and navigation on click', () => {
    const showSuccess = jest.fn();
    const format = jest.fn(formatNotificationMessage);

    const { result } = renderHook(() =>
      usePageNotifications({
        tasks: mockTasks,
        showSuccess,
        formatToastMessage: format,
        navigateTo: '/calendar',
      })
    );

    result.current.notificationBadge.onClick();
    expect(format).toHaveBeenCalled();
    expect(showSuccess).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/calendar');
  });

  it('skips navigation when navigateTo is empty string', () => {
    const { result } = renderHook(() =>
      usePageNotifications({
        tasks: mockTasks,
        navigateTo: '',
        showToastOnClick: false,
      })
    );

    result.current.notificationBadge.onClick();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
