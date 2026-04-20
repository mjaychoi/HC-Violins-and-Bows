import { renderHook, waitFor, act } from '@testing-library/react';
import { useInvoices } from '../useInvoices';
import { apiFetch } from '@/utils/apiFetch';
import { useErrorHandler } from '@/contexts/ToastContext';
import { ApiResponseError } from '@/utils/handleApiResponse';

jest.mock('@/utils/apiFetch');
jest.mock('@/contexts/ToastContext', () => ({
  useErrorHandler: jest.fn(),
}));

const mockHandleError = jest.fn();
const mockInvoices = [
  {
    id: 'inv-1',
    invoice_number: 'INV0000001',
    client_id: 'client-1',
    invoice_date: '2024-01-15',
    due_date: '2024-01-30',
    subtotal: 50000,
    tax: 5000,
    total: 55000,
    currency: 'USD',
    status: 'draft',
    notes: null,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    items: [],
  },
];

describe('useInvoices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useErrorHandler as jest.Mock).mockReturnValue({
      handleError: mockHandleError,
    });
  });

  it('initializes with empty state', () => {
    const { result } = renderHook(() => useInvoices());

    expect(result.current.invoices).toEqual([]);
    expect(result.current.page).toBe(1);
    expect(result.current.totalCount).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it('fetches invoices successfully', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: mockInvoices,
        count: 1,
        returnedCount: 1,
        droppedCount: 0,
        partial: false,
        totalPages: 1,
        scope: { enforced: true, orgId: 'org-1' },
      }),
    });

    const { result } = renderHook(() => useInvoices());

    await act(async () =>
      result.current.fetchInvoices({ page: 1, pageSize: 10 })
    );

    await waitFor(() => {
      expect(result.current.invoices).toHaveLength(1);
      expect(result.current.totalCount).toBe(1);
      expect(result.current.scopeInfo).toEqual({
        enforced: true,
        orgId: 'org-1',
      });
      expect(result.current.listDiagnostics).toEqual({
        partial: false,
        droppedCount: 0,
        returnedCount: 1,
        warning: undefined,
      });
    });

    // Verify API was called with the correct URL (may include query params)
    expect(apiFetch).toHaveBeenCalled();
    const calls = (apiFetch as jest.Mock).mock.calls;
    expect(calls[0][0]).toContain('/api/invoices');
  });

  it('handles fetch error', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Fetch failed' }),
    });

    const { result } = renderHook(() => useInvoices());

    await act(async () =>
      result.current.fetchInvoices({ page: 1, pageSize: 10 })
    );

    await waitFor(() => {
      expect(mockHandleError).toHaveBeenCalled();
      expect(result.current.invoices).toEqual([]);
      expect(result.current.error).toBeInstanceOf(ApiResponseError);
      expect((result.current.error as ApiResponseError).status).toBe(500);
    });
  });

  it('tracks partial invoice list results when some rows are dropped', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: mockInvoices,
        count: 3,
        returnedCount: 1,
        droppedCount: 2,
        partial: true,
        warning: 'Some invoices could not be displayed.',
        totalPages: 1,
        scope: { enforced: true, orgId: 'org-1' },
      }),
    });

    const { result } = renderHook(() => useInvoices());

    await act(async () =>
      result.current.fetchInvoices({ page: 1, pageSize: 10 })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('success');
      expect(result.current.totalCount).toBe(3);
      expect(result.current.invoices).toHaveLength(1);
      expect(result.current.listDiagnostics).toEqual({
        partial: true,
        droppedCount: 2,
        returnedCount: 1,
        warning: 'Some invoices could not be displayed.',
      });
    });
  });

  it('keeps partial-empty distinct from normal empty when all rows are dropped', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [],
        count: 4,
        returnedCount: 0,
        droppedCount: 4,
        partial: true,
        warning: 'Some invoices could not be displayed.',
        totalPages: 1,
        scope: { enforced: true, orgId: 'org-1' },
      }),
    });

    const { result } = renderHook(() => useInvoices());

    await act(async () =>
      result.current.fetchInvoices({ page: 1, pageSize: 10 })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('success');
      expect(result.current.invoices).toEqual([]);
      expect(result.current.totalCount).toBe(4);
      expect(result.current.listDiagnostics.partial).toBe(true);
      expect(result.current.listDiagnostics.droppedCount).toBe(4);
    });
  });

  it('creates invoice successfully', async () => {
    const newInvoice = {
      client_id: 'client-1',
      invoice_date: '2024-01-15',
      due_date: null,
      subtotal: 50000,
      tax: null,
      total: 50000,
      currency: 'USD',
      status: 'draft' as const,
      notes: null,
      items: [],
    };

    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: mockInvoices[0],
        result: 'full_success',
        message: 'Invoice created successfully.',
        imageTracking: {
          status: 'claimed',
          requestedCount: 1,
          claimedCount: 1,
          missingCount: 0,
          missingPaths: [],
        },
      }),
    });

    const { result } = renderHook(() => useInvoices());

    const created = await result.current.createInvoice(newInvoice);

    expect(created).toEqual({
      invoice: mockInvoices[0],
      result: 'full_success',
      message: 'Invoice created successfully.',
      existingInvoiceId: 'inv-1',
      shouldRefreshList: false,
      imageTracking: {
        status: 'claimed',
        requestedCount: 1,
        claimedCount: 1,
        missingCount: 0,
        missingPaths: [],
      },
    });
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/invoices',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(newInvoice),
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
  });

  it('handles create invoice error', async () => {
    const newInvoice = {
      client_id: 'client-1',
      invoice_date: '2024-01-15',
      due_date: null,
      subtotal: 50000,
      tax: null,
      total: 50000,
      currency: 'USD',
      status: 'draft' as const,
      notes: null,
      items: [],
    };

    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'Create failed' }),
      json: async () => ({ error: 'Create failed' }),
    });

    const { result } = renderHook(() => useInvoices());

    await expect(result.current.createInvoice(newInvoice)).rejects.toThrow();

    expect(mockHandleError).toHaveBeenCalled();
  });

  it('reuses the same idempotency key after transient failure retry', async () => {
    const newInvoice = {
      client_id: 'client-1',
      invoice_date: '2024-01-15',
      due_date: null,
      subtotal: 50000,
      tax: null,
      total: 50000,
      currency: 'USD',
      status: 'draft' as const,
      notes: null,
      items: [],
    };

    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: async () => JSON.stringify({ error: 'Temporary failure' }),
      json: async () => ({ error: 'Temporary failure' }),
    });
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: mockInvoices[0],
        result: 'full_success',
        message: 'Invoice created successfully.',
      }),
    });

    const { result } = renderHook(() => useInvoices());

    await expect(result.current.createInvoice(newInvoice)).rejects.toThrow();
    const retryResult = await result.current.createInvoice(newInvoice);

    expect(retryResult.result).toBe('full_success');
    const calls = (apiFetch as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][2]?.idempotencyKey).toBeDefined();
    expect(calls[0][2]?.idempotencyKey).toBe(calls[1][2]?.idempotencyKey);
  });

  it('treats IDEMPOTENCY_REPLAY conflict as success and avoids generic error toast', async () => {
    const newInvoice = {
      client_id: 'client-1',
      invoice_date: '2024-01-15',
      due_date: null,
      subtotal: 50000,
      tax: null,
      total: 50000,
      currency: 'USD',
      status: 'draft' as const,
      notes: null,
      items: [],
    };

    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      text: async () =>
        JSON.stringify({
          error_code: 'IDEMPOTENCY_REPLAY',
          message: 'Request already processed',
          data: { id: 'inv-existing', replayed: true },
        }),
      json: async () => ({
        error_code: 'IDEMPOTENCY_REPLAY',
        message: 'Request already processed',
        data: { id: 'inv-existing', replayed: true },
      }),
    });

    const { result } = renderHook(() => useInvoices());

    const duplicateResult = await result.current.createInvoice(newInvoice);

    expect(duplicateResult).toEqual({
      invoice: null,
      result: 'already_processed',
      message: 'This request was already processed. Loading existing invoice.',
      existingInvoiceId: 'inv-existing',
      shouldRefreshList: false,
    });
    expect(mockHandleError).not.toHaveBeenCalled();
  });

  it('treats UNIQUE_VIOLATION as failure', async () => {
    const newInvoice = {
      client_id: 'client-1',
      invoice_date: '2024-01-15',
      due_date: null,
      subtotal: 50000,
      tax: null,
      total: 50000,
      currency: 'USD',
      status: 'draft' as const,
      notes: null,
      items: [],
    };

    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      text: async () =>
        JSON.stringify({
          error_code: 'UNIQUE_VIOLATION',
          message: 'Invoice conflict',
        }),
      json: async () => ({
        error_code: 'UNIQUE_VIOLATION',
        message: 'Invoice conflict',
      }),
    });

    const { result } = renderHook(() => useInvoices());

    await expect(result.current.createInvoice(newInvoice)).rejects.toThrow();
    expect(mockHandleError).toHaveBeenCalled();
  });

  it('updates invoice successfully', async () => {
    const updateData = {
      status: 'paid' as const,
      notes: 'Updated notes',
    };

    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { ...mockInvoices[0], ...updateData },
        result: 'full_success',
        message: 'Invoice updated successfully.',
        imageTracking: {
          status: 'claimed',
          requestedCount: 1,
          claimedCount: 1,
          missingCount: 0,
          missingPaths: [],
        },
      }),
    });

    const { result } = renderHook(() => useInvoices());

    const updated = await result.current.updateInvoice('inv-1', updateData);

    expect(updated.invoice.status).toBe('paid');
    expect(updated.result).toBe('full_success');
    expect(updated.message).toBe('Invoice updated successfully.');
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/invoices/inv-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(updateData),
      })
    );
  });

  it('returns partial_success when create succeeds but image linking is incomplete', async () => {
    const newInvoice = {
      client_id: 'client-1',
      invoice_date: '2024-01-15',
      due_date: null,
      subtotal: 50000,
      tax: null,
      total: 50000,
      currency: 'USD',
      status: 'draft' as const,
      notes: null,
      items: [],
    };

    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: mockInvoices[0],
        result: 'partial_success',
        message: 'Invoice created, but some item images were not linked.',
        imageTracking: {
          status: 'partial',
          requestedCount: 2,
          claimedCount: 1,
          missingCount: 1,
          missingPaths: ['org/file-a.jpg'],
        },
      }),
    });

    const { result } = renderHook(() => useInvoices());
    const created = await result.current.createInvoice(newInvoice);

    expect(created.result).toBe('partial_success');
    expect(created.message).toBe(
      'Invoice created, but some item images were not linked.'
    );
    expect(created.imageTracking?.missingCount).toBe(1);
  });

  it('returns partial_success when update succeeds but image linking is incomplete', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { ...mockInvoices[0], status: 'paid' },
        result: 'partial_success',
        message: 'Invoice updated, but some item images were not linked.',
        imageTracking: {
          status: 'failed',
          requestedCount: 2,
          claimedCount: 0,
          missingCount: 2,
          missingPaths: ['org/file-a.jpg', 'org/file-b.jpg'],
        },
      }),
    });

    const { result } = renderHook(() => useInvoices());
    const updated = await result.current.updateInvoice('inv-1', {
      status: 'paid',
    });

    expect(updated.result).toBe('partial_success');
    expect(updated.message).toBe(
      'Invoice updated, but some item images were not linked.'
    );
    expect(updated.imageTracking?.missingCount).toBe(2);
  });

  it('handles update invoice error', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Update failed' }),
    });

    const { result } = renderHook(() => useInvoices());

    await expect(
      result.current.updateInvoice('inv-1', { status: 'paid' })
    ).rejects.toThrow();

    expect(mockHandleError).toHaveBeenCalled();
  });

  it('deletes invoice successfully', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'inv-1' } }),
    });

    const { result } = renderHook(() => useInvoices());

    const deleted = await result.current.deleteInvoice('inv-1');

    expect(deleted).toBe(true);
    expect(apiFetch).toHaveBeenCalledWith('/api/invoices/inv-1', {
      method: 'DELETE',
    });
  });

  it('handles delete invoice error', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Delete failed' }),
    });

    const { result } = renderHook(() => useInvoices());

    await expect(result.current.deleteInvoice('inv-1')).rejects.toThrow();

    expect(mockHandleError).toHaveBeenCalled();
  });

  it('sets page correctly', () => {
    const { result } = renderHook(() => useInvoices());

    act(() => {
      result.current.setPage(3);
    });

    expect(result.current.page).toBe(3);
  });

  it('includes query parameters in fetch', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [],
        count: 0,
        returnedCount: 0,
        droppedCount: 0,
        partial: false,
        totalPages: 0,
      }),
    });

    const { result } = renderHook(() => useInvoices());

    await act(async () => {
      await result.current.fetchInvoices({
        page: 2,
        pageSize: 20,
        fromDate: '2024-01-01',
        toDate: '2024-01-31',
        search: 'test',
        clientId: 'client-1',
        status: 'paid',
        sortColumn: 'invoice_date',
        sortDirection: 'desc',
      });
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });

    // Verify URL contains all expected query parameters
    const calls = (apiFetch as jest.Mock).mock.calls;
    const url = calls[calls.length - 1][0];
    expect(url).toContain('fromDate=2024-01-01');
    expect(url).toContain('toDate=2024-01-31');
    expect(url).toContain('search=test');
    expect(url).toContain('client_id=client-1');
    expect(url).toContain('status=paid');
    expect(url).toContain('sortColumn=invoice_date');
    expect(url).toContain('sortDirection=desc');
  });
});
