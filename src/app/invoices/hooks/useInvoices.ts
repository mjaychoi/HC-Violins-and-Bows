'use client';

import { useState, useCallback, useRef } from 'react';
import type { Invoice, InvoiceStatus } from '@/types';
import { apiFetch } from '@/utils/apiFetch';
import { useErrorHandler } from '@/contexts/ToastContext';
import { logError } from '@/utils/logger';
import {
  createApiResponseError,
  createApiResponseErrorFromResponse,
  readApiErrorBody,
  readApiResponseEnvelope,
} from '@/utils/handleApiResponse';
import { errorHandler } from '@/utils/errorHandler';
import type { AppError } from '@/types/errors';

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
  throwOnError?: boolean;
  suppressErrorToast?: boolean;
}

interface InvoiceListDiagnostics {
  partial: boolean;
  droppedCount: number;
  returnedCount: number;
  warning?: string;
}

export interface CreateInvoiceResult {
  invoice: Invoice | null;
  result: 'full_success' | 'partial_success' | 'already_processed';
  message: string;
  existingInvoiceId: string | null;
  shouldRefreshList: boolean;
  imageTracking?: InvoiceImageTracking | null;
}

export interface InvoiceImageTracking {
  status: 'not_requested' | 'claimed' | 'partial' | 'failed';
  requestedCount: number;
  claimedCount: number;
  missingCount: number;
  missingPaths: string[];
}

export interface UpdateInvoiceResult {
  invoice: Invoice;
  result: 'full_success' | 'partial_success';
  message: string;
  imageTracking: InvoiceImageTracking | null;
}

interface InvoiceCreateErrorPayload {
  error_code?: string;
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

function isSafeIdempotencyConflict(
  status: number,
  payload: InvoiceCreateErrorPayload | null
) {
  if (status !== 409) return false;
  const errorCode =
    typeof payload?.error_code === 'string' ? payload.error_code : null;
  return (
    errorCode === 'IDEMPOTENCY_REPLAY' ||
    errorCode === 'IDEMPOTENCY_IN_PROGRESS'
  );
}

function isConfirmedSuccess(res: unknown): boolean {
  if (!res || typeof res !== 'object') return false;

  const data =
    'data' in res && res.data && typeof res.data === 'object' ? res.data : null;
  return !!(data && 'id' in data && typeof data.id === 'string' && data.id);
}

function shouldPreserveIdempotencyKey(error: unknown): boolean {
  // P0 안전성 우선: 명시적으로 안전한 경우 외에는 키를 유지한다.
  void error;
  return true;
}

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [status, setStatus] = useState<
    'loading' | 'success' | 'empty' | 'error'
  >('loading');
  const [page, setPageState] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [scopeInfo, setScopeInfo] = useState<{
    enforced: boolean;
    orgId?: string | null;
    reason?: string;
  } | null>(null);
  const [listDiagnostics, setListDiagnostics] =
    useState<InvoiceListDiagnostics>({
      partial: false,
      droppedCount: 0,
      returnedCount: 0,
    });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [displayError, setDisplayError] = useState<AppError | null>(null);
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
      setError(null);
      setDisplayError(null);
      setStatus('loading');
      setScopeInfo(null);
      setListDiagnostics({
        partial: false,
        droppedCount: 0,
        returnedCount: 0,
      });
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

        const result = await readApiResponseEnvelope<Invoice[]>(
          response,
          `Failed to fetch invoices (${response.status})`
        );
        const data = Array.isArray(result.data) ? result.data : [];
        const rawCount =
          typeof result.count === 'number' ? result.count : undefined;
        const safeCount = typeof rawCount === 'number' ? rawCount : data.length;
        const partial = result.partial === true;
        const droppedCount =
          typeof result.droppedCount === 'number' ? result.droppedCount : 0;
        const returnedCount =
          typeof result.returnedCount === 'number'
            ? result.returnedCount
            : data.length;
        const warning =
          typeof result.warning === 'string' ? result.warning : undefined;

