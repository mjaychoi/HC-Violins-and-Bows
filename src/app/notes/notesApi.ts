import type { NoteRecord } from '@/types';
import { apiFetch } from '@/utils/apiFetch';
import { handleApiResponse } from '@/utils/handleApiResponse';
import type { Note } from './notesStorage';

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const LEGACY_MIGRATION_KEY_PREFIX = 'note-migrate:';

function generateIdempotencyKey(prefix: string): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Stable create key so a retried legacy note replays instead of duplicating. */
export function legacyNoteMigrationIdempotencyKey(
  legacyNoteId: string
): string {
  const maxIdLength =
    MAX_IDEMPOTENCY_KEY_LENGTH - LEGACY_MIGRATION_KEY_PREFIX.length;
  return `${LEGACY_MIGRATION_KEY_PREFIX}${legacyNoteId.slice(0, maxIdLength)}`;
}

export function noteFromRecord(record: NoteRecord): Note {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    syncedUpdatedAt: record.updated_at,
  };
}

export async function fetchNotes(signal?: AbortSignal): Promise<Note[]> {
  const response = await apiFetch('/api/notes', { signal });
  const data = await handleApiResponse<NoteRecord[]>(
    response,
    'Failed to load notes'
  );
  return data.map(noteFromRecord);
}

export async function createNote(
  input: {
    title: string;
    content: string;
  },
  options?: { signal?: AbortSignal; idempotencyKey?: string }
): Promise<Note> {
  const response = await apiFetch(
    '/api/notes',
    {
      method: 'POST',
      body: JSON.stringify(input),
      signal: options?.signal,
    },
    {
      idempotencyKey:
        options?.idempotencyKey ?? generateIdempotencyKey('note-create'),
    }
  );
  const data = await handleApiResponse<NoteRecord>(
    response,
    'Failed to create note'
  );
  return noteFromRecord(data);
}

export async function updateNote(
  input: {
    id: string;
    title?: string;
    content?: string;
    updated_at: string;
  },
  options?: { keepalive?: boolean }
): Promise<Note> {
  const response = await apiFetch('/api/notes', {
    method: 'PATCH',
    body: JSON.stringify(input),
    keepalive: options?.keepalive,
  });
  const data = await handleApiResponse<NoteRecord>(
    response,
    'Failed to update note'
  );
  return noteFromRecord(data);
}

export async function deleteNote(id: string): Promise<void> {
  const response = await apiFetch(`/api/notes?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await handleApiResponse(response, 'Failed to delete note', {
    allowSuccessWithoutData: true,
  });
}
