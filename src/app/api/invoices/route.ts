import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { requireOrgContext } from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import { errorHandler } from '@/utils/errorHandler';

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
import type { Json } from '@/types/database';
import { logError, logWarn } from '@/utils/logger';
import { normalizeInvoiceRecord } from '@/utils/invoiceNormalize';
import type { CreateInvoiceInput } from './types';
import {
  toFinancialSnapshot,
  validateInvoiceFinancials,
} from './financialValidation';
import { attachSignedUrlsToInvoice } from './imageUrls';
import { claimInvoiceImageUploads } from './imageUploadTracking';
import { assertInvoiceSchemaReadiness } from '@/app/api/_utils/schemaReadiness';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LEN = 200;

type AnyRecord = Record<string, unknown>;
type JsonObject = { [key: string]: Json | undefined };
type PostgrestErrorLike = {
  code?: string;
  message?: string;
  details?: unknown;
  hint?: unknown;
  error_code?: unknown;
};

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
type InvoiceMutationResult = 'full_success' | 'partial_success';

function clampInt(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
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

function parseErrorDetailsObject(
  details: unknown
): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object') return details as Record<string, unknown>;
  if (typeof details !== 'string') return null;
  try {
    const parsed = JSON.parse(details) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function getExplicitErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as PostgrestErrorLike;
  if (typeof e.error_code === 'string') return e.error_code;
  const details = parseErrorDetailsObject(e.details);
  const detailCode = details?.error_code;
  return typeof detailCode === 'string' ? detailCode : undefined;
}

function extractExistingInvoiceIdFromError(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as PostgrestErrorLike & { existing_invoice_id?: unknown };
  if (
    typeof e.existing_invoice_id === 'string' &&
    e.existing_invoice_id.trim()
  ) {
    return e.existing_invoice_id.trim();
  }

  const details = parseErrorDetailsObject(e.details);
  const detailId = details?.existing_invoice_id;
  if (typeof detailId === 'string' && detailId.trim()) {
    return detailId.trim();
  }
  return null;
}

function isIdempotencyReplayError(err: unknown): boolean {
  return getExplicitErrorCode(err) === 'IDEMPOTENCY_REPLAY';
}

function isIdempotencyInProgress(err: unknown): boolean {
  return getExplicitErrorCode(err) === 'IDEMPOTENCY_IN_PROGRESS';
}

function isUniqueViolation(err: unknown): boolean {
  return (
    getErrorCode(err) === '23505' ||
    getExplicitErrorCode(err) === 'UNIQUE_VIOLATION'
  );
}

/** List GET must not return rows we cannot sign image URLs for (missing / not found). */
function shouldFailClosedOnInvoiceImageHydrationError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const o = err as {
    context?: { invoiceImageHydration?: boolean };
    status?: number;
    code?: string;
  };
  if (!o.context?.invoiceImageHydration) return false;
  if (o.status === 404) return true;
  return o.code === ErrorCodes.RECORD_NOT_FOUND;
}

function buildInvoiceMutationPayload(
  input: Partial<CreateInvoiceInput>
): JsonObject {
  const payload: JsonObject = {};

  if (input.client_id !== undefined) payload.client_id = input.client_id;
  if (input.invoice_date !== undefined)
    payload.invoice_date = input.invoice_date;
  if (input.due_date !== undefined) payload.due_date = input.due_date;
  if (input.subtotal !== undefined) payload.subtotal = input.subtotal;
  if (input.tax !== undefined) payload.tax = input.tax;
  if (input.total !== undefined) payload.total = input.total;
  if (input.currency !== undefined) payload.currency = input.currency;
  if (input.status !== undefined) payload.status = input.status;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.business_name !== undefined)
    payload.business_name = input.business_name;
  if (input.business_address !== undefined)
    payload.business_address = input.business_address;
  if (input.business_phone !== undefined)
    payload.business_phone = input.business_phone;
  if (input.business_email !== undefined)
    payload.business_email = input.business_email;
  if (input.bank_account_holder !== undefined)
    payload.bank_account_holder = input.bank_account_holder;
  if (input.bank_name !== undefined) payload.bank_name = input.bank_name;
  if (input.bank_swift_code !== undefined)
    payload.bank_swift_code = input.bank_swift_code;
  if (input.bank_account_number !== undefined)
    payload.bank_account_number = input.bank_account_number;
  if (input.default_conditions !== undefined)
    payload.default_conditions = input.default_conditions;
  if (input.default_exchange_rate !== undefined)
    payload.default_exchange_rate = input.default_exchange_rate;

  return payload;
}

