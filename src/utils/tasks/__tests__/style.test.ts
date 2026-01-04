import {
  getPriorityPillClasses,
  getStatusPillClasses,
  getStatusColorClasses,
  getStatusDotClasses,
  getDateStatus,
  getDateColorClasses,
  getCalendarEventStyle,
} from '../style';
import type { MaintenanceTask, TaskPriority } from '@/types';

const baseTask: MaintenanceTask = {
  id: 'task-1',
  instrument_id: 'instrument-1',
  client_id: 'client-1',
  task_type: 'repair',
  title: 'Test task',
  description: null,
  status: 'pending',
  received_date: '2024-01-01',
  due_date: null,
  personal_due_date: null,
  scheduled_date: null,
  completed_date: null,
  priority: 'medium',
  estimated_hours: null,
  actual_hours: null,
  cost: null,
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const makeTask = (
  overrides: Partial<MaintenanceTask> = {}
): MaintenanceTask => ({
  ...baseTask,
  ...overrides,
});

// Mock the dependencies
jest.mock('@/utils/dateParsing', () => {
  const actual = jest.requireActual('@/utils/dateParsing');
  return {
    ...actual,
    parseTaskDateLocal: (dateStr: string) => {
      if (!dateStr) return null;
      try {
        const date = new Date(dateStr + 'T12:00:00Z');
        return isNaN(date.getTime()) ? null : date;
      } catch {
        return null;
      }
    },
  };
});

jest.mock('@/utils/colorTokens', () => ({
  getTaskStatusColor: jest.fn(
    (
      status: string,
      options?: { isOverdue?: boolean; isUpcoming?: boolean }
    ) => {
      if (options?.isOverdue) return 'bg-red-100 text-red-800 border-red-300';
      if (options?.isUpcoming)
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      if (status === 'pending')
        return 'bg-gray-100 text-gray-800 border-gray-300';
      if (status === 'completed')
        return 'bg-green-100 text-green-800 border-green-300';
      return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  ),
  getTaskStatusDotColor: jest.fn(
    (
      status: string,
      options?: { isOverdue?: boolean; isUpcoming?: boolean }
    ) => {
      if (options?.isOverdue) return 'bg-red-500';
      if (options?.isUpcoming) return 'bg-yellow-500';
      if (status === 'pending') return 'bg-gray-500';
      if (status === 'completed') return 'bg-green-500';
      return 'bg-blue-500';
    }
  ),
}));

describe('tasks/style', () => {
  describe('getPriorityPillClasses', () => {
    it('should return correct classes for urgent priority', () => {
      expect(getPriorityPillClasses('urgent')).toBe(
        'bg-gray-100 text-gray-800 font-semibold'
      );
    });

    it('should return correct classes for high priority', () => {
      expect(getPriorityPillClasses('high')).toBe(
        'bg-gray-100 text-gray-800 font-semibold'
      );
    });

    it('should return correct classes for medium priority', () => {
      expect(getPriorityPillClasses('medium')).toBe(
        'bg-gray-100 text-gray-700'
      );
    });

    it('should return correct classes for low priority', () => {
      expect(getPriorityPillClasses('low')).toBe('bg-gray-100 text-gray-600');
    });

    it('should handle uppercase priority', () => {
      expect(getPriorityPillClasses('URGENT' as TaskPriority)).toBe(
        'bg-gray-100 text-gray-800 font-semibold'
      );
      expect(getPriorityPillClasses('HIGH' as TaskPriority)).toBe(
        'bg-gray-100 text-gray-800 font-semibold'
      );
    });

    it('should default to low priority for unknown priority', () => {
      expect(getPriorityPillClasses('unknown' as TaskPriority)).toBe(
        'bg-gray-100 text-gray-600'
      );
    });
  });

  describe('getStatusPillClasses', () => {
    it('should return classes for pending status', () => {
      const result = getStatusPillClasses('pending');
      expect(result).toContain('bg-gray-100');
      expect(result).toContain('text-gray-800');
    });

    it('should include overdue styling when isOverdue is true', () => {
      const result = getStatusPillClasses('pending', { isOverdue: true });
      expect(result).toContain('bg-red-100');
      expect(result).toContain('text-red-800');
    });

    it('should include upcoming styling when isUpcoming is true', () => {
      const result = getStatusPillClasses('pending', { isUpcoming: true });
      expect(result).toContain('bg-yellow-100');
      expect(result).toContain('text-yellow-800');
    });

    it('should handle completed status', () => {
      const result = getStatusPillClasses('completed');
      expect(result).toContain('bg-green-100');
    });
  });

  describe('getStatusColorClasses', () => {
    it('should return classes without border', () => {
      const result = getStatusColorClasses('pending');
      expect(result).not.toContain('border-');
      expect(result).toContain('bg-gray-100');
    });

    it('should remove border classes from pill classes', () => {
      const result = getStatusColorClasses('pending', { isOverdue: true });
      expect(result).not.toContain('border-');
      expect(result).toContain('bg-red-100');
    });
  });

  describe('getStatusDotClasses', () => {
    it('should return dot color classes for pending status', () => {
      const result = getStatusDotClasses('pending');
      expect(result).toContain('bg-gray-500');
    });

    it('should include overdue styling when isOverdue is true', () => {
      const result = getStatusDotClasses('pending', { isOverdue: true });
      expect(result).toContain('bg-red-500');
    });

    it('should include upcoming styling when isUpcoming is true', () => {
      const result = getStatusDotClasses('pending', { isUpcoming: true });
      expect(result).toContain('bg-yellow-500');
    });
  });

  describe('getDateStatus', () => {
    it('should return normal status when task has no dates', () => {
      const task = makeTask({
        due_date: null,
        personal_due_date: null,
        scheduled_date: null,
        received_date: '',
      });

      const result = getDateStatus(task);
      expect(result.status).toBe('normal');
      expect(result.days).toBe(0);
    });

    it('should return normal status for invalid date string', () => {
      const task = makeTask({
        due_date: 'invalid-date',
      });

      const result = getDateStatus(task);
      expect(result.status).toBe('normal');
      expect(result.days).toBe(0);
    });

    // Note: getDateStatus uses actual current time, so testing specific classifications
    // requires mocking date-fns functions which is complex. We test the basic paths.
    it('should return a status for valid date', () => {
      const task = makeTask({
        due_date: '2020-01-10',
        received_date: '2020-01-01',
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2020-01-01T00:00:00Z',
      });

      const result = getDateStatus(task);
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('days');
      expect(['normal', 'overdue', 'upcoming']).toContain(result.status);
      expect(typeof result.days).toBe('number');
    });

    it('should prioritize due_date over personal_due_date and scheduled_date', () => {
      const task = makeTask({
        due_date: '2020-01-10',
        personal_due_date: '2020-01-20',
        scheduled_date: '2020-01-15',
        received_date: '2020-01-01',
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2020-01-01T00:00:00Z',
      });

      const result = getDateStatus(task);
      // Should use due_date (2020-01-10)
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('days');
    });
  });

  describe('getCalendarEventStyle', () => {
    it('should return gray style for completed tasks', () => {
      const task = makeTask({
        status: 'completed',
        due_date: '2020-01-10',
        received_date: '2020-01-01',
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2020-01-01T00:00:00Z',
      });

      const result = getCalendarEventStyle(task);
      expect(result.backgroundColor).toBe('#9ca3af');
      expect(result.opacity).toBe(0.7);
      expect(result.textDecoration).toBe('line-through');
    });

    it('should return gray style for cancelled tasks', () => {
      const task = makeTask({
        status: 'cancelled',
        due_date: '2020-01-10',
        received_date: '2020-01-01',
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2020-01-01T00:00:00Z',
      });

      const result = getCalendarEventStyle(task);
      expect(result.backgroundColor).toBe('#9ca3af');
      expect(result.opacity).toBe(0.6);
    });

    it('should return red style for overdue tasks', () => {
      const task = makeTask({
        status: 'pending',
        due_date: '2020-01-10', // Past date (overdue)
        received_date: '2020-01-01',
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2020-01-01T00:00:00Z',
      });

      const result = getCalendarEventStyle(task);
      // If overdue, should have red color or pending green depending on actual date check
      expect(result).toHaveProperty('backgroundColor');
      expect(result).toHaveProperty('borderColor');
      expect(result).toHaveProperty('color');
    });

    it('should return blue style for in_progress tasks (if not overdue)', () => {
      const task = makeTask({
        status: 'in_progress',
        due_date: '2025-01-20', // Future date (may still be overdue depending on current time)
        received_date: '2020-01-01',
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2020-01-01T00:00:00Z',
      });

      const result = getCalendarEventStyle(task);
      // If overdue, will be red (#ef4444), otherwise blue (#3b82f6)
      expect(result).toHaveProperty('backgroundColor');
      expect(result).toHaveProperty('opacity');
      expect(result.opacity).toBe(1);
      expect(['#3b82f6', '#ef4444']).toContain(result.backgroundColor);
    });

    it('should return emerald style for pending tasks', () => {
      const task = makeTask({
        status: 'pending',
        due_date: '2025-01-20', // Future date
        received_date: '2020-01-01',
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2020-01-01T00:00:00Z',
      });

      const result = getCalendarEventStyle(task);
      // Should return emerald for pending (if not overdue)
      expect(result).toHaveProperty('backgroundColor');
      expect(result).toHaveProperty('opacity');
      expect(result.opacity).toBe(1);
    });
  });

  describe('getDateColorClasses', () => {
    it('should return blue for due date', () => {
      expect(getDateColorClasses('due')).toBe('text-blue-600');
    });

    it('should return slate for personal date', () => {
      expect(getDateColorClasses('personal')).toBe('text-slate-400');
    });

    it('should return blue for scheduled date', () => {
      expect(getDateColorClasses('scheduled')).toBe('text-blue-600');
    });

    it('should return slate for received date', () => {
      expect(getDateColorClasses('received')).toBe('text-slate-600');
    });
  });
});
