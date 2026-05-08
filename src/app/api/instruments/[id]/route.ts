import { NextRequest } from 'next/server';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import { validateUUID } from '@/utils/inputValidation';
import { executeInstrumentPatch } from '@/app/api/instruments/_shared/executeInstrumentPatch';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isPlainRequestBody(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readJsonBody(
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
      error: 'Invalid JSON request body',
    };
  }

  if (!isPlainRequestBody(body)) {
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

async function patchHandlerInternal(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  const apiPath = `InstrumentsByIdAPI:${id}`;

  return apiHandler(
    request,
    {
      method: 'PATCH',
      path: apiPath,
      context: 'InstrumentsByIdAPI',
    },
    async () => {
      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid instrument ID format', success: false },
          status: 400,
        };
      }

      const parsedBody = await readJsonBody(request);
      if (!parsedBody.ok) {
        return {
          payload: { error: parsedBody.error, success: false },
          status: 400,
        };
      }

      return executeInstrumentPatch(auth, {
        mode: 'byId',
        instrumentId: id,
        body: parsedBody.body,
        apiPath,
      });
    }
  );
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const handler = withSentryRoute(
    withAuthRoute(async (req: NextRequest, auth: AuthContext) => {
      return patchHandlerInternal(req, auth, id);
    })
  );

  return handler(request);
}
