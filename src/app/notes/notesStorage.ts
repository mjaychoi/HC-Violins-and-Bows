export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Last successfully synced server `updated_at`, used as the optimistic
   * concurrency token for PATCH. Always set for notes loaded/created from
   * the API; legacy localStorage-only notes omit it until migrated.
   */
  syncedUpdatedAt?: string;
}

export interface NotesStorageKeys {
  list: string;
  search: string;
  migrated: string;
}

const NOTES_STORAGE_VERSION = 'v2';

export function getNotesStorageKeys({
  userId,
  orgId,
  tenantIdentityKey,
}: {
  userId: string | null;
  orgId: string | null;
  tenantIdentityKey: string | null;
}): NotesStorageKeys | null {
  if (!userId || !orgId || !tenantIdentityKey) return null;

  // The canonical runtime tenant key gates stability, while the durable owner
  // remains the required user/organization pair across login sessions.
  const encodedIdentity = encodeURIComponent(JSON.stringify([userId, orgId]));
  const prefix = `notes:${NOTES_STORAGE_VERSION}:${encodedIdentity}`;

  return {
    list: `${prefix}:list`,
    search: `${prefix}:search`,
    migrated: `${prefix}:migrated-to-server`,
  };
}

function isLegacyLocalNote(value: unknown): value is Note {
  if (!value || typeof value !== 'object') return false;

  const note = value as Record<string, unknown>;
  return (
    typeof note.id === 'string' &&
    typeof note.title === 'string' &&
    typeof note.content === 'string' &&
    typeof note.createdAt === 'string' &&
    typeof note.updatedAt === 'string'
  );
}

/** Parse Phase-1 localStorage note arrays for one-time server migration. */
export function parseStoredNotes(value: string | null): Note[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(isLegacyLocalNote)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export function isNotesMigratedFlagSet(value: string | null): boolean {
  return value === '1';
}

/**
 * Persist the remaining Phase-1 local notes after a successful per-note
 * migration. An empty list clears the pending key so a later visit can
 * mark migration complete.
 */
export function writePendingLegacyNotes(
  listKey: string,
  remaining: Note[]
): void {
  if (remaining.length === 0) {
    localStorage.removeItem(listKey);
    return;
  }
  localStorage.setItem(listKey, JSON.stringify(remaining));
}
