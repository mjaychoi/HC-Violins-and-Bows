import {
  fingerprintClientCreateWithConnections,
  fingerprintPlainClientCreate,
  resolveClientCreateOperation,
} from '../clientCreateOperation';

describe('client create operation identity', () => {
  const ada = {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    contact_number: null,
    tags: [] as string[],
    interest: '',
    note: '',
  };

  it('treats re-rendered objects with the same request content as one payload', () => {
    const a = { ...ada };
    const b = { ...ada };

    expect(a).not.toBe(b);
    expect(fingerprintPlainClientCreate(a)).toBe(
      fingerprintPlainClientCreate(b)
    );
  });

  it('ignores whitespace that the server also trims', () => {
    expect(
      fingerprintPlainClientCreate({
        ...ada,
        first_name: 'Ada ',
        email: ' ada@example.com ',
      })
    ).toBe(fingerprintPlainClientCreate(ada));
  });

  it('reuses the pending key for an equivalent payload and mints a new key after a material change', () => {
    const first = resolveClientCreateOperation(
      null,
      fingerprintPlainClientCreate(ada),
      'client-create'
    );
    const retry = resolveClientCreateOperation(
      first,
      fingerprintPlainClientCreate({ ...ada }),
      'client-create'
    );
    const changed = resolveClientCreateOperation(
      retry,
      fingerprintPlainClientCreate({ ...ada, note: 'Changed' }),
      'client-create'
    );

    expect(retry.key).toBe(first.key);
    expect(changed.key).not.toBe(first.key);
  });

  it('includes sorted instrument links in the with-connections fingerprint', () => {
    const linksA = [
      {
        instrument_id: 'b-id',
        relationship_type: 'Interested',
        notes: null,
      },
      {
        instrument_id: 'a-id',
        relationship_type: 'Interested',
        notes: null,
      },
    ];
    const linksB = [...linksA].reverse();

    expect(fingerprintClientCreateWithConnections(ada, linksA)).toBe(
      fingerprintClientCreateWithConnections(ada, linksB)
    );
    expect(fingerprintClientCreateWithConnections(ada, linksA)).not.toBe(
      fingerprintPlainClientCreate(ada)
    );
  });
});
