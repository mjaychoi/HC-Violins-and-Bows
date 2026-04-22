import {
  getAllowedMaintenanceTaskNextStatuses,
  validateMaintenanceTaskStatusTransition,
} from '../maintenanceTaskTransitions';

describe('maintenanceTaskTransitions', () => {
  it('getAllowedMaintenanceTaskNextStatuses matches pending rules', () => {
    expect(getAllowedMaintenanceTaskNextStatuses('pending')).toEqual([
      'pending',
      'in_progress',
      'cancelled',
    ]);
  });

  it('completed only allows completed', () => {
    expect(getAllowedMaintenanceTaskNextStatuses('completed')).toEqual([
      'completed',
    ]);
  });

  it('validateMaintenanceTaskStatusTransition rejects completed -> pending', () => {
    expect(
      validateMaintenanceTaskStatusTransition('completed', 'pending')
    ).toBe('Invalid maintenance task status transition: completed -> pending');
  });

  it('validateMaintenanceTaskStatusTransition allows in_progress -> completed', () => {
    expect(
      validateMaintenanceTaskStatusTransition('in_progress', 'completed')
    ).toBeNull();
  });
});
