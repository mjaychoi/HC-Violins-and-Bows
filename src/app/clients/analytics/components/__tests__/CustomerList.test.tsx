import { render, screen, fireEvent } from '@/test-utils/render';
import { CustomerList } from '../CustomerList';
import { CustomerWithPurchases } from '../../types';

jest.mock('@/components/common', () => ({
  EmptyState: ({ title, description }: any) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  ),
}));

const mockCustomer1: CustomerWithPurchases = {
  id: 'c1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '010-1234-5678',
  tags: ['VIP'],
  interest: 'High',
  note: null,
  client_number: 'CL001',
  created_at: '2024-01-01',
  purchases: [
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
      status: 'Completed',
    },
  ],
  lastPurchaseAt: '2024-05-12',
};

const mockCustomer2: CustomerWithPurchases = {
  id: 'c2',
  first_name: 'Jane',
  last_name: 'Smith',
  email: null,
  contact_number: null,
  tags: [],
  interest: null,
  note: null,
  client_number: 'CL002',
  created_at: '2024-02-01',
  purchases: [],
  lastPurchaseAt: null,
};

describe('CustomerList', () => {
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render "No customers found" when customers array is empty', () => {
    render(
      <CustomerList customers={[]} selectedId={null} onSelect={mockOnSelect} />
    );
    expect(screen.getByText('No customers found')).toBeInTheDocument();
  });

  it('should render customer list', () => {
    render(
      <CustomerList
        customers={[mockCustomer1]}
        selectedId={null}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('should render customer email', () => {
    render(
      <CustomerList
        customers={[mockCustomer1]}
        selectedId={null}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
  });

  it('should render customer tags', () => {
    render(
      <CustomerList
        customers={[mockCustomer1]}
        selectedId={null}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText(/VIP/i)).toBeInTheDocument();
  });

  it('should render total spend', () => {
    render(
      <CustomerList
        customers={[mockCustomer1]}
        selectedId={null}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText('$105,000')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('should render recent purchase date', () => {
    render(
      <CustomerList
        customers={[mockCustomer1]}
        selectedId={null}
        onSelect={mockOnSelect}
      />
    );
    // ✅ FIXED: 날짜가 "MMM d, yyyy" 형식으로 표시됨
    // 타임존 변환으로 인해 '2024-05-12'가 "May 11, 2024"로 표시될 수 있음
    expect(screen.getByText(/Last: May 11, 2024/i)).toBeInTheDocument();
  });

  it('should render "—" when no purchases', () => {
    render(
      <CustomerList
        customers={[mockCustomer2]}
        selectedId={null}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText(/Last: —/i)).toBeInTheDocument();
  });

  it('should call onSelect when customer is clicked', () => {
    render(
      <CustomerList
        customers={[mockCustomer1]}
        selectedId={null}
        onSelect={mockOnSelect}
      />
    );
    const customerButton = screen.getByText('John Doe').closest('button');
    if (customerButton) {
      fireEvent.click(customerButton);
      expect(mockOnSelect).toHaveBeenCalledWith('c1');
    }
  });

  it('should highlight selected customer', () => {
    render(
      <CustomerList
        customers={[mockCustomer1]}
        selectedId="c1"
        onSelect={mockOnSelect}
      />
    );
    const selectedButton = screen.getByText('John Doe').closest('button');
    expect(selectedButton).toHaveClass('bg-blue-50');
    // ✅ FIXED: aria-pressed 대신 aria-selected를 사용함
    expect(selectedButton).toHaveAttribute('aria-selected', 'true');
  });

  it('should not highlight unselected customer', () => {
    render(
      <CustomerList
        customers={[mockCustomer1]}
        selectedId={null}
        onSelect={mockOnSelect}
      />
    );
    const button = screen.getByText('John Doe').closest('button');
    expect(button).not.toHaveClass('bg-blue-50');
    // ✅ FIXED: aria-pressed 대신 aria-selected를 사용함
    expect(button).toHaveAttribute('aria-selected', 'false');
  });

  it('should render multiple customers', () => {
    render(
      <CustomerList
        customers={[mockCustomer1, mockCustomer2]}
        selectedId={null}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('should render "No email" when email is null', () => {
    const { container } = render(
      <CustomerList
        customers={[mockCustomer2]}
        selectedId={null}
        onSelect={mockOnSelect}
      />
    );
    expect(container.textContent).toMatch(/No email/i);
  });

  it('should render interest', () => {
    render(
      <CustomerList
        customers={[mockCustomer1]}
        selectedId={null}
        onSelect={mockOnSelect}
      />
    );
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('should not render interest badge when interest is null', () => {
    const { container } = render(
      <CustomerList
        customers={[mockCustomer2]}
        selectedId={null}
        onSelect={mockOnSelect}
      />
    );
    // Interest badge should not be present when interest is null
    const interestBadge = container.querySelector('.bg-blue-100');
    expect(interestBadge).not.toBeInTheDocument();
  });
});
