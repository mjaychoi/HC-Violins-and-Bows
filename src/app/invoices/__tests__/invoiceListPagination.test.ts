import {
  MAX_INVOICE_DELETE_PAGE_CLAMP_ATTEMPTS,
  resolveInvoicePageAfterDelete,
  syncInvoicePageAfterDelete,
} from '../invoiceListPagination';

describe('resolveInvoicePageAfterDelete', () => {
  it('clamps page 3 to page 2 when 21 rows become 20', () => {
    expect(resolveInvoicePageAfterDelete(3, 2)).toBe(2);
  });

  it('clamps page 2 to page 1 when 11 rows become 10', () => {
    expect(resolveInvoicePageAfterDelete(2, 1)).toBe(1);
  });

  it('keeps page 3 when it remains valid after a non-last-row delete', () => {
    expect(resolveInvoicePageAfterDelete(3, 3)).toBe(3);
  });

  it('keeps page 1 when the last matching invoice is deleted', () => {
    expect(resolveInvoicePageAfterDelete(1, 1)).toBe(1);
    expect(resolveInvoicePageAfterDelete(1, 0)).toBe(1);
  });

  it('never returns page 0', () => {
    expect(resolveInvoicePageAfterDelete(0, 0)).toBe(1);
    expect(resolveInvoicePageAfterDelete(-2, 5)).toBe(1);
  });
});

describe('syncInvoicePageAfterDelete', () => {
  it('refreshes the current page when it stays valid', async () => {
    const refresh = jest.fn().mockResolvedValue({
      totalPages: 3,
      page: 3,
    });

    await expect(
      syncInvoicePageAfterDelete({
        currentPage: 3,
        refresh,
      })
    ).resolves.toEqual({
      page: 3,
      result: { totalPages: 3, page: 3 },
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(3);
  });

  it('fetches the clamped page when the current last page disappears', async () => {
    const refresh = jest
      .fn()
      .mockResolvedValueOnce({ totalPages: 2, page: 3 })
      .mockResolvedValueOnce({ totalPages: 2, page: 2 });

    await expect(
      syncInvoicePageAfterDelete({
        currentPage: 3,
        refresh,
      })
    ).resolves.toEqual({
      page: 2,
      result: { totalPages: 2, page: 2 },
    });

    expect(refresh.mock.calls.map(call => call[0])).toEqual([3, 2]);
  });

  it('converges when concurrent deletes lower totalPages further', async () => {
    const refresh = jest
      .fn()
      .mockResolvedValueOnce({ totalPages: 2, page: 3 })
      .mockResolvedValueOnce({ totalPages: 1, page: 2 })
      .mockResolvedValueOnce({ totalPages: 1, page: 1 });

    await expect(
      syncInvoicePageAfterDelete({
        currentPage: 3,
        refresh,
      })
    ).resolves.toEqual({
      page: 1,
      result: { totalPages: 1, page: 1 },
    });

    expect(refresh.mock.calls.map(call => call[0])).toEqual([3, 2, 1]);
  });

  it('falls back to page 1 after the bounded attempt budget', async () => {
    const refresh = jest.fn().mockImplementation(async (page: number) => ({
      totalPages: Math.max(1, page - 1),
      page,
    }));

    const synced = await syncInvoicePageAfterDelete({
      currentPage: 20,
      refresh,
      maxAttempts: 2,
    });

    expect(synced.page).toBe(1);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(refresh).toHaveBeenLastCalledWith(1);
    expect(refresh.mock.calls.length).toBeLessThanOrEqual(
      MAX_INVOICE_DELETE_PAGE_CLAMP_ATTEMPTS + 1
    );
  });

  it('treats an aborted refresh as a recoverable sync failure', async () => {
    const refresh = jest.fn().mockResolvedValue({
      totalPages: 2,
      aborted: true,
    });

    await expect(
      syncInvoicePageAfterDelete({
        currentPage: 3,
        refresh,
      })
    ).rejects.toThrow('Invoice list refresh was cancelled');

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not retry forever when the corrective page refresh fails', async () => {
    const refresh = jest
      .fn()
      .mockResolvedValueOnce({ totalPages: 2, page: 3 })
      .mockRejectedValueOnce(new Error('network'));

    await expect(
      syncInvoicePageAfterDelete({
        currentPage: 3,
        refresh,
      })
    ).rejects.toThrow('network');

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
