import { buildReservedStateUpdate } from '../instrumentReservedState';

describe('buildReservedStateUpdate', () => {
  const userId = 'user-1';

  it('requires a reserved_reason for a new non-Reserved -> Reserved transition', () => {
    const result = buildReservedStateUpdate(
      'Available',
      null,
      null,
      null,
      { status: 'Reserved' },
      userId
    );

    expect(result.error).toBe('Reserved status requires a reserved_reason.');
  });

  it('accepts a patched reserved_reason on a new reservation', () => {
    const result = buildReservedStateUpdate(
      'Available',
      null,
      null,
      null,
      { status: 'Reserved', reserved_reason: 'Held for client' },
      userId
    );

    expect(result.error).toBeUndefined();
    expect(result.update.reserved_reason).toBe('Held for client');
    expect(result.update.reserved_by_user_id).toBe(userId);
    expect(result.update.reserved_connection_id).toBeNull();
  });

  it('reuses the existing reserved_reason on a Reserved -> Reserved save that does not patch it', () => {
    const result = buildReservedStateUpdate(
      'Reserved',
      'Existing reason',
      'other-user',
      null,
      { status: 'Reserved', note: 'unrelated edit' },
      userId
    );

    expect(result.error).toBeUndefined();
    expect(result.update.reserved_reason).toBe('Existing reason');
  });

  it('fails a Reserved -> Reserved save when there is no existing reason and none is patched (legacy NULL-reason row)', () => {
    const result = buildReservedStateUpdate(
      'Reserved',
      null,
      null,
      null,
      { status: 'Reserved', note: 'unrelated edit' },
      userId
    );

    expect(result.error).toBe('Reserved status requires a reserved_reason.');
  });

  it('clears reservation metadata when leaving Reserved for Available', () => {
    const result = buildReservedStateUpdate(
      'Reserved',
      'Existing reason',
      'user-1',
      'conn-1',
      { status: 'Available' },
      userId
    );

    expect(result.error).toBeUndefined();
    expect(result.update.reserved_reason).toBeNull();
    expect(result.update.reserved_by_user_id).toBeNull();
    expect(result.update.reserved_connection_id).toBeNull();
  });

  it('clears reservation metadata for a legacy NULL-reason row leaving Reserved for Available', () => {
    const result = buildReservedStateUpdate(
      'Reserved',
      null,
      null,
      null,
      { status: 'Available' },
      userId
    );

    expect(result.error).toBeUndefined();
    expect(result.update.reserved_reason).toBeNull();
    expect(result.update.reserved_by_user_id).toBeNull();
    expect(result.update.reserved_connection_id).toBeNull();
  });

  it('carries reservation metadata forward when moving from Reserved to Booked', () => {
    const result = buildReservedStateUpdate(
      'Reserved',
      'Existing reason',
      'user-1',
      'conn-1',
      { status: 'Booked' },
      userId
    );

    expect(result.error).toBeUndefined();
    expect(result.update.reserved_reason).toBe('Existing reason');
    expect(result.update.reserved_by_user_id).toBe('user-1');
    expect(result.update.reserved_connection_id).toBe('conn-1');
  });

  it('rejects patching reserved_reason while not landing on Reserved', () => {
    const result = buildReservedStateUpdate(
      'Available',
      null,
      null,
      null,
      { status: 'Booked', reserved_reason: 'Should not be allowed' },
      userId
    );

    expect(result.error).toBe(
      'reserved_reason can only be changed while the instrument is Reserved.'
    );
  });
});
