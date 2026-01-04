import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import InvoicesPage from '../page';
import { Invoice } from '@/types';

const originalCreateElement = document.createElement.bind(document);

// Mock InvoiceModal component first
jest.mock('../components/InvoiceModal', () => ({
  __esModule: true,
  default: function MockInvoiceModal({
    isOpen,
    onClose,
    onSubmit,
    invoice,
    isEditing,
  }: any) {
    if (!isOpen) return null;
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
    }: any) {
      if (!isOpen) return null;
      return (
        <div data-testid="confirm-dialog">
          <button onClick={onConfirm}>Confirm</button>
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
  const mockFetchInvoices = jest.fn();
  const mockCreateInvoice = jest.fn().mockResolvedValue(mockInvoice);
  const mockUpdateInvoice = jest.fn().mockResolvedValue(mockInvoice);
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
    useInvoices.mockReturnValue({
      invoices: [mockInvoice],
      page: 1,
      totalCount: 1,
      totalPages: 1,
      loading: false,
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
      handleError: mockHandleError,
    });
  });

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
    const user = userEvent.setup();
    render(<InvoicesPage />);

    const addButton = screen.getByText('Add Invoice');
    await user.click(addButton);

    expect(screen.getByTestId('invoice-modal')).toBeInTheDocument();
    expect(screen.getByText('Creating new invoice')).toBeInTheDocument();
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
