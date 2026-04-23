import { NextRequest } from 'next/server';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';

import { apiHandler } from '@/app/api/_utils/apiHandler';
import { validateUUID } from '@/utils/inputValidation';
import { executeInstrumentPatch } from '@/app/api/instruments/_shared/executeInstrumentPatch';

const getParams = async (context?: { params?: Promise<{ id: string }> }) => {
  if (!context?.params) {
    return { id: '' };
  }

  return await context.params;
};

async function patchHandlerInternal(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  return apiHandler(
    request,
    {
      method: 'PATCH',
      path: `InstrumentsByIdAPI:${id}`,
      context: 'InstrumentsByIdAPI',
    },
    async () => {
      if (!validateUUID(id)) {
        return {
          payload: { error: 'Invalid instrument ID format', success: false },
          status: 400,
        };
      }

      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object') {
        return {
          payload: { error: 'Invalid request body', success: false },
          status: 400,
        };
      }

      return executeInstrumentPatch(auth, {
        mode: 'byId',
        instrumentId: id,
        body,
        apiPath: `InstrumentsByIdAPI:${id}`,
      });
    }
  );
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await getParams(context);

  const handler = withSentryRoute(
    withAuthRoute(async (req: NextRequest, auth: AuthContext) => {
      return patchHandlerInternal(req, auth, id);
    })
  );

  return handler(request);
}
