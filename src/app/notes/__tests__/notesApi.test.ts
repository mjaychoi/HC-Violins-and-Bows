import type { NoteRecord } from '@/types';
import { apiFetch } from '@/utils/apiFetch';
import {
  createNote,
  deleteNote,
  fetchNotes,
  legacyNoteMigrationIdempotencyKey,
  noteFromRecord,
  updateNote,
} from '../notesApi';

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: jest.fn(),
}));

const apiFetchMock = apiFetch as jest.MockedFunction<typeof apiFetch>;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: () => 'application/json',
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone() {
      return jsonResponse(body, status);
    },
  } as unknown as Response;
}

describe('notesApi', () => {
  const record: NoteRecord = {
    id: '11111111-1111-1111-1111-111111111111',
    org_id: '22222222-2222-2222-2222-222222222222',
    user_id: '33333333-3333-3333-3333-333333333333',
    title: 'Hello',
    content: 'World',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-02T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps a NoteRecord into the UI Note shape', () => {
    expect(noteFromRecord(record)).toEqual({
      id: record.id,
      title: record.title,
      content: record.content,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      syncedUpdatedAt: record.updated_at,
    });
  });

  it('fetches and maps notes', async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse({ data: [record], success: true })
    );

    await expect(fetchNotes()).resolves.toEqual([noteFromRecord(record)]);
    expect(apiFetchMock).toHaveBeenCalledWith('/api/notes', {
      signal: undefined,
    });
  });

  it('creates a note', async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse({ data: record, success: true }, 201)
    );

    await expect(
      createNote({ title: 'Hello', content: 'World' })
    ).resolves.toEqual(noteFromRecord(record));
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/notes',
      expect.objectContaining({ method: 'POST' }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
  });

  it('uses a caller-supplied idempotency key and abort signal for create', async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse({ data: record, success: true }, 201)
    );
    const controller = new AbortController();

    await createNote(
      { title: 'Hello', content: 'World' },
      {
        signal: controller.signal,
        idempotencyKey: 'note-migrate:local-1',
      }
    );

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/notes',
      expect.objectContaining({
        method: 'POST',
        signal: controller.signal,
      }),
      expect.objectContaining({ idempotencyKey: 'note-migrate:local-1' })
    );
  });

  it('builds a stable truncated migration idempotency key per legacy note', () => {
    expect(legacyNoteMigrationIdempotencyKey('local-1')).toBe(
      'note-migrate:local-1'
    );
    expect(legacyNoteMigrationIdempotencyKey('local-1')).toBe(
      legacyNoteMigrationIdempotencyKey('local-1')
    );
    expect(legacyNoteMigrationIdempotencyKey('a'.repeat(300)).length).toBe(200);
  });

  it('updates a note with updated_at concurrency token', async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse({ data: record, success: true })
    );

    await expect(
      updateNote({
        id: record.id,
        title: 'Hello',
        content: 'World',
        updated_at: record.updated_at,
      })
    ).resolves.toEqual(noteFromRecord(record));
  });

  it('deletes a note by id', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ success: true }));

    await expect(deleteNote(record.id)).resolves.toBeUndefined();
    expect(apiFetchMock).toHaveBeenCalledWith(
      `/api/notes?id=${record.id}`,
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
