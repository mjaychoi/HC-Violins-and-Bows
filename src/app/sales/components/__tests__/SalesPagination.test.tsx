import '@testing-library/jest-dom';
import { render, screen } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import SalesPagination from '../SalesPagination';

const normalizeText = (text?: string | null) =>
  text ? text.replace(/\s+/g, ' ').trim() : '';

describe('SalesPagination', () => {
  const mockOnPageChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders pagination controls', () => {
    render(
      <SalesPagination
        page={1}
        totalPages={5}
        totalCount={50}
        filteredCount={50}
        loading={false}
        hasFilters={false}
        onPageChange={mockOnPageChange}
      />
    );

    // Text is split across multiple elements, so check for parts
    expect(screen.getByText(/Page 1 of 5/)).toBeInTheDocument();
    expect(screen.getByText(/50 records/)).toBeInTheDocument();
  });

  it('displays filtered count when filters are active', () => {
    const { container } = render(
      <SalesPagination
        page={1}
        totalPages={3}
        totalCount={50}
        filteredCount={15}
        loading={false}
        hasFilters={true}
        onPageChange={mockOnPageChange}
      />
    );

    const summary = container.querySelector('div');
    expect(summary).toBeInTheDocument();
    expect(normalizeText(summary?.textContent)).toContain(
      'Showing 15 of 50 records'
    );
    expect(screen.getByText('(filtered)')).toBeInTheDocument();
  });

  it('does not show filtered label when filteredCount equals totalCount', () => {
    render(
      <SalesPagination
        page={1}
        totalPages={5}
        totalCount={50}
        filteredCount={50}
        loading={false}
        hasFilters={true}
        onPageChange={mockOnPageChange}
      />
    );

    expect(screen.queryByText('(filtered)')).not.toBeInTheDocument();
  });

  it('displays singular "record" for count of 1', () => {
    render(
      <SalesPagination
        page={1}
        totalPages={1}
        totalCount={1}
        filteredCount={1}
        loading={false}
        hasFilters={false}
        onPageChange={mockOnPageChange}
      />
    );

    // Text is split: "Page 1 of 1 · 1 record"
    expect(screen.getByText(/1 record/)).toBeInTheDocument();
  });

  it('calls onPageChange when next button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SalesPagination
        page={2}
        totalPages={5}
        totalCount={50}
        filteredCount={50}
        loading={false}
        hasFilters={false}
        onPageChange={mockOnPageChange}
      />
    );

    const nextButton = screen.getByText('Next');
    await user.click(nextButton);
    expect(mockOnPageChange).toHaveBeenCalledWith(3);
  });

  it('calls onPageChange when prev button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SalesPagination
        page={3}
        totalPages={5}
        totalCount={50}
        filteredCount={50}
        loading={false}
        hasFilters={false}
        onPageChange={mockOnPageChange}
      />
    );

    const prevButton = screen.getByText('Prev');
    await user.click(prevButton);
    expect(mockOnPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange when first page button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SalesPagination
        page={3}
        totalPages={5}
        totalCount={50}
        filteredCount={50}
        loading={false}
        hasFilters={false}
        onPageChange={mockOnPageChange}
      />
    );

    const firstButton = screen.getByTitle('First page');
    await user.click(firstButton);
    expect(mockOnPageChange).toHaveBeenCalledWith(1);
  });

  it('calls onPageChange when last page button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SalesPagination
        page={2}
        totalPages={5}
        totalCount={50}
        filteredCount={50}
        loading={false}
        hasFilters={false}
        onPageChange={mockOnPageChange}
      />
    );

    const lastButton = screen.getByTitle('Last page');
    await user.click(lastButton);
    expect(mockOnPageChange).toHaveBeenCalledWith(5);
  });

  it('disables prev and first buttons on first page', () => {
    render(
      <SalesPagination
        page={1}
        totalPages={5}
        totalCount={50}
        filteredCount={50}
        loading={false}
        hasFilters={false}
        onPageChange={mockOnPageChange}
      />
    );

    const prevButton = screen.getByText('Prev').closest('button');
    const firstButton = screen.getByTitle('First page');
    expect(prevButton).toBeDisabled();
    expect(firstButton).toBeDisabled();
  });

  it('disables next and last buttons on last page', () => {
    render(
      <SalesPagination
        page={5}
        totalPages={5}
        totalCount={50}
        filteredCount={50}
        loading={false}
        hasFilters={false}
        onPageChange={mockOnPageChange}
      />
    );

    const nextButton = screen.getByText('Next').closest('button');
    const lastButton = screen.getByTitle('Last page');
    expect(nextButton).toBeDisabled();
    expect(lastButton).toBeDisabled();
  });

  it('disables all buttons when loading', () => {
    render(
      <SalesPagination
        page={3}
        totalPages={5}
        totalCount={50}
        filteredCount={50}
        loading={true}
        hasFilters={false}
        onPageChange={mockOnPageChange}
      />
    );

    const prevButton = screen.getByText('Prev').closest('button');
    const nextButton = screen.getByText('Next').closest('button');
    expect(prevButton).toBeDisabled();
    expect(nextButton).toBeDisabled();
  });

  it('handles edge case when totalPages is 0', () => {
    const { container } = render(
      <SalesPagination
        page={1}
        totalPages={0}
        totalCount={0}
        filteredCount={0}
        loading={false}
        hasFilters={false}
        onPageChange={mockOnPageChange}
      />
    );

    const summary = container.querySelector('div');
    expect(summary).toBeInTheDocument();
    expect(normalizeText(summary?.textContent)).toContain('Page 1 of 1');
  });

  it('prevents going below page 1 when prev is clicked on page 1', async () => {
    render(
      <SalesPagination
        page={1}
        totalPages={5}
        totalCount={50}
        filteredCount={50}
        loading={false}
        hasFilters={false}
        onPageChange={mockOnPageChange}
      />
    );

    const prevButton = screen.getByText('Prev');
    // Button should be disabled, so clicking won't trigger onPageChange
    // But if it somehow does, it should call with Math.max(1, 1 - 1) = 1
    // Actually, disabled buttons cannot be clicked, so test passes by default
    expect(prevButton.closest('button')).toBeDisabled();
  });

  it('prevents going above totalPages when next is clicked on last page', async () => {
    render(
      <SalesPagination
        page={5}
        totalPages={5}
        totalCount={50}
        filteredCount={50}
        loading={false}
        hasFilters={false}
        onPageChange={mockOnPageChange}
      />
    );

    const nextButton = screen.getByText('Next');
    // Button should be disabled
    expect(nextButton.closest('button')).toBeDisabled();
  });
});
