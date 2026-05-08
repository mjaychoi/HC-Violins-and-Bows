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

type InvoiceSettingsRow = Tables<'invoice_settings'>;
type InvoiceSettingsInsertRow = TablesInsert<'invoice_settings'>;
type InvoiceSettingsUpdateRow = TablesUpdate<'invoice_settings'>;
type PostgrestErrorLike = { code?: string };

type ParsedSettingsUpdate = Partial<{
  business_name: string;
  business_address: string | null;
  business_phone: string | null;
  business_email: string | null;
  bank_account_holder: string | null;
  bank_name: string | null;
  bank_swift_code: string | null;
  bank_account_number: string | null;
  default_conditions: string | null;
  default_exchange_rate: number | null;
  default_currency: string;
}>;

const MAX_SHORT_TEXT_LENGTH = 255;
const MAX_ADDRESS_LENGTH = 1_000;
const MAX_CONDITIONS_LENGTH = 5_000;

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
      error: 'Invalid JSON body',
    };
  }

  return {
    ok: true,
    body,
  };
}

function parseOptionalStringField(
  body: Record<string, unknown>,
  key: string,
  options?: {
    maxLength?: number;
    allowNull?: boolean;
    emptyAsNull?: boolean;
  }
):
  | { ok: true; provided: false }
  | { ok: true; provided: true; value: string | null }
  | { ok: false; message: string } {
  if (!Object.prototype.hasOwnProperty.call(body, key)) {
    return { ok: true, provided: false };
  }

  const value = body[key];

  if (value === null) {
    if (options?.allowNull === false) {
      return {
        ok: false,
        message: `${key} cannot be null`,
      };
    }

    return {
      ok: true,
      provided: true,
      value: null,
    };
  }

  if (typeof value !== 'string') {
    return {
      ok: false,
      message: `${key} must be a string`,
    };
  }

  const trimmed = value.trim();
  const emptyAsNull = options?.emptyAsNull ?? true;

  if (!trimmed && emptyAsNull) {
    return {
      ok: true,
      provided: true,
      value: null,
    };
  }

  const maxLength = options?.maxLength ?? MAX_SHORT_TEXT_LENGTH;
  if (trimmed.length > maxLength) {
    return {
      ok: false,
      message: `${key} cannot exceed ${maxLength} characters`,
    };
  }

  return {
    ok: true,
    provided: true,
    value: trimmed,
  };
}

function parseOptionalCurrencyField(
  body: Record<string, unknown>,
  key: string
):
  | { ok: true; provided: false }
  | { ok: true; provided: true; value: string }
  | { ok: false; message: string } {
  if (!Object.prototype.hasOwnProperty.call(body, key)) {
    return { ok: true, provided: false };
  }

  const value = body[key];

  if (typeof value !== 'string') {
    return {
      ok: false,
      message: `${key} must be a string`,
    };
  }

  const normalized = value.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    return {
      ok: false,
      message: `${key} must be a 3-letter ISO currency code`,
    };
  }

  return {
    ok: true,
    provided: true,
    value: normalized,
  };
}

function parseOptionalExchangeRateField(
  body: Record<string, unknown>,
  key: string
):
  | { ok: true; provided: false }
  | { ok: true; provided: true; value: number | null }
  | { ok: false; message: string } {
  if (!Object.prototype.hasOwnProperty.call(body, key)) {
    return { ok: true, provided: false };
  }

  const value = body[key];

  if (value === null) {
    return {
      ok: true,
      provided: true,
      value: null,
    };
  }

  if (typeof value === 'string' && value.trim() === '') {
    return {
      ok: true,
      provided: true,
      value: null,
    };
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    return {
      ok: false,
      message: `${key} must be a string or number`,
    };
  }

  const parsed = typeof value === 'number' ? value : Number(value.trim());

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      ok: false,
      message: `${key} must be a valid number`,
    };
  }

  return {
    ok: true,
    provided: true,
    value: parsed,
  };
}

function applyParsedStringField(
  parsed: ParsedSettingsUpdate,
  body: Record<string, unknown>,
  sourceKey: string,
  targetKey: keyof ParsedSettingsUpdate,
  options?: {
    maxLength?: number;
    allowNull?: boolean;
    emptyAsNull?: boolean;
  }
): { ok: true } | { ok: false; message: string } {
  const field = parseOptionalStringField(body, sourceKey, options);

  if (!field.ok) {
    return {
      ok: false,
      message: field.message,
    };
  }

  if (field.provided) {
    parsed[targetKey] = field.value as never;
  }

  return { ok: true };
}

