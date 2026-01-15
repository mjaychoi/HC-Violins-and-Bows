import { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';

import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';

import {
  validateInvoice,
  validatePartialInvoice,
  safeValidate,
} from '@/utils/typeGuards';

import { validateUUID } from '@/utils/inputValidation';
import { logWarn, logError } from '@/utils/logger';
import { normalizeInvoiceRecord } from '@/utils/invoiceNormalize';

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

function buildApiMeta(
  req: NextRequest,
  method: 'GET' | 'PUT' | 'DELETE',
  invoiceId: string
) {
  return {
    method,
    context: 'InvoicesAPI',
    // apiHandler 내부에서도 req.nextUrl.pathname 쓰지만, meta 타입이 path 필수인 경우가 많아서 넣어줌
    path: req.nextUrl.pathname,
    metadata: { invoiceId },
  };
}

/**
 * GET /api/invoices/[id]
 */
async function getInvoiceHandler(request: NextRequest, user: User, id: string) {
  return apiHandler(request, buildApiMeta(request, 'GET', id), async () => {
    if (!validateUUID(id)) {
      return { payload: { error: `Invalid invoice id: ${id}` }, status: 400 };
    }

    const supabase = getServerSupabase();
    const { orgId } = getOrgScopeFromUser(user);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
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
      .single();

    if (orgId) query = query.eq('org_id', orgId);

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
    return {
      payload: { data: validationResult.data },
      status: 200,
      metadata: {
        ...metadata,
        scope: orgId
          ? { enforced: true, orgId }
          : { enforced: false, reason: 'RLS or upstream scoping expected' },
      },
    };
  });
}

/**
 * PUT /api/invoices/[id]
 * - Supports partial invoice fields + optional items replacement
 * - Safer items update: backup old items, delete -> insert, rollback on insert failure (best-effort)
 */
async function updateInvoiceHandler(
  request: NextRequest,
  user: User,
  id: string
) {
  return apiHandler(request, buildApiMeta(request, 'PUT', id), async () => {
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

    // ✅ safeValidate(arg order) 유지 (data first, validator second)
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validatedInput = validationResult.data as any;
    const supabase = getServerSupabase();
    const { orgId } = getOrgScopeFromUser(user);

    // Build invoice update object (only apply provided fields)
    const invoiceUpdate: Record<string, unknown> = {};
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

    // 1) Update invoice row (only if there are invoice fields)
    if (Object.keys(invoiceUpdate).length > 0) {
      let updateQuery = supabase
        .from('invoices')
        .update(invoiceUpdate)
        .eq('id', id);
      if (orgId) updateQuery = updateQuery.eq('org_id', orgId as string);

      const { error: invoiceError } = await updateQuery;
      if (invoiceError) {
        throw errorHandler.handleSupabaseError(invoiceError, 'Update invoice');
      }
    }

    // 2) Replace items if provided (validatedPartialInvoice likely allows items?: [])
    const itemsProvided = Object.prototype.hasOwnProperty.call(
      validatedInput,
      'items'
    );
    if (itemsProvided) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newItems: any[] = Array.isArray(validatedInput.items)
        ? validatedInput.items
        : [];

      // Backup old items for rollback
      const { data: oldItems, error: oldItemsError } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', id);

      if (oldItemsError) {
        throw errorHandler.handleSupabaseError(
          oldItemsError,
          'Fetch existing invoice items'
        );
      }

      // Delete existing items (check error!)
      const { error: deleteError } = await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_id', id);

      if (deleteError) {
        throw errorHandler.handleSupabaseError(
          deleteError,
          'Delete existing invoice items'
        );
      }

      // Insert new items (if any)
      if (newItems.length > 0) {
        const itemRows = newItems.map(item => ({
          ...item,
          invoice_id: id,
        }));

        const { error: insertError } = await supabase
          .from('invoice_items')
          .insert(itemRows);

        if (insertError) {
          // Best-effort rollback: restore old items
          if (Array.isArray(oldItems) && oldItems.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const restoreRows = oldItems.map((it: any) => {
              const row = { ...(it ?? {}) };
              delete row.id;
              delete row.created_at;
              delete row.updated_at;
              return row;
            });

            const { error: restoreError } = await supabase
              .from('invoice_items')
              .insert(restoreRows);

            if (restoreError) {
              logError(
                'invoice_items.restore_failed',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                `invoiceId=${id} restoreError=${String((restoreError as any)?.message || restoreError)}`
              );
            } else {
              logWarn(
                'invoice_items.restore_succeeded_after_insert_failure',
                `invoiceId=${id}`
              );
            }
          }

          throw errorHandler.handleSupabaseError(
            insertError,
            'Insert updated invoice items'
          );
        }
      }
    }

    // 3) Re-fetch the updated invoice
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fetchQuery: any = supabase
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
      .single();

    if (orgId) fetchQuery = fetchQuery.eq('org_id', orgId);

    const { data: updated, error: fetchError } = await fetchQuery;

    if (fetchError || !updated) {
      throw errorHandler.handleSupabaseError(
        fetchError,
        'Fetch updated invoice'
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { normalized, metadata } = normalizeInvoiceRecord(updated as any);
    const validated = validateInvoice(normalized);

    return {
      payload: { data: validated },
      status: 200,
      metadata: {
        ...metadata,
        scope: orgId
          ? { enforced: true, orgId }
          : { enforced: false, reason: 'RLS or upstream scoping expected' },
      },
    };
  });
}

/**
 * DELETE /api/invoices/[id]
 */
async function deleteInvoiceHandler(
  request: NextRequest,
  user: User,
  id: string
) {
  return apiHandler(request, buildApiMeta(request, 'DELETE', id), async () => {
    if (!validateUUID(id)) {
      return { payload: { error: `Invalid invoice id: ${id}` }, status: 400 };
    }

    const supabase = getServerSupabase();
    const { orgId } = getOrgScopeFromUser(user);

    let del = supabase.from('invoices').delete().eq('id', id);
    if (orgId) del = del.eq('org_id', orgId);

    const { error } = await del;

    if (error) {
      throw errorHandler.handleSupabaseError(error, 'Delete invoice');
    }

    return {
      payload: { data: { id } },
      status: 200,
      metadata: {
        scope: orgId
          ? { enforced: true, orgId }
          : { enforced: false, reason: 'RLS or upstream scoping expected' },
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
    withAuthRoute(async (r, user) => getInvoiceHandler(r, user, id))
  );
  return handler(req);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const handler = withSentryRoute(
    withAuthRoute(async (r, user) => updateInvoiceHandler(r, user, id))
  );
  return handler(req);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const handler = withSentryRoute(
    withAuthRoute(async (r, user) => deleteInvoiceHandler(r, user, id))
  );
  return handler(req);
}
