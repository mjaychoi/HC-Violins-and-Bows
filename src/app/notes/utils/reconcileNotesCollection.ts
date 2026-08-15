import type { Note } from '../notesStorage';

function hasNewerSyncedAt(local: Note, server: Note): boolean {
  if (!local.syncedUpdatedAt) return false;
  if (!server.syncedUpdatedAt) return true;
  return local.syncedUpdatedAt > server.syncedUpdatedAt;
}

/**
 * Merge a server Notes collection over local state without discarding
 * unrelated dirty drafts.
 *
 * Conflicted notes are replaced with the authoritative server row (PR #84
 * recovery). Dirty notes keep their local draft and CAS token. Clean notes
 * refresh from the server, except when the local row already reflects a
 * newer successful save than a stale collection response.
 */
export function reconcileNotesCollection({
  localNotes,
  serverNotes,
  dirtyIds,
  conflictedIds,
}: {
  localNotes: readonly Note[];
  serverNotes: readonly Note[];
  dirtyIds: ReadonlySet<string>;
  conflictedIds: ReadonlySet<string>;
}): Note[] {
  const serverById = new Map(serverNotes.map(note => [note.id, note]));
  const seen = new Set<string>();
  const next: Note[] = [];

  for (const local of localNotes) {
    seen.add(local.id);
    const server = serverById.get(local.id);

    if (conflictedIds.has(local.id)) {
      if (server) {
        next.push(server);
      }
      continue;
    }

    if (dirtyIds.has(local.id)) {
      next.push(local);
      continue;
    }

    if (!server) {
      continue;
    }

    next.push(hasNewerSyncedAt(local, server) ? local : server);
  }

  for (const server of serverNotes) {
    if (!seen.has(server.id)) {
      next.push(server);
    }
  }

  return next;
}
