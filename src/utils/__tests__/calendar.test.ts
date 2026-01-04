import {
  getTaskDateKey,
  getStatusLabel,
  getPriorityLabel,
  STATUS_LABELS,
  PRIORITY_LABELS,
} from '../calendar';
import type { MaintenanceTask } from '@/types';

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

describe('calendar utilities', () => {
  describe('getTaskDateKey', () => {
    it('should return due_date when available', () => {
      const task = makeTask({
        due_date: '2024-01-15',
        personal_due_date: '2024-01-20',
        scheduled_date: '2024-01-10',
        received_date: '2024-01-01',
      });

      expect(getTaskDateKey(task)).toBe('2024-01-15');
    });

    it('should return personal_due_date when due_date is null', () => {
      const task = makeTask({
        due_date: null,
        personal_due_date: '2024-01-20',
        scheduled_date: '2024-01-10',
        received_date: '2024-01-01',
      });

      expect(getTaskDateKey(task)).toBe('2024-01-20');
    });

    it('should return scheduled_date when due_date and personal_due_date are null', () => {
      const task = makeTask({
        due_date: null,
        personal_due_date: null,
        scheduled_date: '2024-01-10',
        received_date: '2024-01-01',
      });

      expect(getTaskDateKey(task)).toBe('2024-01-10');
    });

    it('should return received_date when only it is available', () => {
      const task = makeTask({
        due_date: null,
        personal_due_date: null,
        scheduled_date: null,
        received_date: '2024-01-01',
      });

      expect(getTaskDateKey(task)).toBe('2024-01-01');
    });

    it('should return null when no dates are available', () => {
      const task = makeTask({
        due_date: null,
        personal_due_date: null,
        scheduled_date: null,
        received_date: '',
      });

      expect(getTaskDateKey(task)).toBeNull();
    });

    it('should prioritize due_date over other dates', () => {
      const task = makeTask({
        due_date: '2024-01-15',
        personal_due_date: '2024-01-25',
        scheduled_date: '2024-01-20',
        received_date: '2024-01-10',
      });

      expect(getTaskDateKey(task)).toBe('2024-01-15');
    });
  });

  describe('getStatusLabel', () => {
    it('should return label for known status', () => {
      expect(getStatusLabel('pending')).toBe('Pending');
      expect(getStatusLabel('in_progress')).toBe('In Progress');
      expect(getStatusLabel('waiting_for_parts')).toBe('Waiting for Parts');
      expect(getStatusLabel('completed')).toBe('Completed');
      expect(getStatusLabel('cancelled')).toBe('Cancelled');
    });

    it('should handle status with different casing', () => {
      expect(getStatusLabel('PENDING')).toBe('Pending');
      expect(getStatusLabel('Pending')).toBe('Pending');
      expect(getStatusLabel('IN_PROGRESS')).toBe('In Progress');
    });

    it('should handle cancelled vs canceled', () => {
      expect(getStatusLabel('cancelled')).toBe('Cancelled');
      expect(getStatusLabel('canceled')).toBe('Cancelled');
    });

    it('should replace underscores with spaces for unknown status', () => {
      expect(getStatusLabel('custom_status')).toBe('custom status');
      expect(getStatusLabel('unknown_status')).toBe('unknown status');
    });

    it('should handle empty string', () => {
      expect(getStatusLabel('')).toBe('');
    });

    it('should handle snake_case status', () => {
      expect(getStatusLabel('waiting_for_parts')).toBe('Waiting for Parts');
      expect(getStatusLabel('in_progress')).toBe('In Progress');
    });
  });

  describe('getPriorityLabel', () => {
    it('should return label for known priority', () => {
      expect(getPriorityLabel('low')).toBe('Low');
      expect(getPriorityLabel('medium')).toBe('Medium');
      expect(getPriorityLabel('high')).toBe('High');
      expect(getPriorityLabel('urgent')).toBe('Urgent');
    });

    it('should capitalize first letter for unknown priority', () => {
      expect(getPriorityLabel('unknown')).toBe('Unknown');
      expect(getPriorityLabel('custom')).toBe('Custom');
    });

    it('should handle empty string', () => {
      expect(getPriorityLabel('')).toBe('');
    });

    it('should handle uppercase priority by capitalizing first letter only', () => {
      // getPriorityLabel checks PRIORITY_LABELS directly, so uppercase keys won't match
      // It falls back to capitalizing first letter only (not lowercasing the rest)
      expect(getPriorityLabel('LOW')).toBe('LOW'); // 'L' + 'OW'
      expect(getPriorityLabel('MEDIUM')).toBe('MEDIUM'); // 'M' + 'EDIUM'
      expect(getPriorityLabel('HIGH')).toBe('HIGH'); // 'H' + 'IGH'
    });

    it('should handle mixed case priority', () => {
      expect(getPriorityLabel('High')).toBe('High');
      expect(getPriorityLabel('Urgent')).toBe('Urgent');
    });
  });

  describe('STATUS_LABELS', () => {
    it('should contain all expected status labels', () => {
      expect(STATUS_LABELS).toHaveProperty('pending', 'Pending');
      expect(STATUS_LABELS).toHaveProperty('in_progress', 'In Progress');
      expect(STATUS_LABELS).toHaveProperty(
        'waiting_for_parts',
        'Waiting for Parts'
      );
      expect(STATUS_LABELS).toHaveProperty('completed', 'Completed');
      expect(STATUS_LABELS).toHaveProperty('cancelled', 'Cancelled');
    });
  });

  describe('PRIORITY_LABELS', () => {
    it('should contain all expected priority labels', () => {
      expect(PRIORITY_LABELS).toHaveProperty('low', 'Low');
      expect(PRIORITY_LABELS).toHaveProperty('medium', 'Medium');
      expect(PRIORITY_LABELS).toHaveProperty('high', 'High');
      expect(PRIORITY_LABELS).toHaveProperty('urgent', 'Urgent');
    });
  });
});
