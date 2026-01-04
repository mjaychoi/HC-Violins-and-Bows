import { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';

import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';

import {
  validateInvoice,
  validateCreateInvoice,
  safeValidate,
} from '@/utils/typeGuards';

import {
  validateUUID,
  sanitizeSearchTerm,
  validateDateString,
  escapePostgrestFilterValue,
} from '@/utils/inputValidation';

import { ErrorCodes } from '@/types/errors';
import type { Invoice } from '@/types';
import { logError, logWarn } from '@/utils/logger';
import { normalizeInvoiceRecord } from '@/utils/invoiceNormalize';
import type { CreateInvoiceInput } from './types';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LEN = 200;

type AnyRecord = Record<string, unknown>;

type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'void';

// create payload 타입(validator가 보장해주지만, any 대신 명시)

function clampInt(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function getOrgScopeFromUser(user: User | undefined): {
  orgId?: string;
  scopeKey?: string;
} {
  // user metadata 구조가 프로젝트마다 달라서, 있으면 적용만 하도록 안전하게 처리
  const u = user as unknown as AnyRecord;

  const userMeta =
    (u.user_metadata as unknown as AnyRecord | undefined) ?? undefined;
  const appMeta =
    (u.app_metadata as unknown as AnyRecord | undefined) ?? undefined;

  const orgId =
    u.org_id ??
    u.organization_id ??
    u.orgId ??
    u.organizationId ??
    userMeta?.org_id ??
    userMeta?.organization_id ??
    appMeta?.org_id ??
    appMeta?.organization_id;

  if (typeof orgId === 'string' && orgId.length > 0) {
    return { orgId, scopeKey: 'org_id' };
  }
  return {};
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'message' in err)
    return String((err as { message?: unknown }).message);
  return String(err);
}

function getErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

async function getHandler(request: NextRequest, user: User) {
  return apiHandler(
    request,
    {
      method: 'GET',
      context: 'InvoicesAPI',
      path: request.nextUrl.pathname,
      metadata: {},
    },
    async () => {
      try {
        const searchParams = request.nextUrl.searchParams;

        const page = clampInt(
          Number(searchParams.get('page') || '1'),
          1,
          1_000_000
        );
        const pageSize = clampInt(
          Number(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE)),
          1,
          MAX_PAGE_SIZE
        );

        const rawFromDate = searchParams.get('fromDate') || undefined;
        const rawToDate = searchParams.get('toDate') || undefined;

        const rawSearch = searchParams.get('search') || undefined;
        const clientId = searchParams.get('client_id') || undefined;
        const status = searchParams.get('status') || undefined;

        const sortColumn = searchParams.get('sortColumn') || 'invoice_date';
        const sortDirection = (
          searchParams.get('sortDirection') || 'desc'
        ).toLowerCase();

        // Date validation
        if (rawFromDate && !validateDateString(rawFromDate)) {
          return {
            payload: {
              error: `Invalid fromDate. Expected YYYY-MM-DD, received: ${rawFromDate}`,
            },
            status: 400,
            metadata: { invalidFromDate: true },
          };
        }
        if (rawToDate && !validateDateString(rawToDate)) {
          return {
            payload: {
              error: `Invalid toDate. Expected YYYY-MM-DD, received: ${rawToDate}`,
            },
            status: 400,
            metadata: { invalidToDate: true },
          };
        }

        // Search sanitization + length cap
        let search: string | undefined = rawSearch
          ? sanitizeSearchTerm(rawSearch)
          : undefined;
        if (search) {
          search = search.trim();
          if (!search) search = undefined;
        }
        if (search && search.length > MAX_SEARCH_LEN) {
          search = search.slice(0, MAX_SEARCH_LEN);
        }

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const supabase = getServerSupabase();

        // ✅ any 대신 PostgrestFilterBuilder로 고정
        const baseQuery = supabase
          .from('invoices')
          .select(
            `
            id,
            invoice_number,
            org_id,
            client_id,
            invoice_date,
            due_date,
            subtotal,
            tax,
            total,
            currency,
            status,
            notes,
            created_at,
            updated_at,
            clients (*),
            invoice_items (*)
            `,
            { count: 'exact' }
          )
          .range(from, to);

        let query: typeof baseQuery = baseQuery;

        // Optional scope enforcement (if org id exists)
        const { orgId } = getOrgScopeFromUser(user);
        if (orgId) {
          query = query.eq('org_id', orgId);
          logWarn(
            'invoices.get.scoped',
            `Filtering invoices by org_id=${orgId}`,
            {
              orgId,
              userId: user?.id,
              // Debug info to help diagnose org_id extraction issues
              userMetadataKeys: user
                ? Object.keys(
                    (user as unknown as AnyRecord).user_metadata || {}
                  )
                : [],
              appMetadataKeys: user
                ? Object.keys((user as unknown as AnyRecord).app_metadata || {})
                : [],
            }
          );
        } else {
          // If no orgId, log warning for debugging
          logWarn(
            'invoices.get.no_org_id',
            'No org_id found in user context, returning all invoices (may be filtered by RLS)',
            {
              userId: user?.id,
              // Debug info to help diagnose org_id extraction issues
              userMetadata: user
                ? (user as unknown as AnyRecord).user_metadata || {}
                : {},
              appMetadata: user
                ? (user as unknown as AnyRecord).app_metadata || {}
                : {},
            }
          );
        }

        // Sorting whitelist
        const allowedSortColumns = new Set([
          'invoice_date',
          'due_date',
          'created_at',
          'updated_at',
          'total',
          'subtotal',
          'invoice_number',
          'status',
        ]);
        const safeSortColumn = allowedSortColumns.has(sortColumn)
          ? sortColumn
          : 'invoice_date';
        const ascending = sortDirection === 'asc';

        query = query.order(safeSortColumn, { ascending });

        // Date filters
        if (rawFromDate) query = query.gte('invoice_date', rawFromDate);
        if (rawToDate) query = query.lte('invoice_date', rawToDate);

        // Client filter
        if (clientId && validateUUID(clientId)) {
          query = query.eq('client_id', clientId);
        } else if (clientId) {
          return {
            payload: { error: `Invalid client_id: ${clientId}` },
            status: 400,
          };
        }

        // Status filter (whitelist)
        const validStatuses = new Set<InvoiceStatus>([
          'draft',
          'sent',
          'paid',
          'overdue',
          'cancelled',
          'void',
        ]);
        if (status) {
          if (!validStatuses.has(status as InvoiceStatus)) {
            return {
              payload: { error: `Invalid status: ${status}` },
              status: 400,
            };
          }
          query = query.eq('status', status);
        }

        // Search filter (safe OR)
        if (search) {
          const escaped = escapePostgrestFilterValue(search);
          query = query.or(
            [
              `invoice_number.ilike.%${escaped}%`,
              `notes.ilike.%${escaped}%`,
              `clients.name.ilike.%${escaped}%`,
            ].join(',')
          );
        }

        const { data, error, count } = await query;

        if (error) {
          const errorMsg = getErrorMessage(error);

          if (
            getErrorCode(error) === '42P01' ||
            errorMsg.includes('does not exist') ||
            errorMsg.includes('relation')
          ) {
            throw errorHandler.createError(
              ErrorCodes.DATABASE_ERROR,
              'Invoices table does not exist. Please run the database migration: supabase/migrations/20250116000000_create_invoices.sql',
              errorMsg
            );
          }

          throw errorHandler.handleSupabaseError(error, 'Fetch invoices');
        }

        const rawRows = Array.isArray(data) ? data : [];

        let missingClientCreatedAtCount = 0;

        const validRows: Invoice[] = [];
        const invalidRowIds: string[] = [];

        for (const row of rawRows) {
          try {
            const { normalized } = normalizeInvoiceRecord(
              row as unknown as AnyRecord
            );

            const clientCreatedAt = normalized.client?.created_at;
            if (!clientCreatedAt) missingClientCreatedAtCount += 1;

            const res = safeValidate(normalized, validateInvoice);
            if (res.success) {
              validRows.push(res.data as Invoice);
            } else {
              const id = normalized.id;
              if (typeof id === 'string') invalidRowIds.push(id);
            }
          } catch {
            const id = (row as unknown as Invoice)?.id;
            if (typeof id === 'string') invalidRowIds.push(id);
          }
        }

        if (missingClientCreatedAtCount > 0) {
          logWarn(
            'invoices.missing_client_created_at',
            `missingCount=${missingClientCreatedAtCount} page=${page} pageSize=${pageSize}`
          );
        }

        const invalidCount = rawRows.length - validRows.length;
        if (invalidCount > 0) {
          logWarn(
            'invoices.invalid_rows_filtered',
            `invalidCount=${invalidCount} sampleIds=${invalidRowIds.slice(0, 3).join(',')}`
          );
        }

        const totalCount = typeof count === 'number' ? count : rawRows.length;
        const scopePayload = orgId
          ? { enforced: true, orgId }
          : { enforced: false, reason: 'RLS or upstream scoping' };

        return {
          payload: {
            data: validRows,
            count: totalCount,
            scope: scopePayload,
          },
          status: 200,
          metadata: {
            page,
            pageSize,
            total: totalCount,
            countAvailable: typeof count === 'number',
            sortColumn: safeSortColumn,
            sortDirection: ascending ? 'asc' : 'desc',
            invalidCount,
            scope: scopePayload,
          },
        };
      } catch (err) {
        logError('invoices.get.error', `err=${getErrorMessage(err)}`);
        throw err;
      }
    }
  );
}

