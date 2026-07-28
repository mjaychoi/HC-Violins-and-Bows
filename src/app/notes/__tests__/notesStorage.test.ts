import { getNotesStorageKeys, parseStoredNotes } from '../notesStorage';

describe('Notes storage contract', () => {
  it('builds stable, distinct user and organization scoped keys', () => {
    const first = getNotesStorageKeys({
      userId: 'user/a',
      orgId: 'org:1',
      tenantIdentityKey: 'runtime-session-a',
    });
    const replacementSession = getNotesStorageKeys({
      userId: 'user/a',
      orgId: 'org:1',
      tenantIdentityKey: 'runtime-session-b',
    });
    const otherOrg = getNotesStorageKeys({
      userId: 'user/a',
      orgId: 'org:2',
      tenantIdentityKey: 'runtime-session-a',
    });
    const otherUser = getNotesStorageKeys({
      userId: 'user/b',
      orgId: 'org:1',
      tenantIdentityKey: 'runtime-session-a',
    });

    expect(first).toEqual(replacementSession);
    expect(first?.list).toMatch(/^notes:v2:.+:list$/);
    expect(first?.search).toMatch(/^notes:v2:.+:search$/);
    expect(first).not.toEqual(otherOrg);
    expect(first).not.toEqual(otherUser);
  });

  it('fails closed without a complete stable tenant identity', () => {
    expect(
      getNotesStorageKeys({
        userId: 'user-a',
        orgId: null,
        tenantIdentityKey: null,
      })
    ).toBeNull();
  });

  it('accepts only a valid Notes array and normalizes malformed data', () => {
    const valid = [
      {
        id: 'note-1',
        title: 'Valid',
        content: '',
        createdAt: '2026-07-29T00:00:00.000Z',
        updatedAt: '2026-07-29T00:00:00.000Z',
      },
    ];

    expect(parseStoredNotes(JSON.stringify(valid))).toEqual(valid);
    expect(parseStoredNotes('{bad json')).toEqual([]);
    expect(parseStoredNotes(JSON.stringify({ notes: valid }))).toEqual([]);
    expect(
      parseStoredNotes(JSON.stringify([{ ...valid[0], title: 42 }]))
    ).toEqual([]);
  });
});
