import { NextRequest } from 'next/server';
import { errorHandler } from '@/utils/errorHandler';
import {
  validateNote,
  validateNoteArray,
  validateCreateNote,
  validatePartialNote,
  safeValidate,
} from '@/utils/typeGuards';
import { validateUUID } from '@/utils/inputValidation';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { requireOrgContext } from '@/app/api/_utils/withAuthRoute';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import {
  applyScopedRateLimit,
  destructiveMutationRateLimit,
  mutationRateLimit,
  tooManyRequestsApiResult,
} from '@/app/api/_utils/rateLimit';
import type { TablesInsert, TablesUpdate } from '@/types/database';
import type { NoteRecord } from '@/types';
import {
  claimCreateIdempotency,
  clearCreateIdempotency,
  completeCreateIdempotency,
  createRequestHash,
} from '@/app/api/_utils/createIdempotency';

type NoteInsertRow = TablesInsert<'notes'>;
type NoteUpdateRow = TablesUpdate<'notes'>;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readJsonObject(
  request: NextRequest
): Promise<
  { ok: true; body: Record<string, unknown> } | { ok: false; error: string }
> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      error: 'Invalid JSON body',
    };
  }

  if (!isObject(body)) {
    return {
      ok: false,
      error: 'Invalid request body',
    };
  }

  return {
    ok: true,
    body,
  };
}

function toNoteInsertRow(input: {
  title: string;
  content: string;
  org_id: string;
  user_id: string;
}): NoteInsertRow {
  return input;
}

function toNoteUpdateRow(
  input: Partial<Pick<NoteRecord, 'title' | 'content'>>
): NoteUpdateRow {
  return input;
}

async function getHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'NotesAPI',
      context: 'NotesAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      void validateUUID(auth.orgId!);

      const { data, error } = await auth.userSupabase
        .from('notes')
        .select('*', { count: 'exact' })
        .eq('org_id', auth.orgId!)
        .eq('user_id', auth.user.id)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true });

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Fetch notes');
      }

      const validationResult = safeValidate(data || [], validateNoteArray);
      const validationWarning = !validationResult.success;

      return {
        payload: {
          data: data || [],
          count: data?.length || 0,
          success: true,
        },
        metadata: {
          recordCount: data?.length || 0,
          validationWarning,
          scope: {
            enforced: true,
            orgId: auth.orgId,
            userId: auth.user.id,
          },
        },
      };
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));

async function postHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'POST',
      path: 'NotesAPI',
      context: 'NotesAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      void validateUUID(auth.orgId!);

      const rateLimit = await applyScopedRateLimit(mutationRateLimit, {
        orgId: auth.orgId,
        userId: auth.user.id,
        method: 'POST',
        routeKey: 'notes',
        ip: request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
      });
      if (rateLimit.limited) {
        return tooManyRequestsApiResult();
      }

      const bodyResult = await readJsonObject(request);
      if (!bodyResult.ok) {
        return {
          payload: { error: bodyResult.error, success: false },
          status: 400,
        };
      }

      const validationResult = safeValidate(
        bodyResult.body,
        validateCreateNote
      );

      if (!validationResult.success) {
        return {
          payload: {
            error: `Invalid note data: ${validationResult.error}`,
            success: false,
          },
          status: 400,
        };
      }

      const validatedInput = validationResult.data;

      const idempotency = await claimCreateIdempotency(
        request,
        auth,
        'POST:/api/notes',
        createRequestHash(validatedInput)
      );

      if (idempotency.kind === 'replay') {
        return { payload: idempotency.payload, status: 200 };
      }

      if (idempotency.kind === 'conflict') {
        return { payload: idempotency.payload, status: idempotency.status };
      }

      const idempotencyKey =
        idempotency.kind === 'claimed' ? idempotency.idempotencyKey : null;

      const { data, error } = await auth.userSupabase
        .from('notes')
        .insert(
          toNoteInsertRow({
            ...validatedInput,
            org_id: auth.orgId!,
            user_id: auth.user.id,
          })
        )
        .select()
        .single();

      if (error) {
        await clearCreateIdempotency(auth, 'POST:/api/notes', idempotencyKey);

        throw errorHandler.handleSupabaseError(error, 'Create note');
      }

      const createdValidation = safeValidate(data, validateNote);

      if (!createdValidation.success) {
        await clearCreateIdempotency(auth, 'POST:/api/notes', idempotencyKey);

        return {
          status: 422,
          payload: {
            error: 'Created note failed response validation',
            error_code: 'note_response_invalid',
            details: createdValidation.error,
            success: false,
          },
        };
      }

      const createdPayload = createdValidation.data;
      const payload = {
        data: createdPayload,
        success: true,
      };

      await completeCreateIdempotency(
        auth,
        'POST:/api/notes',
        idempotencyKey,
        payload
      );

      return {
        payload,
        status: 201,
        metadata: {
          noteId: createdPayload.id,
        },
      };
    }
  );
}