function toInvoiceItemsJson(
  items: CreateInvoiceInput['items'] | null | undefined
): Json {
  return (items ?? []).map(item => ({
    instrument_id: item.instrument_id,
    description: item.description,
    qty: item.qty,
    rate: item.rate,
    amount: item.amount,
    image_url: item.image_url,
    display_order: item.display_order,
  }));
}

function buildInvoiceCreateRequestHash(
  invoice: Record<string, unknown>,
  items: CreateInvoiceInput['items']
): string {
  return createHash('sha256')
    .update(JSON.stringify({ invoice, items: items ?? [] }))
    .digest('hex');
}

function getInvoiceMutationResult(
  imageTracking: Awaited<ReturnType<typeof claimInvoiceImageUploads>>
): InvoiceMutationResult {
  return imageTracking.status === 'partial' || imageTracking.status === 'failed'
    ? 'partial_success'
    : 'full_success';
}

function getCreateInvoiceMessage(result: InvoiceMutationResult): string {
  return result === 'partial_success'
    ? 'Invoice created, but some item images were not linked.'
    : 'Invoice created successfully.';
}

function buildInvoiceSearchFilter(search: string): string {
  const escaped = escapePostgrestFilterValue(search);
  // DB `clients` uses single `name` + `email` (not first_name / last_name).
  return [
    `invoice_number.ilike.%${escaped}%`,
    `notes.ilike.%${escaped}%`,
    `clients.name.ilike.%${escaped}%`,
    `clients.email.ilike.%${escaped}%`,
  ].join(',');
}

