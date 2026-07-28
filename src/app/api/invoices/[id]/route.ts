import { NextRequest } from 'next/server';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import {
  requireAdmin,
  requireOrgContext,
} from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import { errorHandler } from '@/utils/errorHandler';

import {
  validateInvoice,
  validatePartialInvoice,
  safeValidate,
} from '@/utils/typeGuards';

import { validateUUID } from '@/utils/inputValidation';
import { normalizeInvoiceRecord } from '@/utils/invoiceNormalize';
import { validateInvoiceStatusTransition } from '@/app/api/_utils/stateTransitions';
import type { CreateInvoiceInput, InvoiceFinancialSnapshot } from '../types';
import { validateInvoiceFinancials } from '../financialValidation';
import {
  attachSignedUrlsToInvoice,
  extractInvoiceImageStoragePaths,
} from '../imageUrls';
import { claimInvoiceImageUploads } from '../imageUploadTracking';
import { logInfo, logError } from '@/utils/logger';
import type { Json } from '@/types/database';
import { assertInvoiceSchemaReadiness } from '@/app/api/_utils/schemaReadiness';
import { writeAuditLog } from '@/utils/auditLog';
import {
  applyScopedRateLimit,
  destructiveMutationRateLimit,
  mutationRateLimit,
  tooManyRequestsApiResult,
} from '@/app/api/_utils/rateLimit';

type InvoiceMutationResult = 'full_success' | 'partial_success';
type JsonObject = { [key: string]: Json | undefined };

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

function buildApiMeta(
  req: NextRequest,
  method: 'GET' | 'PUT' | 'DELETE',
  invoiceId: string
) {
  return {
    method,
    context: 'InvoicesAPI',
    path: req.nextUrl.pathname,
    metadata: { invoiceId },
  };
}

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
      error: 'Invalid request body',
    };
  }

  return {
    ok: true,
    body,
  };
}

