import {
  getNotesStorageKeys,
  isNotesMigratedFlagSet,
  parseStoredNotes,
  writePendingLegacyNotes,
} from '../notesStorage';

describe('Notes storage contract', () => {
  beforeEach(() => {
    localStorage.clear();
  });
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
    expect(first?.migrated).toMatch(/^notes:v2:.+:migrated-to-server$/);
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

  it('treats only the explicit migrated flag as complete', () => {
    expect(isNotesMigratedFlagSet('1')).toBe(true);
    expect(isNotesMigratedFlagSet(null)).toBe(false);
    expect(isNotesMigratedFlagSet('0')).toBe(false);
  });

  it('rewrites or clears the pending legacy list after each migrated note', () => {
    const key = 'notes:v2:test:list';
    const remaining = [
      {
        id: 'note-2',
        title: 'Still pending',
        content: '',
        createdAt: '2026-07-29T00:00:00.000Z',
        updatedAt: '2026-07-29T00:00:00.000Z',
      },
    ];

    writePendingLegacyNotes(key, remaining);
    expect(parseStoredNotes(localStorage.getItem(key))).toEqual(remaining);

    writePendingLegacyNotes(key, []);
    expect(localStorage.getItem(key)).toBeNull();
  });
});