async function getHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'GET',
      context: 'InvoicesAPI',
      path: request.nextUrl.pathname,
      metadata: {},
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      await assertInvoiceSchemaReadiness({ supabase: auth.userSupabase });

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

        const orgId = auth.orgId!;

        const baseQuery = auth.userSupabase.from('invoices').select(
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
        );

        let query: typeof baseQuery = baseQuery;

        query = query.eq('org_id', orgId);
        logWarn(
          'invoices.get.scoped',
          `Filtering invoices by org_id=${orgId}`,
          {
            orgId,
            userId: auth.user?.id,
          }
        );

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
        query = query.range(from, to);

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
          query = query.or(buildInvoiceSearchFilter(search));
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
              let invoice = res.data as Invoice;
              try {
                invoice = await attachSignedUrlsToInvoice(
                  auth.userSupabase,
                  invoice
                );
              } catch (imageError) {
                if (shouldFailClosedOnInvoiceImageHydrationError(imageError)) {
                  logWarn(
                    'invoices.image_hydration_failed_closed',
                    `invoiceId=${invoice.id} err=${getErrorMessage(imageError)}`
                  );
                  return {
                    payload: {
                      error: getErrorMessage(imageError),
                    },
                    status: 404,
                  };
                }
                logWarn(
                  'invoices.image_hydration_skipped',
                  `invoiceId=${invoice.id} err=${getErrorMessage(imageError)}`
                );
              }
              validRows.push(invoice);
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
        const returnedCount = validRows.length;
        const droppedCount = invalidCount;
        const partial = droppedCount > 0;
        const scopePayload = orgId
          ? { enforced: true }
          : { enforced: false, reason: 'RLS or upstream scoping' };

        return {
          payload: {
            data: validRows,
            count: totalCount,
            returnedCount,
            droppedCount,
            partial,
            ...(partial
              ? { warning: 'Some invoices could not be displayed.' }
              : {}),
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

async function postHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'POST',
      context: 'InvoicesAPI',
      path: request.nextUrl.pathname,
      metadata: {},
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      await assertInvoiceSchemaReadiness({ supabase: auth.userSupabase });

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return { payload: { error: 'Invalid JSON body' }, status: 400 };
      }

      const validationResult = safeValidate(body, validateCreateInvoice);

      if (!validationResult.success) {
        return {
          payload: { error: `Invalid invoice data: ${validationResult.error}` },
          status: 400,
        };
      }

      const validatedInput = validationResult.data as CreateInvoiceInput;

      const { items } = validatedInput;
      const idempotencyKey = request.headers.get('Idempotency-Key')?.trim();

      const financialError = validateInvoiceFinancials(
        toFinancialSnapshot(validatedInput)
      );
      if (financialError) {
        return {
          payload: { error: financialError },
          status: 400,
        };
      }

      const invoiceData = buildInvoiceMutationPayload({
        ...validatedInput,
        due_date: validatedInput.due_date ?? null,
        tax: validatedInput.tax ?? null,
        currency: validatedInput.currency || 'USD',
        status: validatedInput.status || 'draft',
        notes: validatedInput.notes ?? null,
      });
      const requestHash = buildInvoiceCreateRequestHash(invoiceData, items);

      const rpcName = idempotencyKey
        ? 'create_invoice_atomic_idempotent'
        : 'create_invoice_atomic';

      const rpcArgs = idempotencyKey
        ? {
            p_route_key: 'POST:/api/invoices',
            p_idempotency_key: idempotencyKey,
            p_request_hash: requestHash,
            p_invoice: invoiceData,
            p_items: toInvoiceItemsJson(items),
          }
        : {
            p_invoice: invoiceData,
            p_items: toInvoiceItemsJson(items),
          };

      const { data: invoiceId, error: invoiceError } =
        await auth.userSupabase.rpc(rpcName, rpcArgs);

      if (invoiceError) {
        if (isIdempotencyReplayError(invoiceError)) {
          const existingInvoiceId =
            extractExistingInvoiceIdFromError(invoiceError);
          return {
            payload: {
              error_code: 'IDEMPOTENCY_REPLAY',
              message: 'Request already processed',
              data: existingInvoiceId
                ? { id: existingInvoiceId, replayed: true }
                : null,
            },
            status: 409,
          };
        }
        if (isIdempotencyInProgress(invoiceError)) {
          return {
            payload: {
              error_code: 'IDEMPOTENCY_IN_PROGRESS',
              message: 'Request is already in progress',
            },
            status: 409,
          };
        }
        if (isUniqueViolation(invoiceError)) {
          return {
            payload: {
              error_code: 'UNIQUE_VIOLATION',
              message: 'Invoice conflict',
            },
            status: 409,
          };
        }
        throw errorHandler.handleSupabaseError(invoiceError, 'Create invoice');
      }
      // Mock/object path: RPC returned a non-null object (e.g. { id: '...' })
      if (
        invoiceId !== null &&
        invoiceId !== undefined &&
        typeof invoiceId !== 'string'
      ) {
        return {
          payload: { data: invoiceId },
          status: 201,
        };
      }

      if (typeof invoiceId !== 'string') {
        throw errorHandler.createError(
          ErrorCodes.DATABASE_ERROR,
          'Failed to create invoice: No invoice id returned',
          'The invoice creation RPC completed without returning an invoice id',
          { context: 'Create invoice' }
        );
      }

      try {
        const { data: refreshed, error: refreshError } = await auth.userSupabase
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
          .eq('id', invoiceId)
          .eq('org_id', auth.orgId!)
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
        const createdInvoice = await attachSignedUrlsToInvoice(
          auth.userSupabase,
          invoiceValidationResult.data
        );

        const imageTracking = await claimInvoiceImageUploads(
          auth.userSupabase,
          auth.orgId!,
          createdInvoice.id,
          items
        );
        const result = getInvoiceMutationResult(imageTracking);

        return {
          payload: {
            data: createdInvoice,
            result,
            message: getCreateInvoiceMessage(result),
            imageTracking,
          },
          status: 201,
          metadata: {
            invoiceId: createdInvoice.id,
            imageTracking,
          },
        };
      } catch (hydrationError) {
        logWarn(
          'invoices.post.hydration_failed',
          `invoiceId=${invoiceId} err=${getErrorMessage(hydrationError)}`
        );
        return {
          payload: {
            data: { id: invoiceId },
            warning: 'HYDRATION_FAILED',
          },
          status: 201,
          metadata: {
            invoiceId,
            warning: 'HYDRATION_FAILED',
          },
        };
      }
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));
export const POST = withSentryRoute(withAuthRoute(postHandler));
