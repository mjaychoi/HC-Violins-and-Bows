import type { Note } from '../notesStorage';
import { reconcileNotesCollection } from '../utils/reconcileNotesCollection';

function makeNote(
  id: string,
  title: string,
  content: string,
  syncedUpdatedAt = '2026-07-29T00:00:00.000Z'
): Note {
  return {
    id,
    title,
    content,
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: syncedUpdatedAt,
    syncedUpdatedAt,
  };
}

describe('reconcileNotesCollection', () => {
  const noteA0 = makeNote('a', 'A', 'A0');
  const noteB0 = makeNote('b', 'B', 'B0');
  const noteC0 = makeNote('c', 'C', 'C0');
  const noteD0 = makeNote('d', 'D', 'D0');
  const noteAServer = makeNote(
    'a',
    'A remote',
    'A-server-new',
    '2026-07-29T00:00:05.000Z'
  );
  const noteDServer = makeNote(
    'd',
    'D remote',
    'D-server-new',
    '2026-07-29T00:00:04.000Z'
  );
  const noteBLocal: Note = {
    ...noteB0,
    content: 'B-local',
    updatedAt: '2026-07-29T00:00:03.000Z',
  };
  const noteCLocal: Note = {
    ...noteC0,
    content: 'C-local',
    updatedAt: '2026-07-29T00:00:03.000Z',
  };

  it('replaces only the conflicted note and preserves unrelated dirty drafts', () => {
    const next = reconcileNotesCollection({
      localNotes: [
        { ...noteA0, content: 'A-local' },
        noteBLocal,
        noteCLocal,
        noteD0,
      ],
      serverNotes: [noteAServer, noteB0, noteC0, noteDServer],
      dirtyIds: new Set(['a', 'b', 'c']),
      conflictedIds: new Set(['a']),
    });

    expect(next.map(note => [note.id, note.content])).toEqual([
      ['a', 'A-server-new'],
      ['b', 'B-local'],
      ['c', 'C-local'],
      ['d', 'D-server-new'],
    ]);
    expect(next.find(note => note.id === 'b')?.syncedUpdatedAt).toBe(
      noteB0.syncedUpdatedAt
    );
  });

  it('keeps a dirty local-only draft that the server collection omitted', () => {
    const localOnly: Note = {
      id: 'local-c',
      title: 'Local C',
      content: 'C-draft',
      createdAt: '2026-07-29T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:03.000Z',
    };

    const next = reconcileNotesCollection({
      localNotes: [noteA0, localOnly],
      serverNotes: [noteAServer],
      dirtyIds: new Set(['local-c']),
      conflictedIds: new Set(['a']),
    });

    expect(next.map(note => note.id)).toEqual(['a', 'local-c']);
    expect(next[1].content).toBe('C-draft');
  });

  it('drops a clean local note that the server collection omitted', () => {
    const next = reconcileNotesCollection({
      localNotes: [noteA0, noteB0],
      serverNotes: [noteAServer],
      dirtyIds: new Set(),
      conflictedIds: new Set(['a']),
    });

    expect(next.map(note => note.id)).toEqual(['a']);
  });

  it('appends server notes that were not already local', () => {
    const next = reconcileNotesCollection({
      localNotes: [noteA0],
      serverNotes: [noteAServer, noteDServer],
      dirtyIds: new Set(),
      conflictedIds: new Set(['a']),
    });

    expect(next.map(note => note.id)).toEqual(['a', 'd']);
    expect(next[1].content).toBe('D-server-new');
  });

  it('does not let a stale collection overwrite a newer successful local save', () => {
    const savedB = makeNote('b', 'B', 'B-saved', '2026-07-29T00:00:08.000Z');

    const next = reconcileNotesCollection({
      localNotes: [noteA0, savedB],
      serverNotes: [noteAServer, noteB0],
      dirtyIds: new Set(),
      conflictedIds: new Set(['a']),
    });

    expect(next.find(note => note.id === 'b')).toEqual(savedB);
  });

  it('does not advance a dirty note CAS token from a newer server row', () => {
    const newerServerB = makeNote(
      'b',
      'B remote',
      'B-server-new',
      '2026-07-29T00:00:09.000Z'
    );

    const next = reconcileNotesCollection({
      localNotes: [noteBLocal],
      serverNotes: [newerServerB],
      dirtyIds: new Set(['b']),
      conflictedIds: new Set(),
    });

    expect(next).toEqual([noteBLocal]);
  });

  it('merges by note id rather than array position', () => {
    const next = reconcileNotesCollection({
      localNotes: [noteA0, noteBLocal, noteD0],
      serverNotes: [noteDServer, noteAServer, noteB0],
      dirtyIds: new Set(['b']),
      conflictedIds: new Set(['a']),
    });

    expect(next.map(note => note.id)).toEqual(['a', 'b', 'd']);
    expect(next[0].content).toBe('A-server-new');
    expect(next[1].content).toBe('B-local');
    expect(next[2].content).toBe('D-server-new');
  });

  it('lets a conflicted id win over a dirty flag for that same note', () => {
    const next = reconcileNotesCollection({
      localNotes: [{ ...noteA0, content: 'A-local' }],
      serverNotes: [noteAServer],
      dirtyIds: new Set(['a']),
      conflictedIds: new Set(['a']),
    });

    expect(next).toEqual([noteAServer]);
  });
});
