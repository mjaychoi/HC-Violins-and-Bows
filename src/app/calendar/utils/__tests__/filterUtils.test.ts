import type { MaintenanceTask } from '@/types';
import { filterByDateRange, calculateSummaryStats } from '../filterUtils';
import {
  getCalendarPlacementDate,
  isCalendarPlacementInRange,
} from '@/utils/calendar';

const baseTask: MaintenanceTask = {
  id: 'task-1',
  instrument_id: 'inst-1',
  client_id: null,
  title: 'Setup',
  description: null,
  task_type: 'repair',
  status: 'pending',
  priority: 'medium',
  received_date: '2024-01-01',
  due_date: '2024-01-10',
  personal_due_date: null,
  scheduled_date: '2024-01-05',
  completed_date: null,
  estimated_hours: null,
  actual_hours: null,
  cost: null,
  notes: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

const makeTask = (
  overrides: Partial<MaintenanceTask> & { id: string }
): MaintenanceTask => ({
  ...baseTask,
  due_date: null,
  personal_due_date: null,
  scheduled_date: null,
  received_date: null as unknown as string,
  ...overrides,
});

describe('calendar filterUtils — canonical placement', () => {
  const range = { from: '2024-01-04', to: '2024-01-06' };

  it('filters by single placement date (due wins over scheduled/received)', () => {
    // placement = due_date 2024-01-10 — outside range
    const resultOr = filterByDateRange([baseTask], range, 'OR');
    const resultAnd = filterByDateRange([baseTask], range, 'AND');
    expect(resultOr).toEqual([]);
    expect(resultAnd).toEqual([]);
  });

  it('OR and AND both use the same placement date', () => {
    const inRange: MaintenanceTask = {
      ...baseTask,
      id: 'task-2',
      due_date: '2024-01-05',
      scheduled_date: '2024-01-01',
      received_date: '2023-12-01',
    };

    expect(filterByDateRange([inRange], range, 'OR').map(t => t.id)).toEqual([
      'task-2',
    ]);
    expect(filterByDateRange([inRange], range, 'AND').map(t => t.id)).toEqual([
      'task-2',
    ]);
  });

  it('includes due-only task when placement is in range', () => {
    const task = makeTask({ id: 'due-only', due_date: '2024-01-05' });
    expect(getCalendarPlacementDate(task)).toBe('2024-01-05');
    expect(filterByDateRange([task], range, 'OR').map(t => t.id)).toEqual([
      'due-only',
    ]);
  });

  it('includes personal-only task when placement is in range', () => {
    const task = makeTask({
      id: 'personal-only',
      personal_due_date: '2024-01-06',
    });
    expect(getCalendarPlacementDate(task)).toBe('2024-01-06');
    expect(filterByDateRange([task], range, 'OR').map(t => t.id)).toEqual([
      'personal-only',
    ]);
  });

  it('includes scheduled-only task when placement is in range', () => {
    const task = makeTask({
      id: 'scheduled-only',
      scheduled_date: '2024-01-04',
    });
    expect(getCalendarPlacementDate(task)).toBe('2024-01-04');
    expect(filterByDateRange([task], range, 'OR').map(t => t.id)).toEqual([
      'scheduled-only',
    ]);
  });

  it('includes received-only task when placement is in range', () => {
    const task = makeTask({
      id: 'received-only',
      received_date: '2024-01-05',
    });
    expect(getCalendarPlacementDate(task)).toBe('2024-01-05');
    expect(filterByDateRange([task], range, 'OR').map(t => t.id)).toEqual([
      'received-only',
    ]);
  });

  it('multi-field priority: due > personal > scheduled > received', () => {
    const task = makeTask({
      id: 'priority',
      due_date: '2024-02-01',
      personal_due_date: '2024-01-05',
      scheduled_date: '2024-01-05',
      received_date: '2024-01-05',
    });
    expect(getCalendarPlacementDate(task)).toBe('2024-02-01');
    expect(filterByDateRange([task], range, 'OR')).toEqual([]);
    expect(isCalendarPlacementInRange(task, '2024-02-01', '2024-02-28')).toBe(
      true
    );
  });

  it('excludes tasks with no placement date', () => {
    const task = makeTask({
      id: 'none',
      received_date: '' as unknown as string,
    });
    expect(getCalendarPlacementDate(task)).toBeNull();
    expect(filterByDateRange([task], range, 'OR')).toEqual([]);
  });

  it('returns all tasks when no date range is provided', () => {
    expect(filterByDateRange([baseTask], null, 'OR')).toEqual([baseTask]);
  });

  it('placement, filter, and summary agree on today/month boundaries', () => {
    const today = '2024-06-15';
    jest.useFakeTimers({
      now: new Date(2024, 5, 15, 12, 0, 0).getTime(),
    });

    try {
      const fixtures: MaintenanceTask[] = [
        makeTask({ id: 'overdue', due_date: '2024-06-14', status: 'pending' }),
        makeTask({ id: 'today', due_date: today, status: 'pending' }),
        makeTask({ id: 'upcoming', due_date: '2024-06-18', status: 'pending' }),
        makeTask({
          id: 'month-edge',
          received_date: '2024-06-01',
          status: 'pending',
        }),
        makeTask({
          id: 'completed-today',
          due_date: today,
          status: 'completed',
        }),
        makeTask({ id: 'no-date', received_date: '' as unknown as string }),
      ];

      const monthRange = { from: '2024-06-01', to: '2024-06-30' };
      const filtered = filterByDateRange(fixtures, monthRange, 'OR');
      const filteredIds = filtered.map(t => t.id).sort();

      expect(filteredIds).toEqual(
        ['completed-today', 'month-edge', 'overdue', 'today', 'upcoming'].sort()
      );
      expect(
        filtered.every(t =>
          isCalendarPlacementInRange(t, '2024-06-01', '2024-06-30')
        )
      ).toBe(true);

      const stats = calculateSummaryStats(fixtures);
      // month-edge (2024-06-01) is also before "today" → overdue
      expect(stats.overdue).toBe(2);
      expect(stats.today).toBe(1);
      expect(stats.upcoming).toBe(1);
      expect(stats.total).toBe(fixtures.length);

      for (const task of filtered) {
        const placement = getCalendarPlacementDate(task);
        expect(placement).toBeTruthy();
        expect(placement! >= '2024-06-01' && placement! <= '2024-06-30').toBe(
          true
        );
      }
    } finally {
      jest.useRealTimers();
    }
  });
});
