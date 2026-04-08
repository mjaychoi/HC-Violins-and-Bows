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

  it('serializes Date values to ISO strings', () => {
    const date = new Date('2026-04-03T12:34:56.000Z');

    expect(
      buildMaintenanceTaskQuery({
        scheduled_date: date,
      })
    ).toBe(`?scheduled_date=${encodeURIComponent(date.toISOString())}`);
  });

  it('uses URLSearchParams encoding for special characters', () => {
    expect(
      buildMaintenanceTaskQuery({
        search: 'bridge repair & setup',
      })
    ).toBe('?search=bridge+repair+%26+setup');
  });
});
