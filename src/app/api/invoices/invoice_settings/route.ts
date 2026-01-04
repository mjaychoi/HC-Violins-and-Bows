import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity } from '@/types/errors';
import {
  createSafeErrorResponse,
  createLogErrorInfo,
} from '@/utils/errorSanitization';

function getOrgScopeFromUser(user: User | undefined): { orgId?: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyUser = user as any;
  const orgId =
    anyUser?.org_id ??
    anyUser?.organization_id ??
    anyUser?.orgId ??
    anyUser?.organizationId ??
    anyUser?.user_metadata?.org_id ??
    anyUser?.user_metadata?.organization_id ??
    anyUser?.app_metadata?.org_id ??
    anyUser?.app_metadata?.organization_id;

  if (typeof orgId === 'string' && orgId.length > 0) return { orgId };
  return {};
}

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

// Explicit column list matching actual table structure
// Note: default_exchange_rate is numeric type in DB, but we handle it as string in API
const INVOICE_SETTINGS_COLUMNS = [
  'id',
  'org_id',
  'business_name',
  'business_address', // Actual column name in DB
  'business_phone', // Actual column name in DB
  'business_email', // Actual column name in DB
  'bank_account_holder',
  'bank_name',
  'bank_swift_code',
  'bank_account_number',
  'default_conditions',
  'default_exchange_rate', // numeric type in DB
  'default_currency',
  'created_at',
  'updated_at',
].join(',');

async function getOrCreateSettingsRow(
  supabase: ReturnType<typeof getServerSupabase>,
  orgId?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  // 1) try select existing - explicitly select TEXT columns to avoid numeric type issues

  let q = supabase
    .from('invoice_settings')
    .select(INVOICE_SETTINGS_COLUMNS)
    .limit(1);
  if (orgId) q = q.eq('org_id', orgId);

  const { data, error } = await q.maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (error && (error as any).code !== 'PGRST116') throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (data) return data as any;

  // 2) insert default row - match actual table column names
  // Note: default_exchange_rate is numeric, so use null instead of empty string
  const insertPayload: Record<string, string | number | null> = {
    business_name: '',
    business_address: null, // Actual column name
    business_phone: null, // Actual column name
    business_email: null, // Actual column name
    bank_account_holder: null,
    bank_name: null,
    bank_swift_code: null,
    bank_account_number: null,
    default_conditions: null,
    default_exchange_rate: null, // numeric type - use null, not empty string
    default_currency: 'USD',
  };
  if (orgId) {
    insertPayload.org_id = orgId;
  }

  // Insert only the columns we know are TEXT type
  const { data: created, error: insErr } = await supabase
    .from('invoice_settings')
    .insert(insertPayload)
    .select(INVOICE_SETTINGS_COLUMNS)
    .single();

  if (insErr) throw insErr;
  return created;
}

export const GET = async (request: NextRequest) => {
  const handler = withSentryRoute(
    withAuthRoute(async (_req: NextRequest, user: User) => {
      try {
        const supabase = getServerSupabase();
        const { orgId } = getOrgScopeFromUser(user);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = (await getOrCreateSettingsRow(supabase, orgId)) as any;

        // Map database column names to API field names for client compatibility
        const dbRow = row as Record<string, unknown>;
        const mappedRow = {
          ...dbRow,
          address: (dbRow.business_address as string) ?? '',
          phone: (dbRow.business_phone as string) ?? '',
          email: (dbRow.business_email as string) ?? '',
          // Convert numeric to string for API compatibility
          default_exchange_rate:
            dbRow.default_exchange_rate != null
              ? String(dbRow.default_exchange_rate)
              : '',
        };

        return NextResponse.json({ data: mappedRow }, { status: 200 });
      } catch (error) {
        const appError = errorHandler.handleSupabaseError(
          error || new Error('Failed to load invoice settings'),
          'Load invoice settings'
        );
        const safe = createSafeErrorResponse(appError, 500);
        captureException(
          appError,
          'InvoiceSettingsAPI.GET',
          {},
          ErrorSeverity.MEDIUM
        );
        return NextResponse.json(safe, { status: 500 });
      }
    })
  );
  return handler(request);
};

export const PUT = async (request: NextRequest) => {
  const handler = withSentryRoute(
    withAuthRoute(async (_req: NextRequest, user: User) => {
      try {
        const body = (await request.json()) as Partial<InvoiceSettingsPayload>;
        const supabase = getServerSupabase();
        const { orgId } = getOrgScopeFromUser(user);

        // ensure row exists
        const existing = (await getOrCreateSettingsRow(
          supabase,
          orgId
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        )) as any;

        // Map API field names to actual database column names
        // Convert default_exchange_rate from string to numeric if provided
        const updatePayload: Record<string, string | number | null> = {
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
          default_exchange_rate: body.default_exchange_rate
            ? body.default_exchange_rate.trim() === ''
              ? null
              : parseFloat(body.default_exchange_rate)
            : (existing.default_exchange_rate ?? null),
          default_currency:
            body.default_currency ?? existing.default_currency ?? 'USD',
        };

        const q = supabase
          .from('invoice_settings')
          .update(updatePayload)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .eq('id', (existing as any).id);
        const { data, error } = await q
          .select(INVOICE_SETTINGS_COLUMNS)
          .single();
        if (error) throw error;
        if (!data) throw new Error('No data returned after update');

        // Map database column names to API field names for client compatibility
        const dbRow = data as unknown as Record<string, unknown>;
        const mappedData = {
          ...dbRow,
          address: (dbRow.business_address as string) ?? '',
          phone: (dbRow.business_phone as string) ?? '',
          email: (dbRow.business_email as string) ?? '',
          // Convert numeric to string for API compatibility
          default_exchange_rate:
            dbRow.default_exchange_rate != null
              ? String(dbRow.default_exchange_rate)
              : '',
        };

        return NextResponse.json({ data: mappedData }, { status: 200 });
      } catch (error) {
        const appError = errorHandler.handleSupabaseError(
          error || new Error('Failed to update invoice settings'),
          'Update invoice settings'
        );
        const logInfo = createLogErrorInfo(appError);
        captureException(
          appError,
          'InvoiceSettingsAPI.PUT',
          { logMessage: logInfo.message },
          ErrorSeverity.MEDIUM
        );
        const safe = createSafeErrorResponse(appError, 500);
        return NextResponse.json(safe, { status: 500 });
      }
    })
  );
  return handler(request);
};
