import { buildMaintenanceTaskQuery } from '../maintenanceTasks';

describe('buildMaintenanceTaskQuery', () => {
  it('skips undefined and null values', () => {
    expect(
      buildMaintenanceTaskQuery({
        status: 'pending',
        task_type: undefined,
        start_date: null,
      })
    ).toBe('?status=pending');
  });

  it('includes boolean false explicitly', () => {
    expect(
      buildMaintenanceTaskQuery({
        overdue: false,
      })
    ).toBe('?overdue=false');
  });

  it('serializes Date values to YYYY-MM-DD (local calendar day)', () => {
    const date = new Date(2026, 3, 3, 12, 34, 56);

    expect(
      buildMaintenanceTaskQuery({
        scheduled_date: date,
      })
    ).toBe('?scheduled_date=2026-04-03');
  });

  it('uses URLSearchParams encoding for special characters', () => {
    expect(
      buildMaintenanceTaskQuery({
        search: 'bridge repair & setup',
      })
    ).toBe('?search=bridge+repair+%26+setup');
  });
});
