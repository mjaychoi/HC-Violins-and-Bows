import '@testing-library/jest-dom';
import { render, screen } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import SalesFilters from '../SalesFilters';

// Mock getDateRangeFromPreset - use the same import path as the component
jest.mock('../../utils/salesUtils', () => ({
  ...jest.requireActual('../../utils/salesUtils'),
  getDateRangeFromPreset: jest.fn(preset => {
    // Use actual implementation but we can spy on it if needed
    // For now, just use a simple mock that returns predictable dates
    const todayStr = '2024-01-15';
    const presets: Record<string, { from: string; to: string }> = {
      last7: { from: '2024-01-08', to: todayStr },
      thisMonth: { from: '2024-01-01', to: todayStr },
      lastMonth: { from: '2023-12-01', to: '2023-12-31' },
      last3Months: { from: '2023-10-01', to: todayStr },
      last12Months: { from: '2023-01-01', to: todayStr },
    };
    return presets[preset] || { from: '', to: '' };
  }),
}));

describe('SalesFilters', () => {
  const mockOnToggleFilters = jest.fn();
  const mockOnSearchChange = jest.fn();
  const mockOnFromChange = jest.fn();
  const mockOnToChange = jest.fn();
  const mockOnDatePreset = jest.fn();
  const mockOnClearFilters = jest.fn();
  const mockOnExportCSV = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders filters toggle button', () => {
    render(
      <SalesFilters
        showFilters={false}
        onToggleFilters={mockOnToggleFilters}
        search=""
        onSearchChange={mockOnSearchChange}
        from=""
        onFromChange={mockOnFromChange}
        to=""
        onToChange={mockOnToChange}
        onDatePreset={mockOnDatePreset}
        onClearFilters={mockOnClearFilters}
        onExportCSV={mockOnExportCSV}
        hasData={true}
      />
    );

    expect(screen.getByText('Filters & Search')).toBeInTheDocument();
  });

  it('calls onToggleFilters when button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SalesFilters
        showFilters={false}
        onToggleFilters={mockOnToggleFilters}
        search=""
        onSearchChange={mockOnSearchChange}
        from=""
        onFromChange={mockOnFromChange}
        to=""
        onToChange={mockOnToChange}
        onDatePreset={mockOnDatePreset}
        onClearFilters={mockOnClearFilters}
        onExportCSV={mockOnExportCSV}
        hasData={true}
      />
    );

    const toggleButton = screen.getByText('Filters & Search').closest('button');
    if (toggleButton) {
      await user.click(toggleButton);
      expect(mockOnToggleFilters).toHaveBeenCalled();
    }
  });

  it('shows filters panel when showFilters is true', () => {
    render(
      <SalesFilters
        showFilters={true}
        onToggleFilters={mockOnToggleFilters}
        search=""
        onSearchChange={mockOnSearchChange}
        from=""
        onFromChange={mockOnFromChange}
        to=""
        onToChange={mockOnToChange}
        onDatePreset={mockOnDatePreset}
        onClearFilters={mockOnClearFilters}
        onExportCSV={mockOnExportCSV}
        hasData={true}
      />
    );

    expect(
      screen.getByPlaceholderText('Search sales (client, instrument, notes)...')
    ).toBeInTheDocument();
    expect(screen.getByText('All time')).toBeInTheDocument();
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
  });

  it('calls onSearchChange when search input changes', async () => {
    const user = userEvent.setup();
    render(
      <SalesFilters
        showFilters={true}
        onToggleFilters={mockOnToggleFilters}
        search=""
        onSearchChange={mockOnSearchChange}
        from=""
        onFromChange={mockOnFromChange}
        to=""
        onToChange={mockOnToChange}
        onDatePreset={mockOnDatePreset}
        onClearFilters={mockOnClearFilters}
        onExportCSV={mockOnExportCSV}
        hasData={true}
      />
    );

    const searchInput = screen.getByPlaceholderText(
      'Search sales (client, instrument, notes)...'
    );
    await user.type(searchInput, 'test');
    expect(mockOnSearchChange).toHaveBeenCalled();
  });

  it('calls onDatePreset when preset button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SalesFilters
        showFilters={true}
        onToggleFilters={mockOnToggleFilters}
        search=""
        onSearchChange={mockOnSearchChange}
        from=""
        onFromChange={mockOnFromChange}
        to=""
        onToChange={mockOnToChange}
        onDatePreset={mockOnDatePreset}
        onClearFilters={mockOnClearFilters}
        onExportCSV={mockOnExportCSV}
        hasData={true}
      />
    );

    const last7Button = screen.getByText('Last 7 days');
    await user.click(last7Button);
    expect(mockOnDatePreset).toHaveBeenCalledWith('last7');
  });

  it('calls onClearFilters when clear filters button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SalesFilters
        showFilters={true}
        onToggleFilters={mockOnToggleFilters}
        search="test"
        onSearchChange={mockOnSearchChange}
        from="2024-01-01"
        onFromChange={mockOnFromChange}
        to="2024-01-31"
        onToChange={mockOnToChange}
        onDatePreset={mockOnDatePreset}
        onClearFilters={mockOnClearFilters}
        onExportCSV={mockOnExportCSV}
        hasData={true}
      />
    );

    const clearButton = screen.getByText('Clear filters');
    await user.click(clearButton);
    expect(mockOnClearFilters).toHaveBeenCalled();
  });

  it('shows clear filters button when filters are active', () => {
    render(
      <SalesFilters
        showFilters={false}
        onToggleFilters={mockOnToggleFilters}
        search="test"
        onSearchChange={mockOnSearchChange}
        from=""
        onFromChange={mockOnFromChange}
        to=""
        onToChange={mockOnToChange}
        onDatePreset={mockOnDatePreset}
        onClearFilters={mockOnClearFilters}
        onExportCSV={mockOnExportCSV}
        hasData={true}
      />
    );

    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('does not show clear filters button when no filters are active', () => {
    render(
      <SalesFilters
        showFilters={false}
        onToggleFilters={mockOnToggleFilters}
        search=""
        onSearchChange={mockOnSearchChange}
        from=""
        onFromChange={mockOnFromChange}
        to=""
        onToChange={mockOnToChange}
        onDatePreset={mockOnDatePreset}
        onClearFilters={mockOnClearFilters}
        onExportCSV={mockOnExportCSV}
        hasData={true}
      />
    );

    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
  });

  it('calls onFromChange when from date changes', async () => {
    const user = userEvent.setup();
    render(
      <SalesFilters
        showFilters={true}
        onToggleFilters={mockOnToggleFilters}
        search=""
        onSearchChange={mockOnSearchChange}
        from=""
        onFromChange={mockOnFromChange}
        to=""
        onToChange={mockOnToChange}
        onDatePreset={mockOnDatePreset}
        onClearFilters={mockOnClearFilters}
        onExportCSV={mockOnExportCSV}
        hasData={true}
      />
    );

    const fromInput = screen.getByLabelText('From date');
    await user.type(fromInput, '2024-01-01');
    expect(mockOnFromChange).toHaveBeenCalled();
  });

  it('calls onToChange when to date changes', async () => {
    const user = userEvent.setup();
    render(
      <SalesFilters
        showFilters={true}
        onToggleFilters={mockOnToggleFilters}
        search=""
        onSearchChange={mockOnSearchChange}
        from=""
        onFromChange={mockOnFromChange}
        to=""
        onToChange={mockOnToChange}
        onDatePreset={mockOnDatePreset}
        onClearFilters={mockOnClearFilters}
        onExportCSV={mockOnExportCSV}
        hasData={true}
      />
    );

    const toInput = screen.getByLabelText('To date');
    await user.type(toInput, '2024-01-31');
    expect(mockOnToChange).toHaveBeenCalled();
  });

  it('calls onExportCSV when export button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SalesFilters
        showFilters={true}
        onToggleFilters={mockOnToggleFilters}
        search=""
        onSearchChange={mockOnSearchChange}
        from=""
        onFromChange={mockOnFromChange}
        to=""
        onToChange={mockOnToChange}
        onDatePreset={mockOnDatePreset}
        onClearFilters={mockOnClearFilters}
        onExportCSV={mockOnExportCSV}
        hasData={true}
      />
    );

    const exportButton = screen.getByText('Export CSV');
    await user.click(exportButton);
    expect(mockOnExportCSV).toHaveBeenCalled();
  });

  it('disables export button when hasData is false', () => {
    render(
      <SalesFilters
        showFilters={true}
        onToggleFilters={mockOnToggleFilters}
        search=""
        onSearchChange={mockOnSearchChange}
        from=""
        onFromChange={mockOnFromChange}
        to=""
        onToChange={mockOnToChange}
        onDatePreset={mockOnDatePreset}
        onClearFilters={mockOnClearFilters}
        onExportCSV={mockOnExportCSV}
        hasData={false}
      />
    );

    const exportButton = screen.getByText('Export CSV').closest('button');
    expect(exportButton).toBeDisabled();
  });

  it('highlights active preset button', () => {
    render(
      <SalesFilters
        showFilters={true}
        onToggleFilters={mockOnToggleFilters}
        search=""
        onSearchChange={mockOnSearchChange}
        from="2024-01-08"
        onFromChange={mockOnFromChange}
        to="2024-01-15"
        onToChange={mockOnToChange}
        onDatePreset={mockOnDatePreset}
        onClearFilters={mockOnClearFilters}
        onExportCSV={mockOnExportCSV}
        hasData={true}
      />
    );

    const last7Button = screen.getByText('Last 7 days').closest('button');
    expect(last7Button).toHaveClass('bg-blue-100');
  });
});