function parseSettingsUpdatePayload(
  body: Record<string, unknown>
): { ok: true; value: ParsedSettingsUpdate } | { ok: false; message: string } {
  const parsed: ParsedSettingsUpdate = {};

  const stringFields: Array<{
    sourceKey: string;
    targetKey: keyof ParsedSettingsUpdate;
    maxLength?: number;
    allowNull?: boolean;
    emptyAsNull?: boolean;
  }> = [
    {
      sourceKey: 'business_name',
      targetKey: 'business_name',
      maxLength: MAX_SHORT_TEXT_LENGTH,
      allowNull: false,
      emptyAsNull: false,
    },
    {
      sourceKey: 'address',
      targetKey: 'business_address',
      maxLength: MAX_ADDRESS_LENGTH,
    },
    {
      sourceKey: 'phone',
      targetKey: 'business_phone',
      maxLength: MAX_SHORT_TEXT_LENGTH,
    },
    {
      sourceKey: 'email',
      targetKey: 'business_email',
      maxLength: MAX_SHORT_TEXT_LENGTH,
    },
    {
      sourceKey: 'bank_account_holder',
      targetKey: 'bank_account_holder',
      maxLength: MAX_SHORT_TEXT_LENGTH,
    },
    {
      sourceKey: 'bank_name',
      targetKey: 'bank_name',
      maxLength: MAX_SHORT_TEXT_LENGTH,
    },
    {
      sourceKey: 'bank_swift_code',
      targetKey: 'bank_swift_code',
      maxLength: MAX_SHORT_TEXT_LENGTH,
    },
    {
      sourceKey: 'bank_account_number',
      targetKey: 'bank_account_number',
      maxLength: MAX_SHORT_TEXT_LENGTH,
    },
    {
      sourceKey: 'default_conditions',
      targetKey: 'default_conditions',
      maxLength: MAX_CONDITIONS_LENGTH,
    },
  ];

  for (const field of stringFields) {
    const result = applyParsedStringField(
      parsed,
      body,
      field.sourceKey,
      field.targetKey,
      {
        maxLength: field.maxLength,
        allowNull: field.allowNull,
        emptyAsNull: field.emptyAsNull,
      }
    );

    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
      };
    }
  }

  const exchangeRate = parseOptionalExchangeRateField(
    body,
    'default_exchange_rate'
  );

  if (!exchangeRate.ok) {
    return {
      ok: false,
      message: exchangeRate.message,
    };
  }

  if (exchangeRate.provided) {
    parsed.default_exchange_rate = exchangeRate.value;
  }

  const currency = parseOptionalCurrencyField(body, 'default_currency');

  if (!currency.ok) {
    return {
      ok: false,
      message: currency.message,
    };
  }

  if (currency.provided) {
    parsed.default_currency = currency.value;
  }

  return {
    ok: true,
    value: parsed,
  };
}

function valueOrExisting<T>(value: T | undefined, existing: T): T {
  return value === undefined ? existing : value;
}

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
  orgId: string,
  options?: { allowDefaultFallback?: boolean }
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

  if (error && (error as PostgrestErrorLike).code !== 'PGRST116') {
    throw error;
  }

  if (data) {
    return data as unknown as InvoiceSettingsRow;
  }

  if (options?.allowDefaultFallback) {
    return {
      id: '',
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
      created_at: null,
      updated_at: null,
    } as unknown as InvoiceSettingsRow;
  }

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
          payload: {
            error: 'Organization context required',
            success: false,
          },
          status: 403,
        };
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: {
            error: 'Admin role required',
            error_code: 'ADMIN_REQUIRED',
            success: false,
          },
          status: 403,
        };
      }

      const row = await getOrCreateSettingsRow(auth.userSupabase, auth.orgId!, {
        allowDefaultFallback: true,
      });

      return {
        payload: {
          data: mapInvoiceSettingsRow(row),
          success: true,
        },
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
          payload: {
            error: 'Organization context required',
            success: false,
          },
          status: 403,
        };
      }

      const adminError = requireAdmin(auth);
      if (adminError) {
        return {
          payload: {
            error: 'Admin role required',
            error_code: 'ADMIN_REQUIRED',
            success: false,
          },
          status: 403,
        };
      }

      const bodyResult = await readJsonObject(request);
      if (!bodyResult.ok) {
        return {
          payload: {
            error: bodyResult.error,
            success: false,
          },
          status: 400,
        };
      }

      const parsedPayload = parseSettingsUpdatePayload(bodyResult.body);

      if (!parsedPayload.ok) {
        return {
          payload: {
            error: parsedPayload.message,
            success: false,
          },
          status: 400,
        };
      }

      const parsed = parsedPayload.value;

      if (Object.keys(parsed).length === 0) {
        return {
          payload: {
            error: 'No valid fields to update',
            success: false,
          },
          status: 400,
        };
      }

      const existing = await getOrCreateSettingsRow(
        auth.userSupabase,
        auth.orgId!
      );

      const updatePayload: InvoiceSettingsUpdateRow = {
        business_name: valueOrExisting(
          parsed.business_name,
          existing.business_name ?? ''
        ),
        business_address: valueOrExisting(
          parsed.business_address,
          existing.business_address ?? null
        ),
        business_phone: valueOrExisting(
          parsed.business_phone,
          existing.business_phone ?? null
        ),
        business_email: valueOrExisting(
          parsed.business_email,
          existing.business_email ?? null
        ),
        bank_account_holder: valueOrExisting(
          parsed.bank_account_holder,
          existing.bank_account_holder ?? null
        ),
        bank_name: valueOrExisting(
          parsed.bank_name,
          existing.bank_name ?? null
        ),
        bank_swift_code: valueOrExisting(
          parsed.bank_swift_code,
          existing.bank_swift_code ?? null
        ),
        bank_account_number: valueOrExisting(
          parsed.bank_account_number,
          existing.bank_account_number ?? null
        ),
        default_conditions: valueOrExisting(
          parsed.default_conditions,
          existing.default_conditions ?? null
        ),
        default_exchange_rate: valueOrExisting(
          parsed.default_exchange_rate,
          existing.default_exchange_rate ?? null
        ),
        default_currency: valueOrExisting(
          parsed.default_currency,
          existing.default_currency ?? 'USD'
        ),
      };

      const { data, error } = await auth.userSupabase
        .from('invoice_settings')
        .update(updatePayload)
        .eq('id', existing.id as string)
        .eq('org_id', auth.orgId!)
        .select(INVOICE_SETTINGS_COLUMNS)
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error('No data returned after update');
      }

      return {
        payload: {
          data: mapInvoiceSettingsRow(data as unknown as InvoiceSettingsRow),
          success: true,
        },
      };
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));
export const PUT = withSentryRoute(withAuthRoute(putHandler));
