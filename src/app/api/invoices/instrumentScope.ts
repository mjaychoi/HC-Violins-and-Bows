import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { errorHandler } from '@/utils/errorHandler';
import { validateUUID } from '@/utils/inputValidation';
import type { CreateInvoiceInput } from './types';

export async function assertInvoiceItemInstrumentsBelongToOrg(
  auth: AuthContext,
  orgId: string,
  items: CreateInvoiceInput['items'] | null | undefined
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!items || items.length === 0) {
    return { ok: true };
  }

  const instrumentIds = Array.from(
    new Set(
      items
        .map(item => item.instrument_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  if (instrumentIds.length === 0) {
    return { ok: true };
  }

  const invalidIds = instrumentIds.filter(id => !validateUUID(id));
  if (invalidIds.length > 0) {
    return {
      ok: false,
      error: 'Invoice items contain invalid instrument_id values',
      status: 400,
    };
  }

  const { data, error } = await auth.userSupabase
    .from('instruments')
    .select('id')
    .eq('org_id', orgId)
    .in('id', instrumentIds);

  if (error) {
    throw errorHandler.handleSupabaseError(
      error,
      'Validate invoice item instruments'
    );
  }

  const foundIds = new Set((data ?? []).map(row => row.id));
  const missingIds = instrumentIds.filter(id => !foundIds.has(id));

  if (missingIds.length > 0) {
    return {
      ok: false,
      error:
        'One or more invoice item instruments were not found in organization',
      status: 400,
    };
  }

  return { ok: true };
}
