import { renderHook, waitFor, act } from '@testing-library/react';
import { useInvoices } from '../useInvoices';
import { apiFetch } from '@/utils/apiFetch';
import { useErrorHandler } from '@/contexts/ToastContext';

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
    });

    // Verify API was called with the correct URL (may include query params)
    expect(apiFetch).toHaveBeenCalled();
    const calls = (apiFetch as jest.Mock).mock.calls;
    expect(calls[0][0]).toContain('/api/invoices');
  });

  it('handles fetch error', async () => {
    new Error('Fetch failed');
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Fetch failed' }),
    });

    const { result } = renderHook(() => useInvoices());

    await act(async () =>
      result.current.fetchInvoices({ page: 1, pageSize: 10 })
    );

    await waitFor(() => {
      expect(mockHandleError).toHaveBeenCalled();
      expect(result.current.invoices).toEqual([]);
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
      json: async () => ({ data: mockInvoices[0] }),
    });

    const { result } = renderHook(() => useInvoices());

    const created = await result.current.createInvoice(newInvoice);

    expect(created).toEqual(mockInvoices[0]);
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
      json: async () => ({ error: 'Create failed' }),
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
      json: async () => ({ data: { ...mockInvoices[0], ...updateData } }),
    });

    const { result } = renderHook(() => useInvoices());

    const updated = await result.current.updateInvoice('inv-1', updateData);

    expect(updated.status).toBe('paid');
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/invoices/inv-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(updateData),
      })
    );
  });

  it('handles update invoice error', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
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
      json: async () => ({ data: [], count: 0, totalPages: 0 }),
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
