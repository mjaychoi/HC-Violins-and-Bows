import { renderHook } from '@testing-library/react';
import { useNotifications, useNotificationCounts } from '../useNotifications';
import { MaintenanceTask } from '@/types';
import { addDays, subDays } from 'date-fns';

const baseTask = (overrides: Partial<MaintenanceTask>): MaintenanceTask => ({
  id: 't1',
  instrument_id: 'inst-1',
  client_id: null,
  task_type: 'maintenance',
  title: 'Task',
  description: '',
  status: 'pending',
  received_date: new Date().toISOString(),
  scheduled_date: null,
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
  ...overrides,
});

describe('useNotifications', () => {
  it('computes overdue, today, upcoming with refresh', () => {
    const today = new Date();
    const tasks: MaintenanceTask[] = [
      baseTask({ id: 'over', due_date: subDays(today, 2).toISOString() }),
      baseTask({ id: 'today', due_date: today.toISOString() }),
      baseTask({ id: 'soon', due_date: addDays(today, 2).toISOString() }),
      baseTask({ id: 'later', due_date: addDays(today, 10).toISOString() }), // outside window
      baseTask({
        id: 'done',
        due_date: today.toISOString(),
        status: 'completed',
      }),
    ];

    const { result } = renderHook(() =>
      useNotifications({ tasks, upcomingDays: 3 })
    );

    expect(result.current.counts).toEqual({
      overdue: 1,
      today: 1,
      upcoming: 1,
      total: 3,
    });
    expect(result.current.notifications.map(n => n.task.id)).toEqual([
      'over',
      'today',
      'soon',
    ]);

    // Note: refresh() was removed - notifications are now derived from tasks
    // To test recalculation, pass different tasks to the hook
  });

  it('useNotificationCounts mirrors summary stats logic', () => {
    const today = new Date();
    const tasks: MaintenanceTask[] = [
      baseTask({ id: 'over', scheduled_date: subDays(today, 1).toISOString() }),
      baseTask({ id: 'today', scheduled_date: today.toISOString() }),
      baseTask({
        id: 'upcoming',
        scheduled_date: addDays(today, 2).toISOString(),
      }),
      baseTask({
        id: 'skip',
        scheduled_date: addDays(today, 10).toISOString(),
      }),
      baseTask({
        id: 'done',
        scheduled_date: today.toISOString(),
        status: 'completed',
      }),
    ];

    const { result } = renderHook(() => useNotificationCounts(tasks, 3));

    expect(result.current).toEqual({
      overdue: 1,
      today: 1,
      upcoming: 1,
      total: 3,
    });
  });
});