async function postHandler(request: NextRequest, user: User) {
  return apiHandler(
    request,
    {
      method: 'POST',
      context: 'InvoicesAPI',
      path: request.nextUrl.pathname,
      metadata: {},
    },
    async () => {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return { payload: { error: 'Invalid JSON body' }, status: 400 };
      }

      // ✅ any 제거: body는 unknown 그대로
      const validationResult = safeValidate(body, validateCreateInvoice);

      if (!validationResult.success) {
        return {
          payload: { error: `Invalid invoice data: ${validationResult.error}` },
          status: 400,
        };
      }

      // ✅ validator가 보장한 shape를 명시 타입으로 받기
      const validatedInput = validationResult.data as CreateInvoiceInput;

      const { items } = validatedInput;

      const supabase = getServerSupabase();

      // Get org scope from user (required for proper filtering on GET)
      const { orgId } = getOrgScopeFromUser(user);

      // ✅ Option B: Fallback to default org_id from environment variable (for development)
      // In production with multi-tenancy, this should be removed and orgId must be required
      const fallbackOrgId = process.env.DEFAULT_ORG_ID;

      // Validate fallback org_id is a valid UUID if provided
      let validatedFallbackOrgId: string | undefined;
      if (fallbackOrgId) {
        if (validateUUID(fallbackOrgId)) {
          validatedFallbackOrgId = fallbackOrgId;
        } else {
          logWarn(
            'invoices.post.invalid_fallback_org_id',
            `DEFAULT_ORG_ID environment variable is not a valid UUID: ${fallbackOrgId}`,
            {
              fallbackOrgId,
              userId: user?.id,
            }
          );
          // Don't use invalid fallback, fall through to error
        }
      }

      const effectiveOrgId = orgId ?? validatedFallbackOrgId;

      // ✅ Ensure org_id is always set (required for proper filtering on GET)
      // If org_id is missing and no fallback, return error to prevent "visible then disappears" issue
      if (!effectiveOrgId) {
        logWarn(
          'invoices.post.no_org_id',
          'No org_id found in user context and no DEFAULT_ORG_ID fallback',
          {
            userId: user?.id,
            hasFallback: !!fallbackOrgId,
            userMetadataKeys: user
              ? Object.keys((user as unknown as AnyRecord).user_metadata || {})
              : [],
            appMetadataKeys: user
              ? Object.keys((user as unknown as AnyRecord).app_metadata || {})
              : [],
          }
        );
        const errorMessage =
          fallbackOrgId && !validatedFallbackOrgId
            ? `Organization context missing. DEFAULT_ORG_ID environment variable is set but is not a valid UUID: "${fallbackOrgId}". Please set a valid UUID or configure org_id in user metadata.`
            : 'Organization context missing. Cannot create invoice without organization context. Please set org_id in user metadata or configure a valid UUID for DEFAULT_ORG_ID environment variable.';

        return {
          payload: {
            error: errorMessage,
          },
          status: 403,
        };
      }

      // Log if using fallback (for debugging)
      if (!orgId && fallbackOrgId) {
        logWarn(
          'invoices.post.using_fallback_org_id',
          `Using DEFAULT_ORG_ID fallback: ${fallbackOrgId}`,
          {
            userId: user?.id,
            fallbackOrgId,
          }
        );
      }

      const invoiceData: Record<string, unknown> = {
        client_id: validatedInput.client_id,
        invoice_date: validatedInput.invoice_date,
        due_date: validatedInput.due_date ?? null,
        subtotal: validatedInput.subtotal,
        tax: validatedInput.tax ?? null,
        total: validatedInput.total,
        currency: validatedInput.currency || 'USD',
        status: validatedInput.status || 'draft',
        notes: validatedInput.notes ?? null,
        org_id: effectiveOrgId, // ✅ Always set org_id (required for proper filtering on GET)
      };

      // Include optional invoice settings fields if provided
      if (validatedInput.business_name !== undefined)
        invoiceData.business_name = validatedInput.business_name;
      if (validatedInput.business_address !== undefined)
        invoiceData.business_address = validatedInput.business_address;
      if (validatedInput.business_phone !== undefined)
        invoiceData.business_phone = validatedInput.business_phone;
      if (validatedInput.business_email !== undefined)
        invoiceData.business_email = validatedInput.business_email;
      if (validatedInput.bank_account_holder !== undefined)
        invoiceData.bank_account_holder = validatedInput.bank_account_holder;
      if (validatedInput.bank_name !== undefined)
        invoiceData.bank_name = validatedInput.bank_name;
      if (validatedInput.bank_swift_code !== undefined)
        invoiceData.bank_swift_code = validatedInput.bank_swift_code;
      if (validatedInput.bank_account_number !== undefined)
        invoiceData.bank_account_number = validatedInput.bank_account_number;
      if (validatedInput.default_conditions !== undefined)
        invoiceData.default_conditions = validatedInput.default_conditions;
      if (validatedInput.default_exchange_rate !== undefined)
        invoiceData.default_exchange_rate =
          validatedInput.default_exchange_rate;

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert(invoiceData)
        .select(
          `
          id,
          invoice_number,
          client_id,
          invoice_date,
          due_date,
          subtotal,
          tax,
          total,
          currency,
          status,
          notes,
          created_at,
          updated_at,
          clients (*),
          invoice_items (*)
        `
        )
        .single();

      if (invoiceError) {
        throw errorHandler.handleSupabaseError(invoiceError, 'Create invoice');
      }

      if (!invoice) {
        throw errorHandler.createError(
          ErrorCodes.DATABASE_ERROR,
          'Failed to create invoice: No data returned from database',
          'The invoice insert operation completed but no invoice data was returned',
          { context: 'Create invoice' }
        );
      }

      if (Array.isArray(items) && items.length > 0) {
        const itemRows = items.map(item => {
          const row: Record<string, unknown> = {
            ...item,
            invoice_id: (invoice as { id: string }).id,
          };
          // ✅ Set org_id on invoice_items if available (required for proper scoping)
          if (orgId) {
            row.org_id = orgId;
          }
          return row;
        });

        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(itemRows);

        if (itemsError) {
          const { error: rollbackError } = await supabase
            .from('invoices')
            .delete()
            .eq('id', (invoice as { id: string }).id);

          if (rollbackError) {
            logError(
              'invoices.create.rollback_failed',
              `invoiceId=${(invoice as { id: string }).id} rollbackError=${getErrorMessage(rollbackError)}`
            );
          }

          throw errorHandler.handleSupabaseError(
            itemsError,
            'Create invoice items'
          );
        }
      }

      const { data: refreshed, error: refreshError } = await supabase
        .from('invoices')
        .select(
          `
          id,
          invoice_number,
          client_id,
          invoice_date,
          due_date,
          subtotal,
          tax,
          total,
          currency,
          status,
          notes,
          business_name,
          business_address,
          business_phone,
          business_email,
          bank_account_holder,
          bank_name,
          bank_swift_code,
          bank_account_number,
          default_conditions,
          default_exchange_rate,
          created_at,
          updated_at,
          clients (*),
          invoice_items (*)
        `
        )
        .eq('id', (invoice as { id: string }).id)
        .single();

      if (refreshError || !refreshed) {
        throw errorHandler.handleSupabaseError(
          refreshError,
          'Fetch created invoice'
        );
      }

      const { normalized } = normalizeInvoiceRecord(
        refreshed as unknown as AnyRecord
      );
      const invoiceValidationResult = validateInvoice(normalized);
      if (!invoiceValidationResult.success) {
        throw new Error(
          invoiceValidationResult.error || 'Invalid invoice data'
        );
      }
      const createdInvoice = invoiceValidationResult.data;

      return {
        payload: { data: createdInvoice },
        status: 201,
        metadata: { invoiceId: createdInvoice.id },
      };
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));
export const POST = withSentryRoute(withAuthRoute(postHandler));