export const POST = withSentryRoute(withAuthRoute(postHandler));

async function patchHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'PATCH',
      path: 'NotesAPI',
      context: 'NotesAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      void validateUUID(auth.orgId!);

      const rateLimit = await applyScopedRateLimit(mutationRateLimit, {
        orgId: auth.orgId,
        userId: auth.user.id,
        method: 'PATCH',
        routeKey: 'notes',
        ip: request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
      });
      if (rateLimit.limited) {
        return tooManyRequestsApiResult();
      }

      const bodyResult = await readJsonObject(request);
      if (!bodyResult.ok) {
        return {
          payload: { error: bodyResult.error, success: false },
          status: 400,
        };
      }

      const { id, updated_at: rawUpdatedAt, ...updates } = bodyResult.body;

      if (typeof id !== 'string' || !id.trim()) {
        return {
          payload: { error: 'Note ID is required', success: false },
          status: 400,
        };
      }

      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid note ID format', success: false },
          status: 400,
        };
      }

      const validationResult = safeValidate(updates, validatePartialNote);

      if (!validationResult.success) {
        return {
          payload: {
            error: `Invalid update data: ${validationResult.error}`,
            success: false,
          },
          status: 400,
        };
      }

      if (Object.keys(validationResult.data).length === 0) {
        return {
          payload: { error: 'No valid fields to update', success: false },
          status: 400,
        };
      }

      // Optimistic concurrency: the caller must send the row's updated_at as
      // it was when editing started, so a stale write is rejected instead of
      // silently clobbering a concurrent change (mirrors maintenance_tasks).
      if (typeof rawUpdatedAt !== 'string' || !rawUpdatedAt.trim()) {
        return {
          payload: {
            error: 'updated_at is required to update a note',
            error_code: 'NOTE_UPDATED_AT_REQUIRED',
            success: false,
          },
          status: 400,
        };
      }
      const expectedUpdatedAt = rawUpdatedAt.trim();

      const { data, error } = await auth.userSupabase
        .from('notes')
        .update(toNoteUpdateRow(validationResult.data))
        .eq('id', id)
        .eq('org_id', auth.orgId!)
        .eq('user_id', auth.user.id)
        .eq('updated_at', expectedUpdatedAt)
        .select()
        .maybeSingle();

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Update note');
      }

      if (!data) {
        const { data: exists } = await auth.userSupabase
          .from('notes')
          .select('id')
          .eq('id', id)
          .eq('org_id', auth.orgId!)
          .eq('user_id', auth.user.id)
          .maybeSingle();

        if (!exists) {
          return {
            payload: { error: 'Note not found', success: false },
            status: 404,
          };
        }

        return {
          payload: {
            error: 'This note was updated elsewhere. Refresh and try again.',
            error_code: 'NOTES_CONFLICT',
            success: false,
          },
          status: 409,
          metadata: { noteId: id },
        };
      }

      const updatedValidation = safeValidate(data, validateNote);

      if (!updatedValidation.success) {
        return {
          status: 422,
          payload: {
            error: 'Updated note failed response validation',
            error_code: 'note_response_invalid',
            details: updatedValidation.error,
            success: false,
          },
        };
      }

      const updatedPayload = updatedValidation.data;

      return {
        payload: {
          data: updatedPayload,
          success: true,
        },
        metadata: {
          noteId: id,
        },
      };
    }
  );
}

export const PATCH = withSentryRoute(withAuthRoute(patchHandler));

async function deleteHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'DELETE',
      path: 'NotesAPI',
      context: 'NotesAPI',
    },
    async () => {
      const searchParams = request.nextUrl.searchParams;
      const id = searchParams.get('id');

      if (!id) {
        return {
          payload: { error: 'Note ID is required', success: false },
          status: 400,
        };
      }

      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid note ID format', success: false },
          status: 400,
        };
      }

      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      void validateUUID(auth.orgId!);

      const rateLimit = await applyScopedRateLimit(
        destructiveMutationRateLimit,
        {
          orgId: auth.orgId,
          userId: auth.user.id,
          method: 'DELETE',
          routeKey: 'notes',
          ip: request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
        }
      );
      if (rateLimit.limited) {
        return tooManyRequestsApiResult();
      }

      const { error, count } = await auth.userSupabase
        .from('notes')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('org_id', auth.orgId!)
        .eq('user_id', auth.user.id);

      if (error) {
        throw errorHandler.handleSupabaseError(error, 'Delete note');
      }

      if (!count || count === 0) {
        return {
          payload: { error: 'Note not found', success: false },
          status: 404,
          metadata: { noteId: id },
        };
      }

      return {
        payload: { success: true },
        metadata: { noteId: id },
      };
    }
  );
}

export const DELETE = withSentryRoute(withAuthRoute(deleteHandler));
