import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { errorHandler } from '@/utils/errorHandler';
import { validateUUID } from '@/utils/inputValidation';

export async function assertClientBelongsToOrg(
  auth: AuthContext,
  orgId: string,
  clientId: string | null | undefined
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (clientId === undefined || clientId === null) {
    return { ok: true };
  }

  if (!validateUUID(clientId)) {
    return {
      ok: false,
      error: 'Invalid client_id format',
      status: 400,
    };
  }

  const { data, error } = await auth.userSupabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    throw errorHandler.handleSupabaseError(error, 'Validate invoice client');
  }

  if (!data) {
    return {
      ok: false,
      error: 'Client not found in organization',
      status: 400,
    };
  }

  return { ok: true };
}
