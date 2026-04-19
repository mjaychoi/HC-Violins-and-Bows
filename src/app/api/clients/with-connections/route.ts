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
  CLIENT_TABLE_SELECT,
  createClientInputToDbRow,
  mapClientsTableRowToClient,
} from '@/utils/clientDbMap';

const CONNECTION_LIST_COLUMNS =
  'id, client_id, instrument_id, relationship_type, notes, display_order, created_at';

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

      const dbRow = createClientInputToDbRow(clientPayload);
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

      const { data: newClientId, error: rpcError } =
        await auth.userSupabase.rpc('create_client_with_connections_atomic', {
          p_name: clientName,
          p_email: dbRow.email ?? null,
          p_phone: dbRow.phone ?? null,
          p_client_number: dbRow.client_number ?? null,
          p_links: pLinks,
        });

      if (rpcError || typeof newClientId !== 'string') {
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

      const { data: clientRaw, error: clientErr } = await auth.userSupabase
        .from('clients')
        .select(CLIENT_TABLE_SELECT)
        .eq('id', newClientId)
        .eq('org_id', auth.orgId!)
        .single();

      if (clientErr || !clientRaw) {
        throw errorHandler.handleSupabaseError(
          clientErr ?? new Error('Client row missing after atomic create'),
          'Load created client'
        );
      }

      const client = validateClient(mapClientsTableRowToClient(clientRaw));

      const { data: connRows, error: connErr } = await auth.userSupabase
        .from('client_instruments')
        .select(CONNECTION_LIST_COLUMNS)
        .eq('client_id', newClientId)
        .eq('org_id', auth.orgId!);

      if (connErr) {
        throw errorHandler.handleSupabaseError(
          connErr,
          'Load client connections after create'
        );
      }

      const connections: ClientInstrument[] = (connRows ?? []).map(row =>
        validateClientInstrument(row)
      );

      return {
        payload: { data: { client, connections } },
        status: 201,
        metadata: { clientId: client.id, connectionCount: connections.length },
      };
    }
  );
}

export const POST = withSentryRoute(withAuthRoute(postHandler));