        if (abortRef.current === controller && !controller.signal.aborted) {
          setInvoices(data);
          setStatus(data.length > 0 || partial ? 'success' : 'empty');
          setTotalCount(safeCount);
          setTotalPages(
            typeof result.totalPages === 'number'
              ? result.totalPages
              : Math.max(1, Math.ceil(safeCount / (options.pageSize || 10)))
          );
          setListDiagnostics({
            partial,
            droppedCount,
            returnedCount,
            warning,
          });

          const scopePayload =
            result.scope && typeof result.scope === 'object'
              ? (result.scope as Record<string, unknown>)
              : null;
          if (scopePayload && typeof scopePayload.enforced === 'boolean') {
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
        setError(error);
        const appError =
          handleError(error, 'Fetch invoices', undefined, {
            notify: !options.suppressErrorToast,
          }) ?? errorHandler.normalizeError(error, 'Fetch invoices');
        setDisplayError(appError);
        if (abortRef.current === controller) {
          setInvoices([]);
          setStatus('error');
          setTotalCount(0);
          setTotalPages(1);
          setScopeInfo(null);
          setListDiagnostics({
            partial: false,
            droppedCount: 0,
            returnedCount: 0,
          });
        }
        if (options.throwOnError) {
          throw error;
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

          const errorData = (await readApiErrorBody(
            response
          )) as InvoiceCreateErrorPayload | null;
          const errorText =
            typeof errorData?.message === 'string'
              ? errorData.message
              : typeof errorData?.error === 'string'
                ? errorData.error
                : '';

          // 에러 메시지 추출 (여러 형태 지원)
          if (errorData && typeof errorData === 'object') {
            const payloadError =
              typeof errorData.payload?.error === 'string'
                ? errorData.payload.error
                : undefined;
            errorMessage =
              (typeof errorData.message === 'string'
                ? errorData.message
                : undefined) || // user-friendly message 우선
              (typeof errorData.error === 'string'
                ? errorData.error
                : undefined) || // error 필드
              payloadError ||
              errorMessage;
          } else if (errorText) {
            errorMessage = errorText;
          }

          const existingInvoiceId = extractExistingInvoiceId(errorData);

          if (isSafeIdempotencyConflict(response.status, errorData)) {
            return {
              invoice: null,
              result: 'already_processed',
              message:
                'This request was already processed. Loading existing invoice.',
              existingInvoiceId,
              shouldRefreshList: !existingInvoiceId,
            };
          }

          throw createApiResponseError(
            errorData as Record<string, unknown> | null,
            {
              status: response.status,
              fallbackMessage: errorMessage,
              requestId: response.headers.get('x-request-id') ?? undefined,
            }
          );
        }

        const result = await readApiResponseEnvelope<Invoice>(
          response,
          `Failed to create invoice (${response.status})`
        );
        if (isConfirmedSuccess(result)) {
          createIdempotencyRef.current = null;
        }
        return {
          invoice: result.data,
          result:
            result.result === 'partial_success'
              ? 'partial_success'
              : 'full_success',
          message:
            typeof result.message === 'string' && result.message.trim()
              ? result.message
              : 'Invoice created successfully.',
          existingInvoiceId:
            result?.data && typeof result.data.id === 'string'
              ? result.data.id
              : null,
          shouldRefreshList: false,
          imageTracking:
            result?.imageTracking && typeof result.imageTracking === 'object'
              ? (result.imageTracking as InvoiceImageTracking)
              : null,
        };
      } catch (error) {
        if (!shouldPreserveIdempotencyKey(error)) {
          createIdempotencyRef.current = null;
        }
        handleError(error, 'Create invoice');
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
    ): Promise<UpdateInvoiceResult> => {
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
          throw await createApiResponseErrorFromResponse(
            response,
            `Failed to update invoice (${response.status})`
          );
        }

        const result = await readApiResponseEnvelope<Invoice>(
          response,
          `Failed to update invoice (${response.status})`
        );
        return {
          invoice: result.data,
          result:
            result.result === 'partial_success'
              ? 'partial_success'
              : 'full_success',
          message:
            typeof result.message === 'string' && result.message.trim()
              ? result.message
              : 'Invoice updated successfully.',
          imageTracking:
            result?.imageTracking && typeof result.imageTracking === 'object'
              ? (result.imageTracking as InvoiceImageTracking)
              : null,
        };
      } catch (error) {
        handleError(error, 'Update invoice');
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
          throw await createApiResponseErrorFromResponse(
            response,
            `Failed to delete invoice (${response.status})`
          );
        }

        await readApiResponseEnvelope<{ id: string }>(
          response,
          `Failed to delete invoice (${response.status})`
        );
        return true;
      } catch (error) {
        handleError(error, 'Delete invoice');
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
    error,
    displayError,
    fetchInvoices,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    setPage,
    scopeInfo,
    listDiagnostics,
  };
}
