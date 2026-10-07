import type { APIRequestContext, APIResponse } from '@playwright/test';
import { randomUUID } from 'crypto';

// Fails any test whose page hits a same-origin /api 5xx or a pageerror,
// even when the test body never asserts that background request.
import { expect, test } from './critical-test';
import {
  MEMBER_AUTH_STATE_PATH,
  getE2EAdminIdentity,
  getE2EOrgId,
} from './e2e-identities';
import { freshSessionStorageState } from './fresh-session-state';
import { assertCookieBackedAuth, waitForPageLoad } from './test-helpers';

/**
 * Notes are private to one user inside an org (RLS + route filters on
 * org_id AND user_id, see src/app/api/notes/route.ts and
 * supabase/migrations/20260807150000_create_notes_table.sql). The route has
 * no role gate, so admins and members can both own notes, and neither can
 * see or mutate the other's notes even though they share the run-scoped org.
 *
 * Contract relied on (src/app/api/notes/route.ts):
 *   - GET  /api/notes            → { data: Note[], count, success } (own notes only)
 *   - POST /api/notes {title,content} → 201 { data: Note }
 *   - PATCH /api/notes {id, title?, content?, updated_at}
 *       → 200 { data: Note } when updated_at matches the row
 *       → 400 NOTE_UPDATED_AT_REQUIRED when updated_at is missing
 *       → 409 NOTES_CONFLICT when the caller's own row has a newer updated_at
 *       → 404 "Note not found" when no row with that id is owned by the caller
 *   - DELETE /api/notes?id=…      → 200 { success } or 404 "Note not found"
 * A foreign-owned note is indistinguishable from a nonexistent one (404, never
 * 409), so the ownership checks compare against a random never-created id.
 */

