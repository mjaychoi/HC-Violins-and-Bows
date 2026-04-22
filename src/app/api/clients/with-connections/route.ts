import { NextRequest } from 'next/server';
import type { Json } from '@/types/database';
import { errorHandler } from '@/utils/errorHandler';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import {
  requireAdmin,
  requireOrgContext,
} from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import type { ClientInstrument } from '@/types';
import {
  createClientWithInstrumentLinksSchema,
  validateClient,
  validateClientInstrument,
} from '@/utils/typeGuards';
import {
  createClientInputToDbRow,
  mapClientsTableRowToClient,
} from '@/utils/clientDbMap';
import {
  isClientNumberAllocationExhausted,
  isCreateClientRpcResponseAssemblyFailure,
  rpcCreateClientWithConnectionsAtomic,
} from '@/app/api/_utils/insertClientWithAllocatedNumber';
import { logWarn } from '@/utils/logger';

/** HTTP 503: RPC/write likely succeeded but we cannot return a verified API payload. */
function createClientResponseMalformed503(orgId: string | null | undefined) {
  logWarn(
    'create_client_with_connections could not assemble a verified response; write may have succeeded',
    'ClientsWithConnectionsAPI',
    { orgId }
  );
  return {
    status: 503 as const,
    payload: {
      error:
        'The client may have been created, but the response could not be verified. Refresh the client list before trying again.',
      error_code: 'create_response_malformed',
      retryable: false,
    },
  };
}

function getConnectionConflictStatus(errorMessage: string): number {
  if (
    errorMessage.includes('not found') ||
    errorMessage.includes('cannot be assigned') ||
    errorMessage.includes('cannot be moved') ||
    errorMessage.includes('Use the sales API') ||
    errorMessage.includes('Sold relationship')
  ) {
    return 409;
  }

  return 500;
}

async function postHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'POST',
      path: 'ClientsWithConnectionsAPI',
      context: 'ClientsWithConnectionsAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: { error: 'Admin role required' },
          status: 403,
        };
      }

      const body = await request.json();
      const parsed = createClientWithInstrumentLinksSchema.safeParse(body);
      if (!parsed.success) {
        return {
          payload: {
            error: `Invalid request: ${parsed.error.message}`,
          },
          status: 400,
        };
      }

      const { instrumentLinks, ...clientPayload } = parsed.data;
      const links = instrumentLinks ?? [];

      if (links.some(l => l.relationship_type === 'Sold')) {
        return {
          payload: {
            error:
              'Sold relationship cannot be created directly. Use the sales API.',
          },
          status: 409,
        };
      }

      // client_number is always server-allocated; ignore any request value
      const dbRow = createClientInputToDbRow({
        ...clientPayload,
        client_number: null,
      });
      const clientName = (dbRow.name ?? '').trim();
      if (!clientName) {
        return {
          payload: { error: 'Client name is required' },
          status: 400,
        };
      }

      const pLinks: Json = links.map(l => ({
        instrument_id: l.instrument_id,
        relationship_type: l.relationship_type,
        notes: l.notes ?? null,
      }));

      const { data: rpcData, error: rpcError } =
        await rpcCreateClientWithConnectionsAtomic(
          auth.userSupabase,
          auth.orgId!,
          {
            name: clientName,
            email: dbRow.email ?? null,
            phone: dbRow.phone ?? null,
            tags: dbRow.tags ?? [],
            interest: dbRow.interest ?? null,
            note: dbRow.note ?? null,
          },
          pLinks
        );

      if (rpcError || !rpcData) {
        if (rpcError?.code === '23505') {
          if (isClientNumberAllocationExhausted(rpcError)) {
            return {
              status: 409,
              payload: {
                error:
                  'Could not assign a client number after several attempts (high load). Please try again in a moment.',
                error_code: 'client_number_allocation_exhausted',
                retryable: true,
              },
            };
          }
          const hint =
            `${rpcError.details ?? ''} ${rpcError.message ?? ''}`.toLowerCase();
          const isClientNumber =
            hint.includes('client_number') ||
            hint.includes('idx_clients_org_id_client_number');
          return {
            status: 409,
            payload: {
              error: isClientNumber
                ? 'This client number is already in use for your organization.'
                : 'A record with the same unique value already exists.',
            },
          };
        }
        if (isCreateClientRpcResponseAssemblyFailure(rpcError)) {
          return createClientResponseMalformed503(auth.orgId);
        }
        const errorMessage =
          rpcError && typeof rpcError.message === 'string'
            ? rpcError.message
            : 'Failed to create client with connections';

        const status = getConnectionConflictStatus(errorMessage);
        if (status === 409) {
          return { payload: { error: errorMessage }, status };
        }

        throw errorHandler.handleSupabaseError(
          rpcError ?? new Error(errorMessage),
          'Create client with connections'
        );
      }

      let client;
      let connections: ClientInstrument[];
      try {
        client = validateClient(mapClientsTableRowToClient(rpcData.client));

        connections = rpcData.connections.map((row: unknown) =>
          validateClientInstrument(row)
        );
      } catch {
        return createClientResponseMalformed503(auth.orgId);
      }

      return {
        payload: { data: { client, connections } },
        status: 201,
        metadata: { clientId: client.id, connectionCount: connections.length },
      };
    }
  );
}

export const POST = withSentryRoute(withAuthRoute(postHandler));
