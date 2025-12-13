import { formatNotificationMessage } from '../notifications';
import { MaintenanceTask } from '@/types';

const task: MaintenanceTask = {
  id: '1',
  instrument_id: 'inst-1',
  client_id: null,
  task_type: 'maintenance',
  title: 'Check strings',
  description: '',
  status: 'pending',
  received_date: '2025-01-01',
  due_date: null,
  personal_due_date: null,
  scheduled_date: null,
  completed_date: null,
  priority: 'medium',
  estimated_hours: null,
  actual_hours: null,
  cost: null,
  notes: null,
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
};

describe('formatNotificationMessage', () => {
  it('formats overdue with D+ days', () => {
    expect(formatNotificationMessage(task, 'overdue', 2)).toBe(
      'Check strings · D+2'
    );
  });

  it('formats today', () => {
    expect(formatNotificationMessage(task, 'today', 0)).toBe(
      'Check strings · Today'
    );
  });

  it('formats upcoming with D- days', () => {
    expect(formatNotificationMessage(task, 'upcoming', 3)).toBe(
      'Check strings · D-3'
    );
  });

  it('falls back to default title when missing', () => {
    expect(formatNotificationMessage({ ...task, title: '' }, 'today', 0)).toBe(
      '다음 작업 · Today'
    );
  });
});
