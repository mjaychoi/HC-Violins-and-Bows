export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotesStorageKeys {
  list: string;
  search: string;
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
  };
}

function isNote(value: unknown): value is Note {
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

export function parseStoredNotes(value: string | null): Note[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(isNote) ? parsed : [];
  } catch {
    return [];
  }
}
