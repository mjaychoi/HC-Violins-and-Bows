'use client';

import { useState, useCallback, useRef } from 'react';
import type { Invoice, InvoiceStatus } from '@/types';
import { apiFetch } from '@/utils/apiFetch';
import { useErrorHandler } from '@/contexts/ToastContext';
import { logError } from '@/utils/logger';
interface FetchInvoicesOptions {
  page?: number;
  pageSize?: number;
  fromDate?: string;
  toDate?: string;
  search?: string;
  clientId?: string;
  status?: string;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface CreateInvoiceResult {
  invoice: Invoice | null;
  status: 'created' | 'already_processed';
  message: string;
  existingInvoiceId: string | null;
  shouldRefreshList: boolean;
}

interface InvoiceCreateErrorPayload {
  message?: string;
  error?: string;
  payload?: { error?: string };
  data?: Record<string, unknown> | null;
  existingInvoiceId?: string;
  existing_invoice_id?: string;
  invoiceId?: string;
  invoice_id?: string;
  resourceId?: string;
  resource_id?: string;
}

function extractExistingInvoiceId(
  payload: InvoiceCreateErrorPayload | null
): string | null {
  if (!payload) return null;

  const nested = payload.data;
  const candidates = [
    payload.existingInvoiceId,
    payload.existing_invoice_id,
    payload.invoiceId,
    payload.invoice_id,
    payload.resourceId,
    payload.resource_id,
    nested && typeof nested.id === 'string' ? nested.id : null,
    nested && typeof nested.invoiceId === 'string' ? nested.invoiceId : null,
    nested && typeof nested.invoice_id === 'string' ? nested.invoice_id : null,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function isSafeIdempotencyConflict(status: number, message: string) {
  if (status !== 409) return false;

  const normalized = message.toLowerCase();
  if (normalized.includes('different payload')) return false;

  return (
    normalized.includes('already processed') ||
    normalized.includes('already being processed') ||
    normalized.includes('duplicate request') ||
    normalized.includes('idempotent request') ||
    normalized.includes('idempotency')
  );
}

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [status, setStatus] = useState<
    'loading' | 'success' | 'empty' | 'error'
  >('empty');
  const [page, setPageState] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [scopeInfo, setScopeInfo] = useState<{
    enforced: boolean;
    orgId?: string | null;
    reason?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const { handleError } = useErrorHandler();
  const abortRef = useRef<AbortController | null>(null);
  const createIdempotencyRef = useRef<string | null>(null);

  const setPage = useCallback((nextPage: number) => {
    setPageState(nextPage);
  }, []);

  const fetchInvoices = useCallback(
    async (options: FetchInvoicesOptions = {}) => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      setLoading(true);
      setStatus('loading');
      setScopeInfo(null);
      const currentPage = options.page || page;

      try {
        const params = new URLSearchParams();
        params.set('page', String(currentPage));
        params.set('pageSize', String(options.pageSize || 10));

        if (options.fromDate) params.set('fromDate', options.fromDate);
        if (options.toDate) params.set('toDate', options.toDate);
        if (options.search) params.set('search', options.search);
        if (options.clientId) params.set('client_id', options.clientId);
        if (options.status) params.set('status', options.status);
        if (options.sortColumn) params.set('sortColumn', options.sortColumn);
        if (options.sortDirection)
          params.set('sortDirection', options.sortDirection);

        const response = await apiFetch(`/api/invoices?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          let errorMessage = 'Failed to fetch invoices';
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const result = await response.json();
        // API handler returns payload directly, so result already contains { data, count, page, pageSize }
        const data = result.data || [];
        const rawCount =
          typeof result.count === 'number' ? result.count : undefined;
        const safeCount = typeof rawCount === 'number' ? rawCount : data.length;

        if (abortRef.current === controller && !controller.signal.aborted) {
          setInvoices(data);
          setStatus(data.length > 0 ? 'success' : 'empty');
          setTotalCount(safeCount);
          setTotalPages(
            typeof result.totalPages === 'number'
              ? result.totalPages
              : Math.max(1, Math.ceil(safeCount / (options.pageSize || 10)))
          );

          const scopePayload = result.scope;
          if (
            scopePayload &&
            typeof scopePayload === 'object' &&
            typeof scopePayload.enforced === 'boolean'
          ) {
            setScopeInfo({
              enforced: scopePayload.enforced,
              orgId:
                typeof scopePayload.orgId === 'string'
                  ? scopePayload.orgId
                  : null,
              reason:
                typeof scopePayload.reason === 'string'
                  ? scopePayload.reason
                  : undefined,
            });
          } else {
            setScopeInfo(null);
          }
        }

        return data as Invoice[];
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          return [];
        }
        // Log the actual error for debugging
        logError(
          'Error fetching invoices:',
          error instanceof Error ? error.message : String(error)
        );
        handleError(
          error instanceof Error ? error.message : String(error),
          'Fetch invoices'
        );
        if (abortRef.current === controller) {
          setInvoices([]);
          setStatus('error');
          setTotalCount(0);
          setTotalPages(1);
          setScopeInfo(null);
        }
        return [];
      } finally {
        if (abortRef.current === controller && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [page, handleError]
  );

  const createInvoice = useCallback(
    async (
      invoiceData: {
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
      },
      options?: { idempotencyKey?: string }
    ): Promise<CreateInvoiceResult> => {
      try {
        if (!createIdempotencyRef.current) {
          createIdempotencyRef.current =
            options?.idempotencyKey ||
            (typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `invoice-create-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
        }
        const idempotencyKey = createIdempotencyRef.current;
        const response = await apiFetch(
          '/api/invoices',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(invoiceData),
          },
          { idempotencyKey }
        );

        if (!response.ok) {
          let errorMessage = 'Failed to create invoice';

          // ✅ 개선된 에러 처리: text()로 먼저 읽어서 빈 바디도 처리
          let errorText = '';
          let errorData: InvoiceCreateErrorPayload | null = null;

          try {
            errorText = await response.text();
            if (errorText) {
              try {
                errorData = JSON.parse(errorText) as InvoiceCreateErrorPayload;
              } catch {
                // JSON이 아니면 그대로 텍스트로 사용
                errorText = errorText.trim();
              }
            }
          } catch (readError) {
            console.error('Failed to read error response:', readError);
          }

          // 에러 메시지 추출 (여러 형태 지원)
          if (errorData && typeof errorData === 'object') {
            errorMessage =
              errorData.message || // user-friendly message 우선
              errorData.error || // error 필드
              errorData.payload?.error ||
              errorMessage;
          } else if (errorText) {
            errorMessage = errorText;
          }

          const existingInvoiceId = extractExistingInvoiceId(errorData);

          if (isSafeIdempotencyConflict(response.status, errorMessage)) {
            createIdempotencyRef.current = null;
            return {
              invoice: null,
              status: 'already_processed',
              message:
                'This request was already processed. Loading existing invoice.',
              existingInvoiceId,
              shouldRefreshList: !existingInvoiceId,
            };
          }

          // 상세 정보 로깅 (개발 환경)
          if (process.env.NODE_ENV === 'development') {
            console.error('Invoice creation error response:', {
              status: response.status,
              statusText: response.statusText,
              errorText,
              errorData,
            });
          }

          throw new Error(errorMessage);
        }

        const result = await response.json();
        createIdempotencyRef.current = null;
        return {
          invoice: result.data as Invoice,
          status: 'created',
          message: 'Invoice created successfully.',
          existingInvoiceId:
            result?.data && typeof result.data.id === 'string'
              ? result.data.id
              : null,
          shouldRefreshList: false,
        };
      } catch (error) {
        createIdempotencyRef.current = null;
        handleError(
          error instanceof Error ? error.message : String(error),
          'Create invoice'
        );
        throw error;
      }
    },
    [handleError]
  );

  const updateInvoice = useCallback(
    async (
      id: string,
      invoiceData: Partial<{
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
      }>
    ) => {
      try {
        // Filter out undefined values to avoid validation errors
        // Keep null values as they are valid for nullable fields
        const cleanedData = Object.fromEntries(
          Object.entries(invoiceData).filter(([, value]) => value !== undefined)
        );

        const response = await apiFetch(`/api/invoices/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(cleanedData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update invoice');
        }

        const result = await response.json();
        return result.data as Invoice;
      } catch (error) {
        handleError(
          error instanceof Error ? error.message : String(error),
          'Update invoice'
        );
        throw error;
      }
    },
    [handleError]
  );

  const deleteInvoice = useCallback(
    async (id: string) => {
      try {
        const response = await apiFetch(`/api/invoices/${id}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to delete invoice');
        }

        return true;
      } catch (error) {
        handleError(
          error instanceof Error ? error.message : String(error),
          'Delete invoice'
        );
        throw error;
      }
    },
    [handleError]
  );

  return {
    invoices,
    status,
    page,
    totalCount,
    totalPages,
    loading,
    fetchInvoices,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    setPage,
    scopeInfo,
  };
}
