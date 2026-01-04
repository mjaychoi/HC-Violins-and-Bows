import { render, screen, fireEvent } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import InvoiceFilters from '../InvoiceFilters';
import type { InvoiceStatus } from '../InvoiceFilters';

describe('InvoiceFilters', () => {
  const mockOnSearchChange = jest.fn();
  const mockOnFromDateChange = jest.fn();
  const mockOnToDateChange = jest.fn();
  const mockOnStatusChange = jest.fn();
  const mockOnClearFilters = jest.fn();

  const baseProps = {
    search: '',
    onSearchChange: mockOnSearchChange,
    fromDate: '',
    onFromDateChange: mockOnFromDateChange,
    toDate: '',
    onToDateChange: mockOnToDateChange,
    status: '' as InvoiceStatus,
    onStatusChange: mockOnStatusChange,
    onClearFilters: mockOnClearFilters,
    hasActiveFilters: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all filter inputs', () => {
    render(<InvoiceFilters {...baseProps} />);

    expect(
      screen.getByPlaceholderText(/search by invoice number/i)
    ).toBeInTheDocument();
    // ✅ 변경: date input에는 placeholder가 없고 aria-label만 있음
    expect(screen.getByLabelText('From date')).toBeInTheDocument();
    expect(screen.getByLabelText('To date')).toBeInTheDocument();
    expect(screen.getByDisplayValue('All Status')).toBeInTheDocument();
  });

  it('handles search input change', async () => {
    const user = userEvent.setup();
    render(<InvoiceFilters {...baseProps} />);

    const searchInput = screen.getByPlaceholderText(
      /search by invoice number/i
    );
    await user.type(searchInput, 'INV001');

    expect(mockOnSearchChange).toHaveBeenCalled();
  });

  it('handles from date change', async () => {
    const user = userEvent.setup();
    render(<InvoiceFilters {...baseProps} />);

    // ✅ 변경: aria-label 사용
    const fromDateInput = screen.getByLabelText('From date');
    await user.type(fromDateInput, '2024-01-01');

    expect(mockOnFromDateChange).toHaveBeenCalled();
  });

  it('handles to date change', async () => {
    const user = userEvent.setup();
    render(<InvoiceFilters {...baseProps} />);

    // ✅ 변경: aria-label 사용
    const toDateInput = screen.getByLabelText('To date');
    await user.type(toDateInput, '2024-01-31');

    expect(mockOnToDateChange).toHaveBeenCalled();
  });

  it('handles status change', async () => {
    const user = userEvent.setup();
    render(<InvoiceFilters {...baseProps} />);

    const statusSelect = screen.getByDisplayValue('All Status');
    await user.selectOptions(statusSelect, 'paid');

    expect(mockOnStatusChange).toHaveBeenCalledWith('paid');
  });

  it('displays clear filters button when filters are active', () => {
    render(<InvoiceFilters {...baseProps} hasActiveFilters={true} />);

    expect(screen.getByText('Clear Filters')).toBeInTheDocument();
  });

  it('does not display clear filters button when no filters are active', () => {
    render(<InvoiceFilters {...baseProps} hasActiveFilters={false} />);

    expect(screen.queryByText('Clear Filters')).not.toBeInTheDocument();
  });

  it('calls onClearFilters when clear button is clicked', () => {
    render(<InvoiceFilters {...baseProps} hasActiveFilters={true} />);

    const clearButton = screen.getByText('Clear Filters');
    fireEvent.click(clearButton);

    expect(mockOnClearFilters).toHaveBeenCalled();
  });

  it('displays current search value', () => {
    render(<InvoiceFilters {...baseProps} search="INV001" />);

    const searchInput = screen.getByPlaceholderText(
      /search by invoice number/i
    ) as HTMLInputElement;
    expect(searchInput.value).toBe('INV001');
  });

  it('displays current date values', () => {
    render(
      <InvoiceFilters
        {...baseProps}
        fromDate="2024-01-01"
        toDate="2024-01-31"
      />
    );

    // ✅ 변경: aria-label 사용
    const fromDateInput = screen.getByLabelText(
      'From date'
    ) as HTMLInputElement;
    const toDateInput = screen.getByLabelText('To date') as HTMLInputElement;

    expect(fromDateInput.value).toBe('2024-01-01');
    expect(toDateInput.value).toBe('2024-01-31');
  });

  it('displays current status value', () => {
    render(<InvoiceFilters {...baseProps} status="paid" />);

    const statusSelect = screen.getByDisplayValue('Paid') as HTMLSelectElement;
    expect(statusSelect.value).toBe('paid');
  });

  it('renders all status options', () => {
    render(<InvoiceFilters {...baseProps} />);

    const statusSelect = screen.getByDisplayValue(
      'All Status'
    ) as HTMLSelectElement;
    const options = Array.from(statusSelect.options).map(
      option => option.value
    );

    expect(options).toContain('');
    expect(options).toContain('draft');
    expect(options).toContain('sent');
    expect(options).toContain('paid');
    expect(options).toContain('overdue');
    expect(options).toContain('cancelled');
  });

  it('has proper accessibility attributes', () => {
    render(<InvoiceFilters {...baseProps} />);

    const searchInput = screen.getByPlaceholderText(
      /search by invoice number/i
    );
    expect(searchInput).toHaveAttribute('type', 'text');

    // ✅ 변경: aria-label 사용
    const fromDateInput = screen.getByLabelText('From date');
    expect(fromDateInput).toHaveAttribute('type', 'date');

    const toDateInput = screen.getByLabelText('To date');
    expect(toDateInput).toHaveAttribute('type', 'date');
  });

  it('renders filters in responsive layout', () => {
    const { container } = render(<InvoiceFilters {...baseProps} />);

    const filterContainer = container.querySelector(
      '.rounded-lg.border-gray-200.bg-white'
    );
    expect(filterContainer).toBeInTheDocument();
    expect(filterContainer).toHaveClass('flex');
    expect(filterContainer).toHaveClass('flex-wrap');
  });
});
