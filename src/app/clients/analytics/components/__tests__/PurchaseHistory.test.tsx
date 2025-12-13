import { render, screen, fireEvent } from '@testing-library/react';
import { PurchaseHistory } from '../PurchaseHistory';
import { Purchase } from '../../types';

const mockPurchases: Purchase[] = [
  {
    id: 'p1',
    item: 'Violin',
    amount: 100000,
    date: '2024-04-01',
    status: 'Completed',
  },
  {
    id: 'p2',
    item: 'Bow',
    amount: 5000,
    date: '2024-05-12',
    status: 'Pending',
  },
  {
    id: 'p3',
    item: 'Cello',
    amount: 50000,
    date: '2024-06-01',
    status: 'Completed',
  },
];

describe('PurchaseHistory', () => {
  const mockOnStatusFilterChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render purchase history header', () => {
    render(
      <PurchaseHistory
        purchases={mockPurchases}
        statusFilter="All"
        onStatusFilterChange={mockOnStatusFilterChange}
      />
    );
    expect(screen.getByText('Purchase History')).toBeInTheDocument();
  });

  it('should render all purchases when filter is "All"', () => {
    render(
      <PurchaseHistory
        purchases={mockPurchases}
        statusFilter="All"
        onStatusFilterChange={mockOnStatusFilterChange}
      />
    );
    expect(screen.getByText('Violin')).toBeInTheDocument();
    expect(screen.getByText('Bow')).toBeInTheDocument();
    expect(screen.getByText('Cello')).toBeInTheDocument();
  });

  it('should filter purchases by status', () => {
    render(
      <PurchaseHistory
        purchases={mockPurchases}
        statusFilter="Completed"
        onStatusFilterChange={mockOnStatusFilterChange}
      />
    );
    expect(screen.getByText('Violin')).toBeInTheDocument();
    expect(screen.getByText('Cello')).toBeInTheDocument();
    expect(screen.queryByText('Bow')).not.toBeInTheDocument();
  });

  it('should filter purchases by Pending status', () => {
    render(
      <PurchaseHistory
        purchases={mockPurchases}
        statusFilter="Pending"
        onStatusFilterChange={mockOnStatusFilterChange}
      />
    );
    expect(screen.getByText('Bow')).toBeInTheDocument();
    expect(screen.queryByText('Violin')).not.toBeInTheDocument();
    expect(screen.queryByText('Cello')).not.toBeInTheDocument();
  });

  it('should display purchase details', () => {
    const { container } = render(
      <PurchaseHistory
        purchases={mockPurchases}
        statusFilter="All"
        onStatusFilterChange={mockOnStatusFilterChange}
      />
    );
    expect(screen.getByText('Violin')).toBeInTheDocument();
    expect(screen.getByText('2024-04-01')).toBeInTheDocument();
    const completedBadges = screen.getAllByText('Completed');
    expect(completedBadges.length).toBeGreaterThan(0);
    expect(container.textContent).toContain('$100,000');
  });

  it('should call onStatusFilterChange when filter is changed', () => {
    render(
      <PurchaseHistory
        purchases={mockPurchases}
        statusFilter="All"
        onStatusFilterChange={mockOnStatusFilterChange}
      />
    );
    const select = screen.getByDisplayValue('All');
    fireEvent.change(select, { target: { value: 'Completed' } });
    expect(mockOnStatusFilterChange).toHaveBeenCalledWith('Completed');
  });

  it('should display "No purchases" when filtered list is empty', () => {
    render(
      <PurchaseHistory
        purchases={mockPurchases}
        statusFilter="Refunded"
        onStatusFilterChange={mockOnStatusFilterChange}
      />
    );
    expect(screen.getByText('No purchases')).toBeInTheDocument();
  });

  it('should display "No purchases" when purchases array is empty', () => {
    render(
      <PurchaseHistory
        purchases={[]}
        statusFilter="All"
        onStatusFilterChange={mockOnStatusFilterChange}
      />
    );
    expect(screen.getByText('No purchases')).toBeInTheDocument();
  });

  it('should render all status filter options', () => {
    render(
      <PurchaseHistory
        purchases={mockPurchases}
        statusFilter="All"
        onStatusFilterChange={mockOnStatusFilterChange}
      />
    );
    const select = screen.getByDisplayValue('All');
    expect(select.querySelector('option[value="All"]')).toBeInTheDocument();
    expect(
      select.querySelector('option[value="Completed"]')
    ).toBeInTheDocument();
    expect(select.querySelector('option[value="Pending"]')).toBeInTheDocument();
    expect(
      select.querySelector('option[value="Refunded"]')
    ).toBeInTheDocument();
  });

  it('should format currency correctly', () => {
    const { container } = render(
      <PurchaseHistory
        purchases={mockPurchases}
        statusFilter="All"
        onStatusFilterChange={mockOnStatusFilterChange}
      />
    );
    expect(container.textContent).toContain('$100,000');
    expect(container.textContent).toContain('$5,000');
    expect(container.textContent).toContain('$50,000');
  });

  it('should display status badges', () => {
    render(
      <PurchaseHistory
        purchases={mockPurchases}
        statusFilter="All"
        onStatusFilterChange={mockOnStatusFilterChange}
      />
    );
    const completedBadges = screen.getAllByText('Completed');
    expect(completedBadges.length).toBeGreaterThan(0);
    const pendingBadges = screen.getAllByText('Pending');
    expect(pendingBadges.length).toBeGreaterThan(0);
  });
});
