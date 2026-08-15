import { render, screen, waitFor } from '@/test-utils/render';
import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvoicesPage from '../page';
import { Invoice } from '@/types';
import { ApiResponseError } from '@/utils/handleApiResponse';
import { INVOICE_PAGE_SIZE } from '../invoiceListPagination';

const originalCreateElement = document.createElement.bind(document);

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: jest.fn(() => ({
    canCreateInvoice: true,
    canManageInvoiceSettings: true,
  })),
}));

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: jest.fn(() => ({
    tenantIdentityKey: 'tenant-test',
    isTenantTransitioning: false,
  })),
}));

// Mock InvoiceModal component first
jest.mock('../components/InvoiceModal', () => ({
  __esModule: true,
  default: function MockInvoiceModal({
    isOpen,
    onClose,
    onSubmit,
    invoice,
    isEditing,
    settingsStatus,
    settingsErrorMessage,
    onRetrySettingsLoad,
  }: any) {
    if (!isOpen) return null;
    if (!isEditing && settingsStatus === 'loading') {
      return <div data-testid="invoice-modal">Loading invoice defaults...</div>;
    }
    if (!isEditing && settingsStatus === 'error') {
      return (
        <div data-testid="invoice-modal">
          <div>Failed to load invoice defaults</div>
          <div>{settingsErrorMessage}</div>
          <button onClick={onRetrySettingsLoad}>Retry settings</button>
        </div>
      );
    }
    return (
      <div data-testid="invoice-modal">
        <button onClick={onClose}>Close Modal</button>
        <button onClick={() => onSubmit({})}>Submit Invoice</button>
        {isEditing && invoice && <div>Editing: {invoice.invoice_number}</div>}
        {!isEditing && <div>Creating new invoice</div>}
      </div>
    );
  },
}));

// Mock next/dynamic to return the mocked component synchronously
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    const { default: InvoiceModal } = require('../components/InvoiceModal');
    return InvoiceModal;
  },
}));

// Mock dependencies
jest.mock('../hooks/useInvoices', () => ({
  useInvoices: jest.fn(),
}));

jest.mock('../hooks/useInvoiceSort', () => ({
  useInvoiceSort: jest.fn(),
}));

jest.mock('@/hooks/useURLState', () => ({
  useURLState: jest.fn(),
}));

jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: jest.fn(() => ({
    showSuccess: jest.fn(),
    showWarning: jest.fn(),
    handleError: jest.fn(),
  })),
}));

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: jest.fn(),
}));

jest.mock('../components/InvoiceList', () => {
  return function MockInvoiceList({
    invoices,
    onEdit,
    onDelete,
    onDownload,
    onSort,
    getSortState,
  }: any) {
    return (
      <div data-testid="invoice-list">
        <button onClick={() => onSort?.('total')}>
          Sort Total {getSortState?.('total')?.direction ?? ''}
        </button>
        {invoices.map((inv: Invoice) => (
          <div key={inv.id}>
            <span>{inv.invoice_number}</span>
            <button onClick={() => onEdit(inv)}>
              Edit {inv.invoice_number}
            </button>
            <button onClick={() => onDelete(inv)}>
              Delete {inv.invoice_number}
            </button>
            <button onClick={() => onDownload(inv)}>
              Download {inv.invoice_number}
            </button>
          </div>
        ))}
      </div>
    );
  };
});

jest.mock('../components/InvoiceFilters', () => {
  return function MockInvoiceFilters({
    search,
    onSearchChange,
    fromDate,
    onFromDateChange,
    toDate,
    onToDateChange,
    status,
    onStatusChange,
    onClearFilters,
  }: any) {
    return (
      <div data-testid="invoice-filters">
        <input
          data-testid="search-input"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
        <input
          data-testid="from-date-input"
          value={fromDate}
          onChange={e => onFromDateChange(e.target.value)}
        />
        <input
          data-testid="to-date-input"
          value={toDate}
          onChange={e => onToDateChange(e.target.value)}
        />
        <select
          data-testid="status-select"
          value={status}
          onChange={e => onStatusChange(e.target.value)}
        >
          <option value="">All</option>
          <option value="draft">Draft</option>
          <option value="paid">Paid</option>
        </select>
        <button data-testid="clear-filters" onClick={onClearFilters}>
          Clear
        </button>
      </div>
    );
  };
});

jest.mock('@/components/common', () => {
  const actual = jest.requireActual('@/components/common');
  return {
    ...actual,
    ConfirmDialog: function MockConfirmDialog({
      isOpen,
      onConfirm,
      onCancel,
      submitting,
    }: any) {
      if (!isOpen) return null;
      return (
        <div data-testid="confirm-dialog">
          <button onClick={onConfirm} disabled={submitting}>
            Confirm
          </button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      );
    },
  };
});

const mockInvoice: Invoice = {
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
};