function requireIdempotencyKey(request: NextRequest):
  | { ok: true; idempotencyKey: string }
  | {
      ok: false;
      result: {
        payload: {
          error: string;
          error_code: string;
          retryable: false;
          success: false;
        };
        status: 400;
      };
    } {
  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim() ?? '';

  if (!idempotencyKey) {
    return {
      ok: false,
      result: {
        payload: {
          error: 'Idempotency-Key header is required.',
          error_code: 'IDEMPOTENCY_KEY_REQUIRED',
          retryable: false,
          success: false,
        },
        status: 400,
      },
    };
  }

  if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return {
      ok: false,
      result: {
        payload: {
          error: `Idempotency-Key cannot exceed ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
          error_code: 'IDEMPOTENCY_KEY_INVALID',
          retryable: false,
          success: false,
        },
        status: 400,
      },
    };
  }

  return {
    ok: true,
    idempotencyKey,
  };
}

function getInvoiceMutationResult(
  imageTracking: Awaited<ReturnType<typeof claimInvoiceImageUploads>>
): InvoiceMutationResult {
  return imageTracking.status === 'partial' || imageTracking.status === 'failed'
    ? 'partial_success'
    : 'full_success';
}

function getUpdateInvoiceMessage(result: InvoiceMutationResult): string {
  return result === 'partial_success'
    ? 'Invoice updated, but some item images were not linked.'
    : 'Invoice updated successfully.';
}

function toInvoiceItemsJson(
  items: CreateInvoiceInput['items'] | null | undefined
): Json {
  if (items === null) return null;

  return (items ?? []).map((item, index) => ({
    instrument_id: item.instrument_id ?? null,
    description: item.description,
    qty: item.qty,
    rate: item.rate,
    amount: item.amount,
    image_url: item.image_url ?? null,
    display_order: item.display_order ?? index,
  })) as Json;
}

function assignIfProvided<T extends keyof CreateInvoiceInput>(
  target: JsonObject,
  source: Partial<CreateInvoiceInput>,
  key: T
): void {
  if (source[key] !== undefined) {
    target[key] = source[key] as Json;
  }
}

async function assertClientBelongsToOrg(
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

async function assertInvoiceItemInstrumentsBelongToOrg(
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

/**
 * GET /api/invoices/[id]
 */
async function getInvoiceHandler(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  return apiHandler(request, buildApiMeta(request, 'GET', id), async () => {
    const orgContextError = requireOrgContext(auth);
    if (orgContextError) {
      return {
        payload: { error: 'Organization context required', success: false },
        status: 403,
      };
    }

    const adminError = requireAdmin(auth);
    if (adminError) {
      return {
        payload: { error: 'Admin role required', success: false },
        status: 403,
      };
    }

    if (!validateUUID(id)) {
      return {
        payload: { error: `Invalid invoice id: ${id}`, success: false },
        status: 400,
      };
    }

    await assertInvoiceSchemaReadiness({ supabase: auth.userSupabase });

    const orgId = auth.orgId!;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = auth.userSupabase
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
        created_at,
        updated_at,
        clients (*),
        invoice_items (*)
      `
      )
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    const { data, error } = await query;

    if (error || !data) {
      throw errorHandler.handleSupabaseError(error, 'Fetch invoice');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { normalized, metadata } = normalizeInvoiceRecord(data as any);
    const validationResult = validateInvoice(normalized);

    if (!validationResult.success) {
      throw new Error(validationResult.error);
    }

    const hydratedInvoice = await attachSignedUrlsToInvoice(
      auth.userSupabase,
      validationResult.data
    );

    return {
      payload: { data: hydratedInvoice },
      status: 200,
      metadata: {
        ...metadata,
        scope: { enforced: true, orgId },
      },
    };
  });
}

/**
 * PUT /api/invoices/[id]
 * Supports partial invoice fields + optional full items replacement.
 *
 * NOTE:
 * Idempotency-Key is currently a presence guard only.
 * For true replay-safe idempotency, add a DB-backed invoice_update_idempotency map.
 */
async function updateInvoiceHandler(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  return apiHandler(request, buildApiMeta(request, 'PUT', id), async () => {
    const orgContextError = requireOrgContext(auth);
    if (orgContextError) {
      return {
        payload: { error: 'Organization context required', success: false },
        status: 403,
      };
    }

    const adminError = requireAdmin(auth);
    if (adminError) {
      return {
        payload: { error: 'Admin role required', success: false },
        status: 403,
      };
    }

    const rateLimit = await applyScopedRateLimit(mutationRateLimit, {
      orgId: auth.orgId,
      userId: auth.user.id,
      method: 'PUT',
      routeKey: 'invoices/:id',
      ip: request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
    });
    if (rateLimit.limited) {
      return tooManyRequestsApiResult();
    }

    if (!validateUUID(id)) {
      return {
        payload: { error: `Invalid invoice id: ${id}`, success: false },
        status: 400,
      };
    }

    const idempotency = requireIdempotencyKey(request);
    if (!idempotency.ok) {
      return idempotency.result;
    }

    const bodyResult = await readJsonObject(request);
    if (!bodyResult.ok) {
      return {
        payload: { error: bodyResult.error, success: false },
        status: 400,
      };
    }

    if (
      typeof bodyResult.body.id === 'string' &&
      bodyResult.body.id.trim() !== id
    ) {
      return {
        payload: { error: 'Invoice ID mismatch', success: false },
        status: 400,
      };
    }

    const validationResult = safeValidate(
      bodyResult.body,
      validatePartialInvoice
    );

    if (!validationResult.success) {
      return {
        payload: {
          error: `Invalid invoice update data: ${validationResult.error}`,
          success: false,
        },
        status: 400,
      };
    }

    await assertInvoiceSchemaReadiness({ supabase: auth.userSupabase });

    const validatedInput = validationResult.data as Partial<CreateInvoiceInput>;
    const orgId = auth.orgId!;

    const itemsProvided = Object.prototype.hasOwnProperty.call(
      validatedInput,
      'items'
    );

    // Captured inside the pre-fetch block below; used for before/after metadata.
    let financialBefore: {
      subtotal: number | null;
      tax: number | null;
      total: number | null;
    } | null = null;

    const clientScope = await assertClientBelongsToOrg(
      auth,
      orgId,
      validatedInput.client_id
    );

    if (!clientScope.ok) {
      return {
        payload: { error: clientScope.error, success: false },
        status: clientScope.status,
      };
    }

    const itemInstrumentScope = await assertInvoiceItemInstrumentsBelongToOrg(
      auth,
      orgId,
      itemsProvided ? validatedInput.items : null
    );

    if (!itemInstrumentScope.ok) {
      return {
        payload: { error: itemInstrumentScope.error, success: false },
        status: itemInstrumentScope.status,
      };
    }

    if (
      itemsProvided ||
      validatedInput.status !== undefined ||
      validatedInput.subtotal !== undefined ||
      validatedInput.tax !== undefined ||
      validatedInput.total !== undefined
    ) {
      const { data: currentInvoice, error: currentInvoiceError } =
        await auth.userSupabase
          .from('invoices')
          .select(
            'status, subtotal, tax, total, invoice_items(qty, rate, amount)'
          )
          .eq('id', id)
          .eq('org_id', orgId)
          .single();

      if (currentInvoiceError || !currentInvoice) {
        throw errorHandler.handleSupabaseError(
          currentInvoiceError,
          'Fetch invoice financials'
        );
      }

      const currentItems = Array.isArray(currentInvoice.invoice_items)
        ? currentInvoice.invoice_items
        : [];

      financialBefore = {
        subtotal:
          currentInvoice.subtotal != null
            ? Number(currentInvoice.subtotal)
            : null,
        tax: currentInvoice.tax != null ? Number(currentInvoice.tax) : null,
        total:
          currentInvoice.total != null ? Number(currentInvoice.total) : null,
      };

      if (validatedInput.status !== undefined) {
        if (typeof currentInvoice.status !== 'string') {
          return {
            payload: {
              error: 'Current invoice status is invalid.',
              success: false,
            },
            status: 409,
          };
        }

        const transitionError = validateInvoiceStatusTransition(
          currentInvoice.status as NonNullable<CreateInvoiceInput['status']>,
          validatedInput.status as NonNullable<CreateInvoiceInput['status']>
        );

        if (transitionError) {
          return {
            payload: { error: transitionError, success: false },
            status: 409,
          };
        }
      }

      const financialSnapshot: InvoiceFinancialSnapshot = {
        subtotal:
          validatedInput.subtotal !== undefined
            ? validatedInput.subtotal
            : Number(currentInvoice.subtotal ?? 0),
        tax:
          validatedInput.tax !== undefined
            ? (validatedInput.tax ?? null)
            : currentInvoice.tax === null || currentInvoice.tax === undefined
              ? null
              : Number(currentInvoice.tax),
        total:
          validatedInput.total !== undefined
            ? validatedInput.total
            : Number(currentInvoice.total ?? 0),
        items: itemsProvided
          ? Array.isArray(validatedInput.items)
            ? validatedInput.items
            : []
          : currentItems.map(item => ({
              instrument_id: null,
              description: '',
              qty: Number(item.qty ?? 0),
              rate: Number(item.rate ?? 0),
              amount: Number(item.amount ?? 0),
              image_url: null,
              display_order: 0,
            })),
      };

      const financialError = validateInvoiceFinancials(financialSnapshot);
      if (financialError) {
        return {
          payload: { error: financialError, success: false },
          status: 400,
        };
      }
    }

    const invoiceUpdate: JsonObject = {};

    assignIfProvided(invoiceUpdate, validatedInput, 'client_id');
    assignIfProvided(invoiceUpdate, validatedInput, 'invoice_date');
    assignIfProvided(invoiceUpdate, validatedInput, 'due_date');
    assignIfProvided(invoiceUpdate, validatedInput, 'subtotal');
    assignIfProvided(invoiceUpdate, validatedInput, 'tax');
    assignIfProvided(invoiceUpdate, validatedInput, 'total');
    assignIfProvided(invoiceUpdate, validatedInput, 'currency');
    assignIfProvided(invoiceUpdate, validatedInput, 'status');
    assignIfProvided(invoiceUpdate, validatedInput, 'notes');

    assignIfProvided(invoiceUpdate, validatedInput, 'business_name');
    assignIfProvided(invoiceUpdate, validatedInput, 'business_address');
    assignIfProvided(invoiceUpdate, validatedInput, 'business_phone');
    assignIfProvided(invoiceUpdate, validatedInput, 'business_email');

    assignIfProvided(invoiceUpdate, validatedInput, 'bank_account_holder');
    assignIfProvided(invoiceUpdate, validatedInput, 'bank_name');
    assignIfProvided(invoiceUpdate, validatedInput, 'bank_swift_code');
    assignIfProvided(invoiceUpdate, validatedInput, 'bank_account_number');

    assignIfProvided(invoiceUpdate, validatedInput, 'default_conditions');
    assignIfProvided(invoiceUpdate, validatedInput, 'default_exchange_rate');

    if (Object.keys(invoiceUpdate).length === 0 && !itemsProvided) {
      return {
        payload: { error: 'No valid fields to update', success: false },
        status: 400,
      };
    }

    const { error: updateError } = await auth.userSupabase.rpc(
      'update_invoice_atomic',
      {
        p_invoice_id: id,
        p_invoice: invoiceUpdate,
        p_items: itemsProvided
          ? toInvoiceItemsJson(validatedInput.items)
          : null,
      }
    );

    if (updateError) {
      throw errorHandler.handleSupabaseError(updateError, 'Update invoice');
    }

    const fetchQuery = auth.userSupabase
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
          created_at,
          updated_at,
          clients (*),
          invoice_items (*)
        `
      )
      .eq('id', id)
      .eq('org_id', orgId);

    const { data: updated, error: fetchError } = await fetchQuery.single();

    if (fetchError || !updated) {
      throw errorHandler.handleSupabaseError(
        fetchError,
        'Fetch updated invoice'
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { normalized, metadata } = normalizeInvoiceRecord(updated as any);
    const validated = validateInvoice(normalized);

    if (!validated.success) {
      throw new Error(validated.error);
    }

    const hydratedInvoice = await attachSignedUrlsToInvoice(
      auth.userSupabase,
      validated.data
    );

    const imageTracking = await claimInvoiceImageUploads(
      auth.userSupabase,
      orgId,
      id,
      itemsProvided ? validatedInput.items : null
    );

    const result = getInvoiceMutationResult(imageTracking);

    if (validatedInput.status !== undefined) {
      void writeAuditLog({
        orgId,
        actorId: auth.user.id,
        actorRole: auth.role as 'admin' | 'member' | 'service',
        action: 'invoice.update_status',
        resourceType: 'invoice',
        resourceId: id,
        metadata: { status: validatedInput.status },
      });
    }

    const hasFinancialChange =
      itemsProvided ||
      validatedInput.subtotal !== undefined ||
      validatedInput.tax !== undefined ||
      validatedInput.total !== undefined;

    if (hasFinancialChange) {
      void writeAuditLog({
        orgId,
        actorId: auth.user.id,
        actorRole: auth.role as 'admin' | 'member' | 'service',
        action: 'invoice.update_financials',
        resourceType: 'invoice',
        resourceId: id,
        metadata: {
          changed_fields: [
            ...(validatedInput.subtotal !== undefined ? ['subtotal'] : []),
            ...(validatedInput.tax !== undefined ? ['tax'] : []),
            ...(validatedInput.total !== undefined ? ['total'] : []),
            ...(itemsProvided ? ['items'] : []),
          ],
          ...(financialBefore !== null && { before: financialBefore }),
        },
      });
    }

    return {
      payload: {
        data: hydratedInvoice,
        result,
        message: getUpdateInvoiceMessage(result),
        imageTracking,
      },
      status: 200,
      metadata: {
        ...metadata,
        scope: { enforced: true, orgId },
        imageTracking,
        idempotencyKeyPresent: true,
      },
    };
  });
}

/**
 * DELETE /api/invoices/[id]
 */
async function deleteInvoiceHandler(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  return apiHandler(request, buildApiMeta(request, 'DELETE', id), async () => {
    const orgContextError = requireOrgContext(auth);
    if (orgContextError) {
      return {
        payload: { error: 'Organization context required', success: false },
        status: 403,
      };
    }

    const adminError = requireAdmin(auth);
    if (adminError) {
      return {
        payload: { error: 'Admin role required', success: false },
        status: 403,
      };
    }

    const rateLimit = await applyScopedRateLimit(destructiveMutationRateLimit, {
      orgId: auth.orgId,
      userId: auth.user.id,
      method: 'DELETE',
      routeKey: 'invoices/:id',
      ip: request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
    });
    if (rateLimit.limited) {
      return tooManyRequestsApiResult();
    }

    if (!validateUUID(id)) {
      return {
        payload: { error: `Invalid invoice id: ${id}`, success: false },
        status: 400,
      };
    }

    await assertInvoiceSchemaReadiness({ supabase: auth.userSupabase });

    const orgId = auth.orgId!;

    // Fetch invoice_items image URLs before deletion for storage cleanup
    const { data: items, error: itemsError } = await auth.userSupabase
      .from('invoice_items')
      .select('image_url')
      .eq('invoice_id', id)
      .eq('org_id', orgId);

    if (itemsError) {
      throw errorHandler.handleSupabaseError(
        itemsError,
        'Fetch invoice items for delete'
      );
    }

    const storagePaths = extractInvoiceImageStoragePaths(items ?? [], orgId);

    const { error, count } = await auth.userSupabase
      .from('invoices')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) {
      throw errorHandler.handleSupabaseError(error, 'Delete invoice');
    }

    if (!count || count === 0) {
      return {
        payload: { error: 'Invoice not found', success: false },
        status: 404,
        metadata: { scope: { enforced: true, orgId } },
      };
    }

    logInfo('invoice_delete_success', 'InvoicesAPI', {
      invoiceId: id,
      orgId,
      storagePathsToClean: storagePaths.length,
    });

    void writeAuditLog({
      orgId,
      actorId: auth.user.id,
      actorRole: auth.role as 'admin' | 'member' | 'service',
      action: 'invoice.delete',
      resourceType: 'invoice',
      resourceId: id,
    });

    // Clean up Supabase Storage invoice item images — DB rows already gone via cascade.
    // Non-fatal: log + persist to orphaned_storage_objects for retry.
    if (storagePaths.length > 0) {
      const { error: storageError } = await auth.userSupabase.storage
        .from('invoices')
        .remove(storagePaths);

      if (storageError) {
        logError(
          'invoice_storage_cleanup_failed',
          storageError,
          'InvoicesAPI',
          {
            invoiceId: id,
            orgId,
            paths: storagePaths,
          }
        );
        for (const path of storagePaths) {
          await auth.userSupabase.from('orphaned_storage_objects').insert({
            org_id: orgId,
            storage_key: path,
            bucket: 'invoices',
            source: 'invoice_delete',
            error_message: storageError.message,
          });
        }
      }
    }

    return {
      payload: { data: { id } },
      status: 200,
      metadata: {
        scope: { enforced: true, orgId },
      },
    };
  });
}

// ---- Next.js App Router handlers ----
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const handler = withSentryRoute(
    withAuthRoute(async (r, auth) => getInvoiceHandler(r, auth, id))
  );

  return handler(req);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const handler = withSentryRoute(
    withAuthRoute(async (r, auth) => updateInvoiceHandler(r, auth, id))
  );

  return handler(req);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const handler = withSentryRoute(
    withAuthRoute(async (r, auth) => deleteInvoiceHandler(r, auth, id))
  );

  return handler(req);
}
