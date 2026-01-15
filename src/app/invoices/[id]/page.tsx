'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/common/inputs';
import { ConfirmDialog, EmptyState } from '@/components/common';
import type { Invoice, InvoiceStatus } from '@/types';
import { apiFetch } from '@/utils/apiFetch';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import OptimizedImage from '@/components/common/OptimizedImage';
import { cn } from '@/utils/classNames';
import InvoiceSettingsPanel from '../components/InvoiceSettingsPanel';

const InvoiceModalDynamic = dynamic(
  () => import('../components/InvoiceModal'),
  {
    ssr: false,
  }
);

type InvoicePayload = {
  client_id: string | null;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  tax: number | null;
  total: number;
  currency: string;
  status: InvoiceStatus;
  notes: string | null;
  items: Array<{
    instrument_id: string | null;
    description: string;
    qty: number;
    rate: number;
    amount: number;
    image_url: string | null;
    display_order: number;
  }>;
};

const statusColors: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
  void: 'bg-gray-50 text-gray-400',
};

export default function InvoiceDetailPage() {
  const params = useParams() as { id?: string | string[] };
  const rawId = params.id;
  const invoiceId =
    typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : '';

  const router = useRouter();
  const { showSuccess, handleError } = useAppFeedback();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const pdfIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const fetchInvoice = useCallback(async () => {
    if (!invoiceId) {
      setInvoice(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await apiFetch(`/api/invoices/${invoiceId}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Failed to fetch invoice');
      }

      setInvoice(result.data as Invoice);
    } catch (error) {
      handleError(error, 'Fetch invoice');
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, [invoiceId, handleError]);

  useEffect(() => {
    void fetchInvoice();
  }, [fetchInvoice]);

  const formatCurrency = useCallback((amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }, []);

  const formatDate = useCallback((dateString: string) => {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const clientName = useMemo(() => {
    if (!invoice?.client) return '—';
    const name =
      `${invoice.client.first_name || ''} ${invoice.client.last_name || ''}`.trim();
    return name || invoice.client.email || 'Unknown';
  }, [invoice?.client]);

  const handleUpdate = useCallback(
    async (data: InvoicePayload) => {
      if (!invoiceId) return;
      setSubmitting(true);
      try {
        const response = await apiFetch(`/api/invoices/${invoiceId}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result?.error || 'Failed to update invoice');
        }

        setInvoice(result.data as Invoice);
        showSuccess('Invoice updated');
        setIsModalOpen(false);
      } catch (error) {
        handleError(error, 'Update invoice');
      } finally {
        setSubmitting(false);
      }
    },
    [invoiceId, handleError, showSuccess]
  );

  const handleDelete = useCallback(async () => {
    if (submitting) return;
    if (!invoiceId) return;
    setSubmitting(true);
    try {
      const response = await apiFetch(`/api/invoices/${invoiceId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete invoice');
      }

      showSuccess('Invoice deleted');
      router.push('/invoices');
    } catch (error) {
      handleError(error, 'Delete invoice');
    } finally {
      setSubmitting(false);
      setConfirmDeleteOpen(false);
    }
  }, [invoiceId, router, handleError, showSuccess, submitting]);

  if (loading) {
    return (
      <AppLayout title="Invoice">
        <div className="p-6 space-y-6">
          <div className="text-sm text-gray-600">Loading invoice...</div>
        </div>
      </AppLayout>
    );
  }

  if (!invoice) {
    return (
      <AppLayout title="Invoice">
        <div className="p-6">
          <EmptyState
            title="Invoice not found"
            description="Try going back to the invoices list."
            actionButton={{
              label: 'Back to invoices',
              onClick: () => router.push('/invoices'),
            }}
          />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`Invoice ${invoice.invoice_number}`}>
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link
                href="/invoices"
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                Back to invoices
              </Link>
              <span
                className={cn(
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                  statusColors[invoice.status] || statusColors.draft
                )}
              >
                {invoice.status.charAt(0).toUpperCase() +
                  invoice.status.slice(1)}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">
              {invoice.invoice_number}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Invoice date: {formatDate(invoice.invoice_date)}
              {invoice.due_date
                ? ` · Due: ${formatDate(invoice.due_date)}`
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* <Link
              href={`/api/invoices/${invoice.id}/pdf`}
              target="_blank"
              className="px-3 py-2 text-sm rounded-md bg-gray-200 text-gray-900 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Open PDF
            </Link> */}
            <Button
              variant="secondary"
              disabled={submitting}
              onClick={() => setIsModalOpen(true)}
            >
              Edit
            </Button>
            <Button
              variant="danger"
              disabled={submitting}
              onClick={() => setConfirmDeleteOpen(true)}
            >
              Delete
            </Button>
          </div>
        </div>

        {/* Invoice Settings (prefilled & editable, same page) */}
        <InvoiceSettingsPanel
          onSaved={() => {
            if (pdfIframeRef.current) {
              pdfIframeRef.current.src = `/api/invoices/${invoice.id}/pdf?inline=true&ts=${Date.now()}`;
            }
          }}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700">
                    Billed To
                  </h2>
                  <div className="mt-2 text-sm text-gray-900 font-medium">
                    {clientName}
                  </div>
                  {invoice.client?.email && (
                    <div className="text-sm text-gray-600">
                      {invoice.client.email}
                    </div>
                  )}
                  {invoice.client?.contact_number && (
                    <div className="text-sm text-gray-600">
                      {invoice.client.contact_number}
                    </div>
                  )}
                  {invoice.client?.address && (
                    <div className="text-sm text-gray-600">
                      {invoice.client.address}
                    </div>
                  )}
                </div>
                <div className="text-right text-sm text-gray-600">
                  <div>Currency: {invoice.currency}</div>
                  <div>Status: {invoice.status}</div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700">Items</h2>
                <div className="text-sm text-gray-500">
                  {invoice.items?.length || 0}{' '}
                  {invoice.items?.length === 1 ? 'item' : 'items'}
                </div>
              </div>
              {invoice.items && invoice.items.length > 0 ? (
                <div className="space-y-3">
                  {invoice.items.map((item, index) => (
                    <div
                      key={item.id || index}
                      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-start gap-4">
                        {item.image_url && (
                          <div className="w-20 h-20 shrink-0">
                            <OptimizedImage
                              src={item.image_url}
                              alt={item.description}
                              width={80}
                              height={80}
                              className="rounded-lg object-cover"
                            />
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {item.description}
                          </div>
                          {item.instrument && (
                            <div className="text-xs text-gray-500">
                              {item.instrument.serial_number ||
                                item.instrument.id}{' '}
                              · {item.instrument.maker || 'Unknown'}{' '}
                              {item.instrument.type || ''}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-gray-700 text-right">
                        <div>
                          {item.qty} ×{' '}
                          {formatCurrency(item.rate, invoice.currency)}
                        </div>
                        <div className="font-semibold text-gray-900">
                          {formatCurrency(item.amount, invoice.currency)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No items.</div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-sm font-semibold text-gray-700">Totals</h2>
              <div className="mt-4 space-y-2 text-sm text-gray-700">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>
                    {formatCurrency(invoice.subtotal, invoice.currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>
                    {formatCurrency(invoice.tax || 0, invoice.currency)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold text-gray-900">
                  <span>Total</span>
                  <span>{formatCurrency(invoice.total, invoice.currency)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-sm font-semibold text-gray-700">Notes</h2>
              <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">
                {invoice.notes || 'No notes.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <InvoiceModalDynamic
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        invoice={invoice}
        isEditing
        onSubmit={handleUpdate}
        submitting={submitting}
      />

      <ConfirmDialog
        isOpen={confirmDeleteOpen}
        title="Delete invoice?"
        message={`Delete ${invoice.invoice_number}? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </AppLayout>
  );
}
