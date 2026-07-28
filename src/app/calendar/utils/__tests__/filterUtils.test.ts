import type { MaintenanceTask } from '@/types';
import { filterByDateRange } from '../filterUtils';

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

describe('calendar filterUtils.filterByDateRange', () => {
  const range = { from: '2024-01-04', to: '2024-01-06' };

  it('includes a task when any populated date is in range (OR)', () => {
    const result = filterByDateRange([baseTask], range, 'OR');
    expect(result.map(task => task.id)).toEqual(['task-1']);
  });

  it('requires all populated dates to be in range (AND)', () => {
    const result = filterByDateRange([baseTask], range, 'AND');
    expect(result).toEqual([]);
  });

  it('includes a task under AND when every populated date is in range', () => {
    const allInRangeTask: MaintenanceTask = {
      ...baseTask,
      id: 'task-2',
      received_date: '2024-01-04',
      due_date: '2024-01-06',
      scheduled_date: '2024-01-05',
    };

    const result = filterByDateRange([allInRangeTask], range, 'AND');
    expect(result.map(task => task.id)).toEqual(['task-2']);
  });

  it('ignores null date fields for AND matching', () => {
    const taskWithNulls = {
      ...baseTask,
      id: 'task-3',
      received_date: null,
      due_date: '2024-01-05',
      personal_due_date: null,
      scheduled_date: null,
      completed_date: null,
    } as unknown as MaintenanceTask;

    const result = filterByDateRange([taskWithNulls], range, 'AND');
    expect(result.map(task => task.id)).toEqual(['task-3']);
  });

  it('returns all tasks when no date range is provided', () => {
    expect(filterByDateRange([baseTask], null, 'OR')).toEqual([baseTask]);
  });
});