type NoteRow = {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

const adminState = freshSessionStorageState(getE2EAdminIdentity());

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

async function readJson(response: APIResponse, expectedStatus: number) {
  const body = await response.text();
  expect(response.status(), body).toBe(expectedStatus);
  return JSON.parse(body);
}

async function createNote(
  api: APIRequestContext,
  input: { title: string; content: string },
  idempotencyKey: string
): Promise<NoteRow> {
  const json = await readJson(
    await api.post('/api/notes', {
      headers: { 'Idempotency-Key': idempotencyKey },
      data: input,
    }),
    201
  );
  expect(json.success).toBe(true);
  return json.data as NoteRow;
}

async function listNotes(api: APIRequestContext): Promise<NoteRow[]> {
  const json = await readJson(await api.get('/api/notes'), 200);
  expect(json.success).toBe(true);
  return json.data as NoteRow[];
}

async function findNote(
  api: APIRequestContext,
  id: string
): Promise<NoteRow | undefined> {
  return (await listNotes(api)).find(note => note.id === id);
}

/** Returns the persisted note, failing if the caller cannot list it. */
async function getOwnNote(api: APIRequestContext, id: string) {
  const note = await findNote(api, id);
  expect(note, `note ${id} should be listed for its owner`).toBeTruthy();
  return noteFields(note as NoteRow);
}

/** The persisted fields a note round-trips through every route. */
function noteFields(note: NoteRow): NoteRow {
  return {
    id: note.id,
    org_id: note.org_id,
    user_id: note.user_id,
    title: note.title,
    content: note.content,
    created_at: note.created_at,
    updated_at: note.updated_at,
  };
}

async function expectNotFound(response: APIResponse) {
  const json = await readJson(response, 404);
  expect(json.success).toBe(false);
  expect(json.error).toBe('Note not found');
  expect(json.error_code).toBeUndefined();
  return json as { error: string };
}

/**
 * Tracks notes this test created and deletes any the body did not already
 * delete. Cleanup failures are collected and fail the test when the body
 * passed; when the body already failed they are logged and attached as an
 * annotation so they never mask the original error. Org teardown
 * (cleanupRunScopedFixtures) remains the backstop.
 */
async function withNoteCleanup(
  body: (cleanup: {
    track: (owner: string, api: APIRequestContext, id: string) => void;
    untrack: (id: string) => void;
  }) => Promise<void>
) {
  const pending = new Map<string, { owner: string; api: APIRequestContext }>();
  let bodyError: unknown;
  let bodyFailed = false;
  try {
    await body({
      track: (owner, api, id) => pending.set(id, { owner, api }),
      untrack: id => pending.delete(id),
    });
  } catch (error) {
    bodyFailed = true;
    bodyError = error;
  }

  const failures: string[] = [];
  for (const [id, { owner, api }] of pending) {
    try {
      const response = await api.delete(`/api/notes?id=${id}`);
      // 404 means the note is already gone: nothing left behind.
      if (response.status() !== 200 && response.status() !== 404) {
        failures.push(
          `${owner} DELETE /api/notes?id=${id} -> ${response.status()} ${await response.text()}`
        );
      }
    } catch (error) {
      failures.push(
        `${owner} DELETE /api/notes?id=${id} threw: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const cleanupMessage =
    failures.length > 0 ? `Note cleanup failed:\n${failures.join('\n')}` : null;
  if (bodyFailed) {
    if (cleanupMessage) {
      console.error(cleanupMessage);
      test.info().annotations.push({
        type: 'cleanup-failure',
        description: cleanupMessage,
      });
    }
    throw bodyError;
  }
  if (cleanupMessage) {
    throw new Error(cleanupMessage);
  }
}

test.describe('Notes CRUD and ownership', () => {
  test.use({
    storageState: async ({ baseURL }, provide) =>
      provide(await adminState(baseURL)),
  });

  test(
    'admin creates, lists, updates with optimistic concurrency, and deletes a note',
    {
      tag: '@critical',
    },
    async ({ page }) => {
      await page.goto('/dashboard', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await waitForPageLoad(page, 15000, { skipNetworkIdle: true });
      await assertCookieBackedAuth(page);
      const api = page.request;
      const suffix = uniqueSuffix();

      await withNoteCleanup(async cleanup => {
        const title = `E2E note ${suffix}`;
        const content = `critical note body ${suffix}`;
        const created = await createNote(
          api,
          { title, content },
          `e2e-note-create-${suffix}`
        );
        cleanup.track('admin', api, created.id);
        expect(created.id).toBeTruthy();
        expect(created.title).toBe(title);
        expect(created.content).toBe(content);
        expect(created.org_id).toBe(getE2EOrgId());
        expect(created.updated_at).toBeTruthy();

        // GET/list returns the persisted row.
        const listed = await getOwnNote(api, created.id);
        expect(listed).toEqual(noteFields(created));

        // updated_at is mandatory for an update.
        const missingVersion = await readJson(
          await api.patch('/api/notes', {
            data: { id: created.id, title: `no version ${suffix}` },
          }),
          400
        );
        expect(missingVersion.error_code).toBe('NOTE_UPDATED_AT_REQUIRED');

        // PATCH with the row's current updated_at succeeds and bumps it.
        const updatedTitle = `E2E note updated ${suffix}`;
        const updatedContent = `critical note body updated ${suffix}`;
        const patchedJson = await readJson(
          await api.patch('/api/notes', {
            data: {
              id: created.id,
              title: updatedTitle,
              content: updatedContent,
              updated_at: created.updated_at,
            },
          }),
          200
        );
        const patched = patchedJson.data as NoteRow;
        expect(patched.id).toBe(created.id);
        expect(patched.title).toBe(updatedTitle);
        expect(patched.content).toBe(updatedContent);
        expect(patched.created_at).toBe(created.created_at);
        expect(patched.updated_at).not.toBe(created.updated_at);

        // GET proves the update persisted.
        expect(await getOwnNote(api, created.id)).toEqual(noteFields(patched));

        // A write based on the pre-update updated_at is rejected, not applied.
        const stale = await readJson(
          await api.patch('/api/notes', {
            data: {
              id: created.id,
              content: `stale overwrite ${suffix}`,
              updated_at: created.updated_at,
            },
          }),
          409
        );
        expect(stale.error_code).toBe('NOTES_CONFLICT');
        expect(await getOwnNote(api, created.id)).toEqual(noteFields(patched));

        // The Notes page renders the server-persisted note.
        await page.goto('/notes', { waitUntil: 'domcontentloaded' });
        await waitForPageLoad(page, 20000, { skipNetworkIdle: true });
        await expect(page.getByText(updatedTitle).first()).toBeVisible();

        // DELETE, then GET/list proves absence.
        const deleted = await readJson(
          await api.delete(`/api/notes?id=${created.id}`),
          200
        );
        expect(deleted.success).toBe(true);
        cleanup.untrack(created.id);

        expect(await findNote(api, created.id)).toBeUndefined();
        await expectNotFound(await api.delete(`/api/notes?id=${created.id}`));
      });
    }
  );

  test(
    'notes are private to their owner within the same organization',
    {
      tag: '@critical',
    },
    async ({ page, browser, baseURL }) => {
      await page.goto('/dashboard', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await waitForPageLoad(page, 15000, { skipNetworkIdle: true });
      await assertCookieBackedAuth(page);
      const adminApi = page.request;

      const memberContext = await browser.newContext({
        baseURL,
        storageState: MEMBER_AUTH_STATE_PATH,
      });
      try {
        await assertCookieBackedAuth(memberContext);
        const memberApi = memberContext.request;
        const suffix = uniqueSuffix();

        await withNoteCleanup(async cleanup => {
          const adminNote = await createNote(
            adminApi,
            {
              title: `E2E admin private note ${suffix}`,
              content: `admin private body ${suffix}`,
            },
            `e2e-note-admin-${suffix}`
          );
          cleanup.track('admin', adminApi, adminNote.id);

          // Baseline for "no such note": a random id that was never created.
          const missingId = randomUUID();

          // Member cannot list the admin's note.
          expect(
            (await listNotes(memberApi)).some(note => note.id === adminNote.id)
          ).toBe(false);

          // Member PATCH with the admin note's *current* updated_at gets the
          // same 404 as a nonexistent id (not 409, which would leak existence).
          const foreignPatch = await expectNotFound(
            await memberApi.patch('/api/notes', {
              data: {
                id: adminNote.id,
                title: `tampered ${suffix}`,
                content: `tampered ${suffix}`,
                updated_at: adminNote.updated_at,
              },
            })
          );
          const missingPatch = await expectNotFound(
            await memberApi.patch('/api/notes', {
              data: {
                id: missingId,
                title: `tampered ${suffix}`,
                updated_at: adminNote.updated_at,
              },
            })
          );
          expect(foreignPatch.error).toBe(missingPatch.error);
          expect(await getOwnNote(adminApi, adminNote.id)).toEqual(
            noteFields(adminNote)
          );

          // Member DELETE is likewise a 404 and leaves the note in place.
          const foreignDelete = await expectNotFound(
            await memberApi.delete(`/api/notes?id=${adminNote.id}`)
          );
          const missingDelete = await expectNotFound(
            await memberApi.delete(`/api/notes?id=${missingId}`)
          );
          expect(foreignDelete.error).toBe(missingDelete.error);
          expect(await getOwnNote(adminApi, adminNote.id)).toEqual(
            noteFields(adminNote)
          );

          // Members may own notes too (no role gate on the route), and the
          // boundary holds in the other direction within the same org.
          const memberNote = await createNote(
            memberApi,
            {
              title: `E2E member private note ${suffix}`,
              content: `member private body ${suffix}`,
            },
            `e2e-note-member-${suffix}`
          );
          cleanup.track('member', memberApi, memberNote.id);
          expect(memberNote.org_id).toBe(adminNote.org_id);
          expect(memberNote.user_id).not.toBe(adminNote.user_id);

          expect(
            (await listNotes(adminApi)).some(note => note.id === memberNote.id)
          ).toBe(false);
          await expectNotFound(
            await adminApi.patch('/api/notes', {
              data: {
                id: memberNote.id,
                content: `tampered ${suffix}`,
                updated_at: memberNote.updated_at,
              },
            })
          );
          await expectNotFound(
            await adminApi.delete(`/api/notes?id=${memberNote.id}`)
          );
          expect(await getOwnNote(memberApi, memberNote.id)).toEqual(
            noteFields(memberNote)
          );

          // Each owner can still delete their own note.
          expect(
            (
              await readJson(
                await memberApi.delete(`/api/notes?id=${memberNote.id}`),
                200
              )
            ).success
          ).toBe(true);
          cleanup.untrack(memberNote.id);
          expect(await findNote(memberApi, memberNote.id)).toBeUndefined();

          expect(
            (
              await readJson(
                await adminApi.delete(`/api/notes?id=${adminNote.id}`),
                200
              )
            ).success
          ).toBe(true);
          cleanup.untrack(adminNote.id);
          expect(await findNote(adminApi, adminNote.id)).toBeUndefined();
        });
      } finally {
        await memberContext.close();
      }
    }
  );
});
