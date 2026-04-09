import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import {
  requireAdmin,
  requireOrgContext,
} from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database';

type InvoiceSettingsPayload = {
  business_name: string;
  address: string;
  phone: string;
  email: string;
  bank_account_holder: string;
  bank_name: string;
  bank_swift_code: string;
  bank_account_number: string;
  default_conditions: string;
  default_exchange_rate: string;
  default_currency: string;
};

type InvoiceSettingsRow = Tables<'invoice_settings'>;
type PostgrestErrorLike = { code?: string };
type InvoiceSettingsInsertRow = TablesInsert<'invoice_settings'>;
type InvoiceSettingsUpdateRow = TablesUpdate<'invoice_settings'>;

function parseExchangeRateInput(
  value: unknown
): { ok: true; value: number | null } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: null };
  }

  if (typeof value !== 'string') {
    return {
      ok: false,
      message: 'default_exchange_rate must be a string',
    };
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return {
      ok: false,
      message: 'default_exchange_rate must be a valid number',
    };
  }

  return { ok: true, value: parsed };
}

const INVOICE_SETTINGS_COLUMNS = [
  'id',
  'org_id',
  'business_name',
  'business_address',
  'business_phone',
  'business_email',
  'bank_account_holder',
  'bank_name',
  'bank_swift_code',
  'bank_account_number',
  'default_conditions',
  'default_exchange_rate',
  'default_currency',
  'created_at',
  'updated_at',
].join(',');

function mapInvoiceSettingsRow(row: InvoiceSettingsRow) {
  return {
    ...row,
    address: row.business_address ?? '',
    phone: row.business_phone ?? '',
    email: row.business_email ?? '',
    default_exchange_rate:
      row.default_exchange_rate != null
        ? String(row.default_exchange_rate)
        : '',
  };
}

async function getOrCreateSettingsRow(
  supabase: SupabaseClient,
  orgId: string
): Promise<InvoiceSettingsRow> {
  const insertPayload: InvoiceSettingsInsertRow = {
    org_id: orgId,
    business_name: '',
    business_address: null,
    business_phone: null,
    business_email: null,
    bank_account_holder: null,
    bank_name: null,
    bank_swift_code: null,
    bank_account_number: null,
    default_conditions: null,
    default_exchange_rate: null,
    default_currency: 'USD',
  };

  const { error: upsertError } = await supabase
    .from('invoice_settings')
    .upsert(insertPayload, {
      onConflict: 'org_id',
      ignoreDuplicates: true,
    });

  if (upsertError && (upsertError as PostgrestErrorLike).code !== '23505') {
    throw upsertError;
  }

  const { data, error } = await supabase
    .from('invoice_settings')
    .select(INVOICE_SETTINGS_COLUMNS)
    .eq('org_id', orgId)
    .limit(1)
    .maybeSingle();

  if (error && (error as PostgrestErrorLike).code !== 'PGRST116') throw error;
  if (data) return data as unknown as InvoiceSettingsRow;

  throw new Error('Invoice settings row was not available after upsert');
}

async function getHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'InvoiceSettingsAPI',
      context: 'InvoiceSettingsAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      const row = await getOrCreateSettingsRow(auth.userSupabase, auth.orgId!);

      return {
        payload: { data: mapInvoiceSettingsRow(row) },
      };
    }
  );
}

async function putHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'PUT',
      path: 'InvoiceSettingsAPI',
      context: 'InvoiceSettingsAPI',
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
          payload: {
            error: 'Admin role required',
            error_code: 'ADMIN_REQUIRED',
          },
          status: 403,
        };
      }

      const body = (await request
        .json()
        .catch(() => null)) as Partial<InvoiceSettingsPayload> | null;
      if (!body || typeof body !== 'object') {
        return {
          payload: { error: 'Invalid JSON body' },
          status: 400,
        };
      }

      const existing = await getOrCreateSettingsRow(
        auth.userSupabase,
        auth.orgId!
      );
      const exchangeRateInput = parseExchangeRateInput(
        body.default_exchange_rate
      );

      if (!exchangeRateInput.ok) {
        return {
          payload: { error: exchangeRateInput.message },
          status: 400,
        };
      }

      const updatePayload: InvoiceSettingsUpdateRow = {
        business_name: body.business_name ?? existing.business_name ?? '',
        business_address: body.address ?? existing.business_address ?? null,
        business_phone: body.phone ?? existing.business_phone ?? null,
        business_email: body.email ?? existing.business_email ?? null,
        bank_account_holder:
          body.bank_account_holder ?? existing.bank_account_holder ?? null,
        bank_name: body.bank_name ?? existing.bank_name ?? null,
        bank_swift_code:
          body.bank_swift_code ?? existing.bank_swift_code ?? null,
        bank_account_number:
          body.bank_account_number ?? existing.bank_account_number ?? null,
        default_conditions:
          body.default_conditions ?? existing.default_conditions ?? null,
        default_exchange_rate:
          body.default_exchange_rate !== undefined
            ? exchangeRateInput.value
            : (existing.default_exchange_rate ?? null),
        default_currency:
          body.default_currency ?? existing.default_currency ?? 'USD',
      };

      const { data, error } = await auth.userSupabase
        .from('invoice_settings')
        .update(updatePayload)
        .eq('id', existing.id as string)
        .eq('org_id', auth.orgId!)
        .select(INVOICE_SETTINGS_COLUMNS)
        .single();

      if (error) throw error;
      if (!data) {
        throw new Error('No data returned after update');
      }

      return {
        payload: {
          data: mapInvoiceSettingsRow(data as unknown as InvoiceSettingsRow),
        },
      };
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));
export const PUT = withSentryRoute(withAuthRoute(putHandler));