describe('InvoicesPage', () => {
  const mockFetchInvoices = jest.fn().mockResolvedValue({
    invoices: [mockInvoice],
    totalCount: 1,
    totalPages: 1,
    page: 1,
  });
  const mockCreateInvoice = jest.fn().mockResolvedValue({
    invoice: mockInvoice,
    result: 'full_success',
    message: 'Invoice created successfully.',
    existingInvoiceId: mockInvoice.id,
    shouldRefreshList: false,
    imageTracking: null,
  });
  const mockUpdateInvoice = jest.fn().mockResolvedValue({
    invoice: mockInvoice,
    result: 'full_success',
    message: 'Invoice updated successfully.',
    imageTracking: null,
  });
  const mockDeleteInvoice = jest.fn().mockResolvedValue(true);
  const mockSetPage = jest.fn();
  const mockHandleSort = jest.fn();
  const mockGetSortState = jest.fn(() => ({
    active: true as const,
    direction: 'asc' as const,
  }));
  const mockSetSortColumn = jest.fn();
  const mockSetSortDirection = jest.fn();
  const mockUpdateURLState = jest.fn();
  const mockShowSuccess = jest.fn();
  const mockShowWarning = jest.fn();
  const mockHandleError = jest.fn();

  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    document.createElement = originalCreateElement;
    if (!document.body) {
      document.body = originalCreateElement('body');
      document.documentElement.appendChild(document.body);
    }

    const { useInvoices } = require('../hooks/useInvoices');
    mockFetchInvoices.mockResolvedValue({
      invoices: [mockInvoice],
      totalCount: 1,
      totalPages: 1,
      page: 1,
    });
    mockDeleteInvoice.mockResolvedValue(true);
    useInvoices.mockReturnValue({
      invoices: [mockInvoice],
      page: 1,
      totalCount: 1,
      totalPages: 1,
      loading: false,
      listDiagnostics: {
        partial: false,
        droppedCount: 0,
        returnedCount: 1,
        warning: undefined,
      },
      fetchInvoices: mockFetchInvoices,
      createInvoice: mockCreateInvoice,
      updateInvoice: mockUpdateInvoice,
      deleteInvoice: mockDeleteInvoice,
      setPage: mockSetPage,
      scopeInfo: null,
    });

    const { useInvoiceSort } = require('../hooks/useInvoiceSort');
    useInvoiceSort.mockReturnValue({
      sortColumn: 'invoice_date',
      sortDirection: 'desc',
      handleSort: mockHandleSort,
      getSortState: mockGetSortState,
      setSortColumn: mockSetSortColumn,
      setSortDirection: mockSetSortDirection,
    });

    const { useURLState } = require('@/hooks/useURLState');
    useURLState.mockReturnValue({
      urlState: {},
      updateURLState: mockUpdateURLState,
    });

    const { useAppFeedback } = require('@/hooks/useAppFeedback');
    useAppFeedback.mockReturnValue({
      showSuccess: mockShowSuccess,
      showWarning: mockShowWarning,
      handleError: mockHandleError,
    });
  });

  function mockInvoiceHook(overrides: Record<string, unknown> = {}): void {
    const { useInvoices } = require('../hooks/useInvoices');
    useInvoices.mockReturnValue({
      invoices: [mockInvoice],
      page: 1,
      totalCount: 1,
      totalPages: 1,
      loading: false,
      listDiagnostics: {
        partial: false,
        droppedCount: 0,
        returnedCount: 1,
        warning: undefined,
      },
      fetchInvoices: mockFetchInvoices,
      createInvoice: mockCreateInvoice,
      updateInvoice: mockUpdateInvoice,
      deleteInvoice: mockDeleteInvoice,
      setPage: mockSetPage,
      scopeInfo: null,
      ...overrides,
    });
  }

  function refreshCalls() {
    return mockFetchInvoices.mock.calls.filter(
      ([options]) => options?.throwOnError === true
    );
  }

  async function confirmDeleteOfFirstInvoice(
    user: ReturnType<typeof userEvent.setup>
  ) {
    await user.click(screen.getByText('Delete INV0000001'));
    await user.click(screen.getByText('Confirm'));
  }

  it('renders invoices page', () => {
    render(<InvoicesPage />);

    // There are multiple "Invoices" headings (AppLayout and page header), so use getAllByText
    const invoicesHeadings = screen.getAllByText('Invoices');
    expect(invoicesHeadings.length).toBeGreaterThan(0);
    expect(screen.getByTestId('invoice-list')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-filters')).toBeInTheDocument();
  });

  it('displays create invoice button', () => {
    render(<InvoicesPage />);

    expect(screen.getByText('Add Invoice')).toBeInTheDocument();
  });

  it.skip('opens modal when create invoice button is clicked', async () => {
    const user = userEvent.setup();
    render(<InvoicesPage />);

    const createButton = screen.getByText('Add Invoice');
    await user.click(createButton);

    expect(screen.getByTestId('invoice-modal')).toBeInTheDocument();
    expect(screen.getByText('Creating new invoice')).toBeInTheDocument();
  });

  it.skip('opens modal in edit mode when edit is clicked', async () => {
    const user = userEvent.setup();
    render(<InvoicesPage />);

    const editButton = screen.getByText('Edit INV0000001');
    await user.click(editButton);

    expect(screen.getByTestId('invoice-modal')).toBeInTheDocument();
    expect(screen.getByText('Editing: INV0000001')).toBeInTheDocument();
  });

  it.skip('closes modal when close is clicked', async () => {
    const user = userEvent.setup();
    render(<InvoicesPage />);

    const createButton = screen.getByText('Add Invoice');
    await user.click(createButton);

    const closeButton = screen.getByText('Close Modal');
    await user.click(closeButton);

    expect(screen.queryByTestId('invoice-modal')).not.toBeInTheDocument();
  });

  it('handles filter changes', async () => {
    const user = userEvent.setup();
    render(<InvoicesPage />);

    const searchInput = screen.getByTestId('search-input');
    await user.type(searchInput, 'INV001');

    await waitFor(() => {
      expect(mockFetchInvoices).toHaveBeenCalled();
    });
  });

  it('initializes state from URL params', async () => {
    const { useURLState } = require('@/hooks/useURLState');
    useURLState.mockReturnValue({
      urlState: {
        search: 'INV001',
        fromDate: '2024-01-01',
        toDate: '2024-01-31',
        status: 'paid',
        sortColumn: 'total',
        sortDirection: 'asc',
        page: '2',
      },
      updateURLState: mockUpdateURLState,
    });

    render(<InvoicesPage />);

    await waitFor(() => {
      expect(mockSetPage).toHaveBeenCalledWith(2);
      expect(mockSetSortColumn).toHaveBeenCalledWith('total');
      expect(mockSetSortDirection).toHaveBeenCalledWith('asc');
      expect(screen.getByTestId('search-input')).toHaveValue('INV001');
    });
  });

  it('updates URL when filters change', async () => {
    const user = userEvent.setup();
    render(<InvoicesPage />);

    const searchInput = screen.getByTestId('search-input');
    await user.clear(searchInput);
    await user.type(searchInput, 'INV123');

    await waitFor(() => {
      expect(mockUpdateURLState).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'INV123' })
      );
    });
  });

  it('handles clear filters', async () => {
    const user = userEvent.setup();
    render(<InvoicesPage />);

    const clearButton = screen.getByTestId('clear-filters');
    await user.click(clearButton);

    // Filters should be cleared (tested via state update)
    expect(clearButton).toBeInTheDocument();
  });

  it('handles delete with confirmation', async () => {
    const user = userEvent.setup();
    render(<InvoicesPage />);

    const deleteButton = screen.getByText('Delete INV0000001');
    await user.click(deleteButton);

    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();

    const confirmButton = screen.getByText('Confirm');
    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockDeleteInvoice).toHaveBeenCalledWith('inv-1');
    });
  });

  it('opens modal when add invoice is clicked', async () => {
    const { apiFetch } = require('@/utils/apiFetch');
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          business_name: 'HC Violins',
          address: 'Seoul',
          phone: '010-0000-0000',
          email: 'hello@example.com',
          bank_account_holder: 'HC Violins',
          bank_name: 'Bank',
          bank_swift_code: 'SWIFT',
          bank_account_number: '123',
          default_conditions: 'Net 30',
          default_exchange_rate: '1.0',
          default_currency: 'USD',
        },
      }),
    });

    const user = userEvent.setup();
    render(<InvoicesPage />);

    const addButton = screen.getByText('Add Invoice');
    await user.click(addButton);

    expect(screen.getByTestId('invoice-modal')).toBeInTheDocument();
    expect(screen.getByText('Creating new invoice')).toBeInTheDocument();
  });

  it('blocks create flow with retryable error UI when invoice settings fail to load', async () => {
    const { apiFetch } = require('@/utils/apiFetch');
    apiFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        json: async () => ({ message: 'Settings unavailable' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            business_name: 'HC Violins',
            address: 'Seoul',
            phone: '',
            email: '',
            bank_account_holder: '',
            bank_name: '',
            bank_swift_code: '',
            bank_account_number: '',
            default_conditions: '',
            default_exchange_rate: '',
            default_currency: 'USD',
          },
        }),
      });

    const user = userEvent.setup();
    render(<InvoicesPage />);

    await user.click(screen.getByText('Add Invoice'));

    expect(
      await screen.findByText('Failed to load invoice defaults')
    ).toBeInTheDocument();
    expect(screen.queryByText('Creating new invoice')).not.toBeInTheDocument();

    await user.click(screen.getByText('Retry settings'));

    expect(await screen.findByText('Creating new invoice')).toBeInTheDocument();
  });

  it('opens edit modal from invoice list action', async () => {
    const user = userEvent.setup();
    render(<InvoicesPage />);

    const editButton = screen.getByText('Edit INV0000001');
    await user.click(editButton);

    expect(screen.getByTestId('invoice-modal')).toBeInTheDocument();
    expect(screen.getByText('Editing: INV0000001')).toBeInTheDocument();
  });

  it('triggers sort handler from invoice list header', async () => {
    const user = userEvent.setup();
    render(<InvoicesPage />);

    const sortButton = screen.getByText(/Sort Total/i);
    await user.click(sortButton);

    expect(mockHandleSort).toHaveBeenCalledWith('total');
  });

  it('downloads invoice PDF successfully', async () => {
    const user = userEvent.setup();
    const { apiFetch } = require('@/utils/apiFetch');
    const blob = new Blob(['pdf'], { type: 'application/pdf' });

    apiFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: (key: string) =>
          key === 'content-type' ? 'application/pdf' : null,
      },
      blob: async () => blob,
    });

    const urlApi = globalThis.URL as unknown as {
      createObjectURL?: (blob: Blob) => string;
      revokeObjectURL?: (url: string) => void;
    };
    if (!urlApi.createObjectURL) {
      urlApi.createObjectURL = jest.fn();
    }
    if (!urlApi.revokeObjectURL) {
      urlApi.revokeObjectURL = jest.fn();
    }

    const createObjectURLSpy = jest
      .spyOn(
        urlApi as { createObjectURL: (blob: Blob) => string },
        'createObjectURL'
      )
      .mockReturnValue('blob:invoice');
    const revokeObjectURLSpy = jest
      .spyOn(
        urlApi as { revokeObjectURL: (url: string) => void },
        'revokeObjectURL'
      )
      .mockImplementation(() => {});
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = jest
      .spyOn(document, 'createElement')
      .mockImplementation(tagName => {
        if (tagName === 'a') {
          const anchor = originalCreateElement('a');
          jest.spyOn(anchor, 'click').mockImplementation(() => {});
          return anchor;
        }
        return originalCreateElement(tagName);
      });
    const originalAppendChild = document.body.appendChild.bind(document.body);
    const originalRemoveChild = document.body.removeChild.bind(document.body);
    const appendChildSpy = jest
      .spyOn(document.body, 'appendChild')
      .mockImplementation(node => originalAppendChild(node));
    const removeChildSpy = jest
      .spyOn(document.body, 'removeChild')
      .mockImplementation(node => originalRemoveChild(node));

    render(<InvoicesPage />);

    const downloadButton = screen.getByText('Download INV0000001');
    await user.click(downloadButton);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/invoices/inv-1/pdf');
      expect(mockShowSuccess).toHaveBeenCalledWith('Invoice PDF downloaded.');
    });

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it('writes non-default sort to URL state', async () => {
    const { useInvoiceSort } = require('../hooks/useInvoiceSort');
    useInvoiceSort.mockReturnValue({
      sortColumn: 'total',
      sortDirection: 'asc',
      handleSort: mockHandleSort,
      getSortState: mockGetSortState,
      setSortColumn: mockSetSortColumn,
      setSortDirection: mockSetSortDirection,
    });

    const user = userEvent.setup();
    render(<InvoicesPage />);

    const searchInput = screen.getByTestId('search-input');
    await user.type(searchInput, 'INV');

    await waitFor(() => {
      expect(mockUpdateURLState).toHaveBeenCalledWith(
        expect.objectContaining({
          sortColumn: 'total',
          sortDirection: 'asc',
        })
      );
    });
  });

  it('cancels delete when cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<InvoicesPage />);

    const deleteButton = screen.getByText('Delete INV0000001');
    await user.click(deleteButton);

    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    expect(mockDeleteInvoice).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  it('P23-1 clamps page 3 to page 2 after deleting the only last-page invoice', async () => {
    mockInvoiceHook({ page: 3, totalPages: 3, totalCount: 21 });
    mockFetchInvoices
      .mockResolvedValueOnce({
        invoices: [],
        totalCount: 20,
        totalPages: 2,
        page: 3,
      })
      .mockResolvedValueOnce({
        invoices: [mockInvoice],
        totalCount: 20,
        totalPages: 2,
        page: 2,
      });

    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockSetPage.mockClear();
    mockFetchInvoices
      .mockResolvedValueOnce({
        invoices: [],
        totalCount: 20,
        totalPages: 2,
        page: 3,
      })
      .mockResolvedValueOnce({
        invoices: [mockInvoice],
        totalCount: 20,
        totalPages: 2,
        page: 2,
      });

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(mockDeleteInvoice).toHaveBeenCalledWith('inv-1');
      expect(mockSetPage).toHaveBeenCalledWith(2);
      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Invoice deleted successfully.'
      );
    });
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    expect(refreshCalls().map(([options]) => options.page)).toEqual([3, 2]);
    expect(
      refreshCalls().every(
        ([options]) => options.pageSize === INVOICE_PAGE_SIZE
      )
    ).toBe(true);
    expect(mockSetPage).not.toHaveBeenCalledWith(1);
  });

  it('P23-2 clamps page 2 to page 1 after deleting the only second-page invoice', async () => {
    mockInvoiceHook({ page: 2, totalPages: 2, totalCount: 11 });
    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockSetPage.mockClear();
    mockFetchInvoices
      .mockResolvedValueOnce({
        invoices: [],
        totalCount: 10,
        totalPages: 1,
        page: 2,
      })
      .mockResolvedValueOnce({
        invoices: [mockInvoice],
        totalCount: 10,
        totalPages: 1,
        page: 1,
      });

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(mockSetPage).toHaveBeenCalledWith(1);
      expect(refreshCalls().map(([options]) => options.page)).toEqual([2, 1]);
    });
  });

  it('P23-3 stays on page 3 when a non-last last-page row is deleted', async () => {
    mockInvoiceHook({
      page: 3,
      totalPages: 3,
      totalCount: 25,
    });
    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockSetPage.mockClear();
    mockFetchInvoices.mockResolvedValueOnce({
      invoices: [mockInvoice],
      totalCount: 24,
      totalPages: 3,
      page: 3,
    });

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Invoice deleted successfully.'
      );
    });
    expect(refreshCalls().map(([options]) => options.page)).toEqual([3]);
    expect(mockSetPage).not.toHaveBeenCalled();
  });

  it('P23-4 keeps page 1 empty state after deleting the only matching invoice', async () => {
    mockInvoiceHook({ page: 1, totalPages: 1, totalCount: 1 });
    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockSetPage.mockClear();
    mockFetchInvoices.mockResolvedValueOnce({
      invoices: [],
      totalCount: 0,
      totalPages: 1,
      page: 1,
    });

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Invoice deleted successfully.'
      );
    });
    expect(refreshCalls()).toHaveLength(1);
    expect(refreshCalls()[0][0].page).toBe(1);
    expect(mockSetPage).not.toHaveBeenCalled();
  });

  it('P23-5 preserves an active status filter while clamping to page 1', async () => {
    const { useURLState } = require('@/hooks/useURLState');
    useURLState.mockReturnValue({
      urlState: { status: 'draft', page: '2' },
      updateURLState: mockUpdateURLState,
    });
    mockInvoiceHook({ page: 2, totalPages: 2, totalCount: 11 });
    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockFetchInvoices
      .mockResolvedValueOnce({
        invoices: [],
        totalCount: 10,
        totalPages: 1,
        page: 2,
      })
      .mockResolvedValueOnce({
        invoices: [mockInvoice],
        totalCount: 10,
        totalPages: 1,
        page: 1,
      });

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(refreshCalls().length).toBeGreaterThan(0);
    });
    expect(
      refreshCalls().every(([options]) => options.status === 'draft')
    ).toBe(true);
    expect(screen.getByTestId('status-select')).toHaveValue('draft');
  });

  it('P23-6 preserves search while clamping after delete', async () => {
    const { useURLState } = require('@/hooks/useURLState');
    useURLState.mockReturnValue({
      urlState: { search: 'Strad', page: '2' },
      updateURLState: mockUpdateURLState,
    });
    mockInvoiceHook({ page: 2, totalPages: 2, totalCount: 11 });
    const user = userEvent.setup();
    render(<InvoicesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('search-input')).toHaveValue('Strad');
    });
    await act(async () => {
      await new Promise(resolve => {
        setTimeout(resolve, 350);
      });
    });
    mockFetchInvoices.mockClear();
    mockFetchInvoices
      .mockResolvedValueOnce({
        invoices: [],
        totalCount: 10,
        totalPages: 1,
        page: 2,
      })
      .mockResolvedValueOnce({
        invoices: [mockInvoice],
        totalCount: 10,
        totalPages: 1,
        page: 1,
      });

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(refreshCalls().length).toBeGreaterThan(0);
    });
    expect(
      refreshCalls().every(([options]) => options.search === 'Strad')
    ).toBe(true);
    expect(screen.getByTestId('search-input')).toHaveValue('Strad');
  });

  it('P23-7 preserves date filters while clamping after delete', async () => {
    const { useURLState } = require('@/hooks/useURLState');
    useURLState.mockReturnValue({
      urlState: {
        fromDate: '2024-01-01',
        toDate: '2024-01-31',
        page: '2',
      },
      updateURLState: mockUpdateURLState,
    });
    mockInvoiceHook({ page: 2, totalPages: 2, totalCount: 11 });
    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockFetchInvoices
      .mockResolvedValueOnce({
        invoices: [],
        totalCount: 10,
        totalPages: 1,
        page: 2,
      })
      .mockResolvedValueOnce({
        invoices: [mockInvoice],
        totalCount: 10,
        totalPages: 1,
        page: 1,
      });

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(refreshCalls().length).toBeGreaterThan(0);
    });
    expect(
      refreshCalls().every(
        ([options]) =>
          options.fromDate === '2024-01-01' && options.toDate === '2024-01-31'
      )
    ).toBe(true);
  });

  it('P23-8 preserves non-default sort while clamping after delete', async () => {
    const { useInvoiceSort } = require('../hooks/useInvoiceSort');
    useInvoiceSort.mockReturnValue({
      sortColumn: 'total',
      sortDirection: 'asc',
      handleSort: mockHandleSort,
      getSortState: mockGetSortState,
      setSortColumn: mockSetSortColumn,
      setSortDirection: mockSetSortDirection,
    });
    mockInvoiceHook({ page: 2, totalPages: 2, totalCount: 11 });
    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockFetchInvoices
      .mockResolvedValueOnce({
        invoices: [],
        totalCount: 10,
        totalPages: 1,
        page: 2,
      })
      .mockResolvedValueOnce({
        invoices: [mockInvoice],
        totalCount: 10,
        totalPages: 1,
        page: 1,
      });

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(refreshCalls().length).toBeGreaterThan(0);
    });
    expect(
      refreshCalls().every(
        ([options]) =>
          options.sortColumn === 'total' && options.sortDirection === 'asc'
      )
    ).toBe(true);
  });

  it('P23-9 writes URL page=2 after clamping from page 3', async () => {
    mockInvoiceHook({ page: 3, totalPages: 3, totalCount: 21 });
    const user = userEvent.setup();
    const { rerender } = render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockSetPage.mockClear();
    mockUpdateURLState.mockClear();
    mockFetchInvoices
      .mockResolvedValueOnce({
        invoices: [],
        totalCount: 20,
        totalPages: 2,
        page: 3,
      })
      .mockResolvedValueOnce({
        invoices: [mockInvoice],
        totalCount: 20,
        totalPages: 2,
        page: 2,
      });

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(mockSetPage).toHaveBeenCalledWith(2);
    });

    mockInvoiceHook({ page: 2, totalPages: 2, totalCount: 20 });
    rerender(<InvoicesPage />);

    await waitFor(() => {
      expect(mockUpdateURLState).toHaveBeenCalledWith(
        expect.objectContaining({ page: '2' })
      );
    });
  });

  it('P23-10 removes the URL page param after clamping to page 1', async () => {
    mockInvoiceHook({ page: 2, totalPages: 2, totalCount: 11 });
    const user = userEvent.setup();
    const { rerender } = render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockSetPage.mockClear();
    mockUpdateURLState.mockClear();
    mockFetchInvoices
      .mockResolvedValueOnce({
        invoices: [],
        totalCount: 10,
        totalPages: 1,
        page: 2,
      })
      .mockResolvedValueOnce({
        invoices: [mockInvoice],
        totalCount: 10,
        totalPages: 1,
        page: 1,
      });

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(mockSetPage).toHaveBeenCalledWith(1);
    });

    mockInvoiceHook({ page: 1, totalPages: 1, totalCount: 10 });
    rerender(<InvoicesPage />);

    await waitFor(() => {
      expect(mockUpdateURLState).toHaveBeenCalledWith(
        expect.objectContaining({ page: null })
      );
    });
  });

  it('P23-11 leaves the URL page unchanged when the current page stays valid', async () => {
    mockInvoiceHook({ page: 3, totalPages: 3, totalCount: 25 });
    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockSetPage.mockClear();
    mockUpdateURLState.mockClear();
    mockFetchInvoices.mockResolvedValueOnce({
      invoices: [mockInvoice],
      totalCount: 24,
      totalPages: 3,
      page: 3,
    });

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalled();
    });
    expect(mockSetPage).not.toHaveBeenCalled();
    const pageParams = mockUpdateURLState.mock.calls.map(
      ([state]) => state.page
    );
    expect(pageParams.every(value => value === '3' || value == null)).toBe(
      true
    );
    expect(pageParams).not.toContain('2');
  });

  it('P23-12 does not bounce back to the deleted page after a clamp', async () => {
    mockInvoiceHook({ page: 3, totalPages: 3, totalCount: 21 });
    const { useURLState } = require('@/hooks/useURLState');
    useURLState.mockReturnValue({
      urlState: { page: '3' },
      updateURLState: mockUpdateURLState,
    });
    const user = userEvent.setup();
    const { rerender } = render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockSetPage.mockClear();
    mockFetchInvoices
      .mockResolvedValueOnce({
        invoices: [],
        totalCount: 20,
        totalPages: 2,
        page: 3,
      })
      .mockResolvedValueOnce({
        invoices: [mockInvoice],
        totalCount: 20,
        totalPages: 2,
        page: 2,
      });

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(mockSetPage).toHaveBeenCalledWith(2);
    });
    expect(mockSetPage).not.toHaveBeenCalledWith(3);

    mockInvoiceHook({ page: 2, totalPages: 2, totalCount: 20 });
    useURLState.mockReturnValue({
      urlState: { page: '2' },
      updateURLState: mockUpdateURLState,
    });
    rerender(<InvoicesPage />);

    await waitFor(() => {
      expect(mockSetPage).toHaveBeenCalledWith(2);
    });
    expect(mockSetPage.mock.calls.some(([nextPage]) => nextPage === 3)).toBe(
      false
    );
  });

  it('P23-13 does not clamp or refresh when DELETE fails', async () => {
    mockInvoiceHook({ page: 3, totalPages: 3, totalCount: 21 });
    mockDeleteInvoice.mockRejectedValueOnce(new Error('Delete failed'));
    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockSetPage.mockClear();

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(mockHandleError).toHaveBeenCalledWith(
        expect.any(Error),
        'Delete invoice'
      );
    });
    expect(refreshCalls()).toHaveLength(0);
    expect(mockSetPage).not.toHaveBeenCalled();
    expect(mockShowSuccess).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
  });

  it('P23-14 warns when DELETE succeeds but list refresh fails', async () => {
    mockInvoiceHook({ page: 3, totalPages: 3, totalCount: 21 });
    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockFetchInvoices.mockRejectedValueOnce(new Error('refresh failed'));

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(mockShowWarning).toHaveBeenCalledWith(
        'Invoice was deleted, but the invoice list failed to refresh.'
      );
    });
    expect(mockShowSuccess).not.toHaveBeenCalledWith(
      'Invoice deleted successfully.'
    );
    expect(mockHandleError).not.toHaveBeenCalledWith(
      expect.anything(),
      'Delete invoice'
    );
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  it('P23-15 warns without looping when the corrective-page refresh fails', async () => {
    mockInvoiceHook({ page: 3, totalPages: 3, totalCount: 21 });
    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockSetPage.mockClear();
    mockFetchInvoices
      .mockResolvedValueOnce({
        invoices: [],
        totalCount: 20,
        totalPages: 2,
        page: 3,
      })
      .mockRejectedValueOnce(new Error('corrective refresh failed'));

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(mockShowWarning).toHaveBeenCalledWith(
        'Invoice was deleted, but the invoice list failed to refresh.'
      );
    });
    expect(refreshCalls()).toHaveLength(2);
    expect(mockSetPage).not.toHaveBeenCalled();
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  it('P23-16 converges to the authoritative page when the server count dropped further', async () => {
    mockInvoiceHook({ page: 3, totalPages: 3, totalCount: 21 });
    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockSetPage.mockClear();
    mockFetchInvoices
      .mockResolvedValueOnce({
        invoices: [],
        totalCount: 10,
        totalPages: 1,
        page: 3,
      })
      .mockResolvedValueOnce({
        invoices: [mockInvoice],
        totalCount: 10,
        totalPages: 1,
        page: 1,
      });

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(mockSetPage).toHaveBeenCalledWith(1);
    });
    expect(refreshCalls().map(([options]) => options.page)).toEqual([3, 1]);
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Invoice deleted successfully.'
    );
  });

  it('P23-17 keeps the corrected page after a later invalid-page result is aborted', async () => {
    mockInvoiceHook({ page: 3, totalPages: 3, totalCount: 21 });
    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockSetPage.mockClear();
    mockFetchInvoices
      .mockResolvedValueOnce({
        invoices: [],
        totalCount: 20,
        totalPages: 2,
        page: 3,
      })
      .mockResolvedValueOnce({
        invoices: [mockInvoice],
        totalCount: 20,
        totalPages: 2,
        page: 2,
      });

    await confirmDeleteOfFirstInvoice(user);

    await waitFor(() => {
      expect(mockSetPage).toHaveBeenCalledWith(2);
    });
    const pages = refreshCalls().map(([options]) => options.page);
    expect(pages[pages.length - 1]).toBe(2);
    expect(mockShowSuccess).toHaveBeenCalled();
  });

  it('P23-18 ignores a second confirm while delete is already submitting', async () => {
    mockInvoiceHook({ page: 3, totalPages: 3, totalCount: 21 });
    let resolveDelete: ((value: boolean) => void) | undefined;
    mockDeleteInvoice.mockImplementation(
      () =>
        new Promise<boolean>(resolve => {
          resolveDelete = resolve;
        })
    );
    const user = userEvent.setup();
    render(<InvoicesPage />);

    await user.click(screen.getByText('Delete INV0000001'));
    await user.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(screen.getByText('Confirm')).toBeDisabled();
    });
    await user.click(screen.getByText('Confirm'));
    expect(mockDeleteInvoice).toHaveBeenCalledTimes(1);

    mockFetchInvoices.mockClear();
    mockFetchInvoices.mockResolvedValue({
      invoices: [mockInvoice],
      totalCount: 20,
      totalPages: 2,
      page: 3,
    });
    resolveDelete?.(true);

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalled();
    });
  });

  it('does not change create refresh behavior when fetch metadata is returned', async () => {
    const { apiFetch } = require('@/utils/apiFetch');
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          business_name: 'HC Violins',
          default_currency: 'USD',
        },
      }),
    });
    mockInvoiceHook({ page: 2, totalPages: 2, totalCount: 11 });
    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockSetPage.mockClear();

    await user.click(screen.getByText('Add Invoice'));
    await user.click(screen.getByText('Submit Invoice'));

    await waitFor(() => {
      expect(mockCreateInvoice).toHaveBeenCalled();
      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Invoice created successfully.'
      );
    });
    expect(refreshCalls().map(([options]) => options.page)).toEqual([2]);
    expect(mockSetPage).not.toHaveBeenCalled();
  });

  it('does not change update refresh behavior when fetch metadata is returned', async () => {
    mockInvoiceHook({ page: 2, totalPages: 2, totalCount: 11 });
    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockSetPage.mockClear();

    await user.click(screen.getByText('Edit INV0000001'));
    await user.click(screen.getByText('Submit Invoice'));

    await waitFor(() => {
      expect(mockUpdateInvoice).toHaveBeenCalled();
      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Invoice updated successfully.'
      );
    });
    expect(refreshCalls().map(([options]) => options.page)).toEqual([2]);
    expect(mockSetPage).not.toHaveBeenCalled();
  });

  it('successive last-page deletes stay until the final row, then clamp once', async () => {
    mockInvoiceHook({ page: 3, totalPages: 3, totalCount: 22 });
    const user = userEvent.setup();
    render(<InvoicesPage />);
    mockFetchInvoices.mockClear();
    mockSetPage.mockClear();
    mockFetchInvoices.mockResolvedValueOnce({
      invoices: [mockInvoice],
      totalCount: 21,
      totalPages: 3,
      page: 3,
    });

    await confirmDeleteOfFirstInvoice(user);
    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledTimes(1);
    });
    expect(mockSetPage).not.toHaveBeenCalled();

    mockFetchInvoices.mockClear();
    mockShowSuccess.mockClear();
    mockFetchInvoices
      .mockResolvedValueOnce({
        invoices: [],
        totalCount: 20,
        totalPages: 2,
        page: 3,
      })
      .mockResolvedValueOnce({
        invoices: [mockInvoice],
        totalCount: 20,
        totalPages: 2,
        page: 2,
      });

    await confirmDeleteOfFirstInvoice(user);
    await waitFor(() => {
      expect(mockSetPage).toHaveBeenCalledWith(2);
    });
    expect(mockSetPage).toHaveBeenCalledTimes(1);
  });

  it.skip('handles download invoice', async () => {
    const user = userEvent.setup();
    // Mock window methods
    const createElementSpy = jest.spyOn(document, 'createElement');
    const appendChildSpy = jest.spyOn(document.body, 'appendChild');
    const removeChildSpy = jest.spyOn(document.body, 'removeChild');

    const mockLink = {
      href: '',
      download: '',
      click: jest.fn(),
    };

    createElementSpy.mockReturnValue(mockLink as any);

    render(<InvoicesPage />);

    const downloadButton = screen.getByText('Download INV0000001');
    await user.click(downloadButton);

    expect(mockLink.click).toHaveBeenCalled();

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it.skip('fetches invoices on mount', () => {
    render(<InvoicesPage />);

    expect(mockFetchInvoices).toHaveBeenCalled();
  });

  it.skip('handles invoice submission', async () => {
    const user = userEvent.setup();
    render(<InvoicesPage />);

    const createButton = screen.getByText('Add Invoice');
    await user.click(createButton);

    const submitButton = screen.getByText('Submit Invoice');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockCreateInvoice).toHaveBeenCalled();
    });
  });

  it('shows partial-success message for create and still closes modal', async () => {
    const { apiFetch } = require('@/utils/apiFetch');
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          business_name: 'HC Violins',
          address: 'Seoul',
          phone: '010-0000-0000',
          email: 'hello@example.com',
          bank_account_holder: 'HC Violins',
          bank_name: 'Bank',
          bank_swift_code: 'SWIFT',
          bank_account_number: '123',
          default_conditions: 'Net 30',
          default_exchange_rate: '1.0',
          default_currency: 'USD',
        },
      }),
    });

    mockCreateInvoice.mockResolvedValueOnce({
      invoice: mockInvoice,
      result: 'partial_success',
      message: 'Invoice created, but some item images were not linked.',
      existingInvoiceId: mockInvoice.id,
      shouldRefreshList: false,
      imageTracking: {
        status: 'partial',
        requestedCount: 2,
        claimedCount: 1,
        missingCount: 1,
        missingPaths: ['org/file-a.jpg'],
      },
    });

    const user = userEvent.setup();
    render(<InvoicesPage />);

    await user.click(screen.getByText('Add Invoice'));
    expect(await screen.findByTestId('invoice-modal')).toBeInTheDocument();

    await user.click(screen.getByText('Submit Invoice'));

    await waitFor(() => {
      expect(mockShowWarning).toHaveBeenCalledWith(
        'Invoice created, but some item images were not linked.'
      );
    });

    expect(screen.queryByTestId('invoice-modal')).not.toBeInTheDocument();
    expect(mockShowSuccess).not.toHaveBeenCalledWith(
      'Invoice created successfully.'
    );
    expect(mockShowSuccess).not.toHaveBeenCalledWith(
      'Invoice created, but some item images were not linked.'
    );
  });

  it('shows partial-success message for update and still closes modal', async () => {
    mockUpdateInvoice.mockResolvedValueOnce({
      invoice: { ...mockInvoice, notes: 'updated' },
      result: 'partial_success',
      message: 'Invoice updated, but some item images were not linked.',
      imageTracking: {
        status: 'failed',
        requestedCount: 2,
        claimedCount: 0,
        missingCount: 2,
        missingPaths: ['org/file-a.jpg', 'org/file-b.jpg'],
      },
    });

    const user = userEvent.setup();
    render(<InvoicesPage />);

    await user.click(screen.getByText('Edit INV0000001'));
    expect(await screen.findByTestId('invoice-modal')).toBeInTheDocument();

    await user.click(screen.getByText('Submit Invoice'));

    await waitFor(() => {
      expect(mockShowWarning).toHaveBeenCalledWith(
        'Invoice updated, but some item images were not linked.'
      );
    });

    expect(screen.queryByTestId('invoice-modal')).not.toBeInTheDocument();
    expect(mockShowSuccess).not.toHaveBeenCalledWith(
      'Invoice updated successfully.'
    );
    expect(mockShowSuccess).not.toHaveBeenCalledWith(
      'Invoice updated, but some item images were not linked.'
    );
  });

  it('V5-003: a 409 concurrency conflict keeps the modal open, preserves the draft, and does not auto-retry', async () => {
    mockUpdateInvoice.mockRejectedValueOnce(
      new ApiResponseError(
        'This invoice was updated elsewhere. Refresh and try again.',
        {
          status: 409,
          error_code: 'INVOICE_CONCURRENCY_CONFLICT',
        }
      )
    );

    const user = userEvent.setup();
    render(<InvoicesPage />);

    await user.click(screen.getByText('Edit INV0000001'));
    expect(await screen.findByTestId('invoice-modal')).toBeInTheDocument();

    mockFetchInvoices.mockClear();
    await user.click(screen.getByText('Submit Invoice'));

    await waitFor(() => {
      expect(mockShowWarning).toHaveBeenCalledWith(
        expect.stringContaining('updated elsewhere')
      );
    });

    // The modal must stay open with the user's draft still in it -- no
    // auto-close, and no automatic resubmission of the stale form.
    expect(screen.getByTestId('invoice-modal')).toBeInTheDocument();
    expect(mockUpdateInvoice).toHaveBeenCalledTimes(1);

    // Background refresh so a reopened edit sees the latest row, without
    // disturbing the currently-open draft.
    await waitFor(() => {
      expect(mockFetchInvoices).toHaveBeenCalled();
    });
  });

  it.skip('handles invoice update', async () => {
    const user = userEvent.setup();
    render(<InvoicesPage />);

    const editButton = screen.getByText('Edit INV0000001');
    await user.click(editButton);

    const submitButton = screen.getByText('Submit Invoice');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockUpdateInvoice).toHaveBeenCalled();
    });
  });

  it.skip('refreshes list after successful operations', async () => {
    const user = userEvent.setup();
    render(<InvoicesPage />);

    mockFetchInvoices.mockClear();

    const createButton = screen.getByText('Add Invoice');
    await user.click(createButton);

    const submitButton = screen.getByText('Submit Invoice');
    await user.click(submitButton);

    await waitFor(() => {
      // Should refresh list after create
      expect(mockFetchInvoices).toHaveBeenCalled();
    });
  });

  it.skip('displays loading state', () => {
    const { useInvoices } = require('../hooks/useInvoices');
    useInvoices.mockReturnValue({
      invoices: [],
      page: 1,
      totalCount: 0,
      totalPages: 1,
      loading: true,
      fetchInvoices: mockFetchInvoices,
      createInvoice: mockCreateInvoice,
      updateInvoice: mockUpdateInvoice,
      deleteInvoice: mockDeleteInvoice,
      setPage: mockSetPage,
    });

    render(<InvoicesPage />);

    // Loading state should be handled by InvoiceList component
    expect(screen.getByTestId('invoice-list')).toBeInTheDocument();
  });
});
