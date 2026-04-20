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
import type { CreateInvoiceInput, InvoiceFinancialSnapshot } from '../types';
import { validateInvoiceFinancials } from '../financialValidation';
import { attachSignedUrlsToInvoice } from '../imageUrls';
import { claimInvoiceImageUploads } from '../imageUploadTracking';
import type { Json } from '@/types/database';
import { assertInvoiceSchemaReadiness } from '@/app/api/_utils/schemaReadiness';

type InvoiceMutationResult = 'full_success' | 'partial_success';
type JsonObject = { [key: string]: Json | undefined };

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
        payload: { error: 'Organization context required' },
        status: 403,
      };
    }

    await assertInvoiceSchemaReadiness({ supabase: auth.userSupabase });

    if (!validateUUID(id)) {
      return { payload: { error: `Invalid invoice id: ${id}` }, status: 400 };
    }

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
 * - Supports partial invoice fields + optional items replacement
 * - Uses DB RPC to update invoice + items in one transaction
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
        payload: { error: 'Organization context required' },
        status: 403,
      };
    }

    const adminError = requireAdmin(auth);
    if (adminError) {
      return { payload: { error: 'Admin role required' }, status: 403 };
    }

    await assertInvoiceSchemaReadiness({ supabase: auth.userSupabase });

    if (!validateUUID(id)) {
      return { payload: { error: `Invalid invoice id: ${id}` }, status: 400 };
    }

    // JSON parse safety
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return { payload: { error: 'Invalid JSON body' }, status: 400 };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validationResult = safeValidate(body as any, validatePartialInvoice);

    if (!validationResult.success) {
      return {
        payload: {
          error: `Invalid invoice update data: ${validationResult.error}`,
        },
        status: 400,
      };
    }

    const validatedInput = validationResult.data as Partial<CreateInvoiceInput>;
    const orgId = auth.orgId!;

    const itemsProvided = Object.prototype.hasOwnProperty.call(
      validatedInput,
      'items'
    );

    if (
      itemsProvided ||
      validatedInput.subtotal !== undefined ||
      validatedInput.tax !== undefined ||
      validatedInput.total !== undefined
    ) {
      const { data: currentInvoice, error: currentInvoiceError } =
        await auth.userSupabase
          .from('invoices')
          .select('subtotal, tax, total, invoice_items(qty, rate, amount)')
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
          payload: { error: financialError },
          status: 400,
        };
      }
    }

    // Build invoice update object (only apply provided fields)
    const invoiceUpdate: JsonObject = {};
    if (validatedInput.client_id !== undefined)
      invoiceUpdate.client_id = validatedInput.client_id;
    if (validatedInput.invoice_date !== undefined)
      invoiceUpdate.invoice_date = validatedInput.invoice_date;
    if (validatedInput.due_date !== undefined)
      invoiceUpdate.due_date = validatedInput.due_date;
    if (validatedInput.subtotal !== undefined)
      invoiceUpdate.subtotal = validatedInput.subtotal;
    if (validatedInput.tax !== undefined)
      invoiceUpdate.tax = validatedInput.tax;
    if (validatedInput.total !== undefined)
      invoiceUpdate.total = validatedInput.total;
    if (validatedInput.currency !== undefined)
      invoiceUpdate.currency = validatedInput.currency;
    if (validatedInput.status !== undefined)
      invoiceUpdate.status = validatedInput.status;
    if (validatedInput.notes !== undefined)
      invoiceUpdate.notes = validatedInput.notes;
    // Business info fields
    if (validatedInput.business_name !== undefined)
      invoiceUpdate.business_name = validatedInput.business_name;
    if (validatedInput.business_address !== undefined)
      invoiceUpdate.business_address = validatedInput.business_address;
    if (validatedInput.business_phone !== undefined)
      invoiceUpdate.business_phone = validatedInput.business_phone;
    if (validatedInput.business_email !== undefined)
      invoiceUpdate.business_email = validatedInput.business_email;
    // Banking info fields
    if (validatedInput.bank_account_holder !== undefined)
      invoiceUpdate.bank_account_holder = validatedInput.bank_account_holder;
    if (validatedInput.bank_name !== undefined)
      invoiceUpdate.bank_name = validatedInput.bank_name;
    if (validatedInput.bank_swift_code !== undefined)
      invoiceUpdate.bank_swift_code = validatedInput.bank_swift_code;
    if (validatedInput.bank_account_number !== undefined)
      invoiceUpdate.bank_account_number = validatedInput.bank_account_number;
    // Additional fields
    if (validatedInput.default_conditions !== undefined)
      invoiceUpdate.default_conditions = validatedInput.default_conditions;
    if (validatedInput.default_exchange_rate !== undefined)
      invoiceUpdate.default_exchange_rate =
        validatedInput.default_exchange_rate;

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

    // Re-fetch the updated invoice
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
        payload: { error: 'Organization context required' },
        status: 403,
      };
    }

    const adminError = requireAdmin(auth);
    if (adminError) {
      return { payload: { error: 'Admin role required' }, status: 403 };
    }

    await assertInvoiceSchemaReadiness({ supabase: auth.userSupabase });

    if (!validateUUID(id)) {
      return { payload: { error: `Invalid invoice id: ${id}` }, status: 400 };
    }

    const orgId = auth.orgId!;

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
        payload: { error: 'Invoice not found' },
        status: 404,
        metadata: { scope: { enforced: true, orgId } },
      };
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
